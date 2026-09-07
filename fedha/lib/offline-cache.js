// Local-first cache + write queue, backed by IndexedDB via the `idb` package.
//
// This is the foundation of offline support: every table Supabase knows
// about also has a mirror store here. Reads are served from this cache
// immediately (no network wait); writes land here immediately too, and are
// queued in PENDING_STORE to be replayed against Supabase as soon as we're
// back online. See lib/sync-engine.js for the half that drains the queue.
//
// This module has no knowledge of *what* a wallet or transaction is —
// lib/db.js still owns all of that domain logic (including the multi-table
// side effects like updating wallet balances). This file only knows how to
// cache arbitrary rows by table+id and queue arbitrary operations.

import { openDB } from 'idb';

const DB_NAME = 'fedha-offline-cache';
const DB_VERSION = 2; // v2: added jarvis_memory, jarvis_conversations
const PENDING_STORE = '_pending_ops';
const META_STORE = '_meta';

// Every Supabase table this app reads/writes through lib/db.js.
export const TABLES = [
  'settings', 'wallets', 'transactions', 'budgets', 'loans', 'goals',
  'income_plans', 'food_logs', 'challenges', 'hackathons', 'startups',
  'projects', 'online_jobs', 'certificates', 'jarvis_memory', 'jarvis_conversations',
];

let dbPromise = null;
function getDb() {
  if (dbPromise) return dbPromise;
  dbPromise = openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      for (const table of TABLES) {
        if (!db.objectStoreNames.contains(table)) {
          db.createObjectStore(table, { keyPath: 'id' });
        }
      }
      if (!db.objectStoreNames.contains(PENDING_STORE)) {
        db.createObjectStore(PENDING_STORE, { keyPath: 'opId', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    },
    // If an older tab/window still has a connection open to the previous
    // schema version, the upgrade can't proceed until it closes — without
    // handling this, the DB connection just hangs (or, in some browsers,
    // resolves against a stale/mid-upgrade state), which is exactly how a
    // "specified object store was not found" error can surface even though
    // the upgrade() callback above looks correct.
    blocked() {
      console.warn('[fedha] IndexedDB upgrade blocked by another open tab — close other tabs/windows running Fedha and reload.');
    },
    blocking() {
      // This connection is the one blocking a newer version from opening
      // elsewhere (e.g. you opened Fedha in a second tab after a deploy).
      // Closing it lets the other tab upgrade cleanly instead of both tabs
      // ending up in an inconsistent state.
      console.warn('[fedha] A newer version of Fedha is open elsewhere — closing this tab\'s database connection.');
      dbPromise?.then((db) => db.close());
      dbPromise = null;
    },
  });
  return dbPromise;
}

// Wraps a store-touching operation so a genuinely missing object store
// (schema mismatch from a stuck upgrade, or an old cached service worker
// still running against a new IndexedDB version) degrades gracefully
// instead of throwing an uncaught error that crashes the whole app. Returns
// `fallback` and logs a clear warning rather than propagating the error.
async function withStoreFallback(fn, fallback) {
  try {
    return await fn();
  } catch (e) {
    if (e?.name === 'NotFoundError' || /object stores? was not found/i.test(e?.message || '')) {
      console.warn('[fedha] IndexedDB store missing (likely a stale schema) — reloading the page usually fixes this:', e.message);
      return fallback;
    }
    throw e;
  }
}

// Settings are keyed by `key` (a string), not `id` like every other table —
// give them a stable synthetic id so they fit the same keyPath: 'id' store.
function settingRowId(key) { return `setting:${key}`; }

// ─── READ / WRITE THE MIRROR CACHE ──────────────────────────────────────────

export async function cacheGetAll(table) {
  return withStoreFallback(async () => {
    const db = await getDb();
    return db.getAll(table);
  }, []);
}

export async function cacheGet(table, id) {
  return withStoreFallback(async () => {
    const db = await getDb();
    return db.get(table, id);
  }, undefined);
}

export async function cachePut(table, row) {
  return withStoreFallback(async () => {
    const db = await getDb();
    await db.put(table, row);
    return row;
  }, row); // still return the row even if the cache write failed, so callers relying on the return value keep working (just without local persistence this time)
}

export async function cachePutMany(table, rows) {
  if (!rows?.length) return;
  await withStoreFallback(async () => {
    const db = await getDb();
    const tx = db.transaction(table, 'readwrite');
    await Promise.all([...rows.map((r) => tx.store.put(r)), tx.done]);
  }, undefined);
}

export async function cacheDelete(table, id) {
  await withStoreFallback(async () => {
    const db = await getDb();
    await db.delete(table, id);
  }, undefined);
}

// Replace the entire local mirror of a table with a fresh set of rows from
// the server. Used after a successful background refetch, so deletions made
// on another device also get reflected locally.
export async function cacheReplaceAll(table, rows) {
  await withStoreFallback(async () => {
    const db = await getDb();
    const tx = db.transaction(table, 'readwrite');
    await tx.store.clear();
    await Promise.all([...rows.map((r) => tx.store.put(r)), tx.done]);
  }, undefined);
}

// ─── SETTINGS (key/value, not a normal row-per-id table) ────────────────────

export async function cacheGetSetting(key) {
  const row = await cacheGet('settings', settingRowId(key));
  return row ? row.value : undefined;
}
export async function cachePutSetting(key, value) {
  return cachePut('settings', { id: settingRowId(key), key, value });
}

// ─── PENDING WRITE QUEUE ─────────────────────────────────────────────────────
// Each entry: { opId, kind: 'upsert' | 'delete', table, id, payload, at }
// kind 'upsert' applies to both inserts and updates, matching Supabase's
// own .upsert() semantics that lib/db.js already relies on everywhere.

export async function enqueueOp(op) {
  return withStoreFallback(async () => {
    const db = await getDb();
    return db.add(PENDING_STORE, { ...op, at: Date.now() });
  }, null);
}

export async function getPendingOps() {
  return withStoreFallback(async () => {
    const db = await getDb();
    return db.getAll(PENDING_STORE);
  }, []);
}

export async function removePendingOp(opId) {
  await withStoreFallback(async () => {
    const db = await getDb();
    await db.delete(PENDING_STORE, opId);
  }, undefined);
}

export async function pendingOpCount() {
  return withStoreFallback(async () => {
    const db = await getDb();
    return db.count(PENDING_STORE);
  }, 0);
}

// ─── SYNC METADATA ───────────────────────────────────────────────────────────
// Tracks when each table was last successfully refreshed from Supabase, so
// the UI can show "last synced" info if useful, and so we don't hammer the
// network on every single render.

export async function getLastSynced(table) {
  const db = await getDb();
  const row = await db.get(META_STORE, `synced:${table}`);
  return row?.at ?? null;
}
export async function setLastSynced(table) {
  const db = await getDb();
  await db.put(META_STORE, { key: `synced:${table}`, at: Date.now() });
}
