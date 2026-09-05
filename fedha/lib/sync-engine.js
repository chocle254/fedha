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

async function applyOp(op) {
  const { kind, table, id, payload, onConflict } = op;
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
