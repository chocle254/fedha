// Drains the pending-write queue (lib/offline-cache.js) against Supabase
// whenever we're online. Runs writes in the order they were made, so a
// sequence like "create wallet, then add a transaction into it" replays
// correctly even if both happened while offline.
//
// This module intentionally knows nothing about wallets/transactions
// specifically — lib/db.js enqueues fully-formed { table, kind, id, payload }
// operations, and this file just replays them via generic upsert/delete
// calls. Domain-specific side effects (wallet balance math, budget spent
// totals) were already computed and cached locally at write time by
// lib/db.js, and are queued as their own separate ops on the relevant
// tables — so replaying the queue in order reproduces the same end state.

import { supabase, isSupabaseEnabled } from './supabase';
import { getPendingOps, removePendingOp, pendingOpCount } from './offline-cache';

let syncing = false;
let listeners = new Set();
let retryTimer = null;

function notify(status) {
  for (const cb of listeners) {
    try { cb(status); } catch {}
  }
}

// Subscribe to sync status changes: 'syncing' | 'idle' | 'error'.
// Returns an unsubscribe function.
export function onSyncStatusChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export async function getPendingCount() {
  return pendingOpCount();
}

// Columns that really exist on the structured tables. Anything else on a
// record (e.g. client_project_id on a client payment) is kept in the local
// cache but stripped before sending — the database rejects unknown columns,
// and one such rejection used to stall the whole sync queue.
// (Matches the live Supabase schema; add a column here if you add one there.)
const TABLE_COLUMNS = {
  transactions: ['id', 'type', 'amount', 'wallet_id', 'to_wallet_id', 'category', 'description', 'date', 'is_impulse', 'currency', 'created_at', 'updated_at', 'user_id', 'synced'],
  wallets: ['id', 'name', 'type', 'balance', 'currency', 'color', 'icon', 'phone_number', 'created_at', 'updated_at', 'user_id', 'synced'],
  budgets: ['id', 'name', 'category', 'allocated', 'spent', 'period', 'created_at', 'updated_at', 'user_id', 'synced'],
  goals: ['id', 'name', 'target', 'current', 'deadline', 'icon', 'color', 'created_at', 'updated_at', 'user_id', 'synced'],
  loans: ['id', 'type', 'contact_name', 'amount', 'remaining', 'due_date', 'notes', 'status', 'created_at', 'updated_at', 'user_id', 'synced', 'settled_txn_id'],
  income_plans: ['id', 'name', 'expected_amount', 'expected_date', 'allocations', 'is_received', 'created_at', 'updated_at', 'user_id', 'synced', 'settled_txn_id'],
};
function sanitize(table, payload) {
  const cols = TABLE_COLUMNS[table];
  if (!cols || !payload || typeof payload !== 'object') return payload;
  return Object.fromEntries(Object.entries(payload).filter(([k]) => cols.includes(k)));
}

async function applyOp(op) {
  const { kind, table, id, onConflict } = op;
  const payload = sanitize(table, op.payload);
  if (kind === 'delete') {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) throw error;
  } else {
    const { error } = onConflict
      ? await supabase.from(table).upsert(payload, { onConflict })
      : await supabase.from(table).upsert(payload);
    if (error) throw error;
  }
}

// Postgres/PostgREST error codes that mean "this exact write can never
// succeed": data exceptions (22…), integrity violations (23…: foreign key,
// not-null, unique, check), undefined column/table (42…), and PostgREST's
// "column not in schema" (PGRST204). Network failures have no code, and
// expired-login errors (PGRST301, 401) are temporary — those still retry.
function isPermanentError(e) {
  const code = String(e?.code || '');
  return /^(22|23|42)/.test(code) || code === 'PGRST204';
}

// Keeps the last 50 rejected writes in this browser so they can be looked
// at later (localStorage, not the synced settings table, to avoid loops).
function rememberRejectedOp(op, e) {
  try {
    const key = 'fedha_rejected_sync_ops';
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    list.unshift({ at: new Date().toISOString(), table: op.table, kind: op.kind, id: op.id, code: e?.code, message: e?.message });
    localStorage.setItem(key, JSON.stringify(list.slice(0, 50)));
  } catch {}
}

// Drains the queue front-to-back. Stops at the first failure (leaving it
// and everything after it queued) rather than skipping ahead — a later op
// might depend on an earlier one having landed (e.g. a transaction
// referencing a wallet_id that was itself just created offline).
export async function flushPendingOps() {
  if (syncing) return;
  if (!isSupabaseEnabled() || typeof navigator !== 'undefined' && !navigator.onLine) return;

  syncing = true;
  notify('syncing');
  try {
    const ops = await getPendingOps();
    ops.sort((a, b) => a.opId - b.opId);
    for (const op of ops) {
      try {
        await applyOp(op);
        await removePendingOp(op.opId);
      } catch (e) {
        if (isPermanentError(e)) {
          // The database will never accept this one (e.g. deleting a wallet
          // that transactions still point to, or a field the table doesn't
          // have). Retrying it forever used to block EVERY later change from
          // syncing. Set it aside and keep going.
          console.error('[fedha] sync op rejected permanently, setting aside:', op.table, op.kind, e?.code, e?.message);
          rememberRejectedOp(op, e);
          await removePendingOp(op.opId);
          continue;
        }
        console.error('[fedha] sync failed for op, will retry later:', op.table, op.kind, e?.message);
        notify('error');
        scheduleRetry();
        return; // stop here; leave this op and later ones queued for next attempt
      }
    }
    notify('idle');
  } finally {
    syncing = false;
  }
}

function scheduleRetry() {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    flushPendingOps();
  }, 15000); // back off 15s before trying the same failed op again
}

let started = false;
export function startSyncEngine() {
  if (started || typeof window === 'undefined') return;
  started = true;

  window.addEventListener('online', flushPendingOps);
  // Also try periodically in case 'online' doesn't fire reliably (some
  // browsers/OSes are inconsistent about it) and on first load in case
  // ops were queued in a previous session and we're already online.
  flushPendingOps();
  setInterval(flushPendingOps, 30000);
}
