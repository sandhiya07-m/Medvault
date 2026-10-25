// Background delta-sync engine: push queued local changes, then pull server changes since the cursor.
import { useSyncExternalStore } from 'react';
import * as store from './store.js';
import { api } from './api.js';
import { getMeta, setMeta, deviceId } from './db.js';

let ctx = null; // { db, getToken }
let running = false;
let failures = 0;
let timers = { interval: null, retry: null, debounce: null };
let unsubStore = null;
let listeners = new Set();
let state = {
  active: false, online: typeof navigator === 'undefined' ? true : navigator.onLine,
  syncing: false, pending: 0, lastSync: null, error: null, authExpired: false,
  rejected: [], conflicts: [], cursor: 0,
};

const setState = (patch) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
export const useSyncState = () => useSyncExternalStore(subscribe, () => state);
export const getSyncState = () => state;

async function refreshPending() {
  if (!ctx) return;
  try { setState({ pending: await store.pendingCount() }); } catch { /* db closed */ }
}

const onOnline = () => { setState({ online: true }); syncNow(); };
const onOffline = () => setState({ online: false });

export async function startSync({ db, getToken }) {
  stopSync();
  ctx = { db, getToken };
  failures = 0;
  setState({
    active: true, online: navigator.onLine, error: null, authExpired: false, rejected: [],
    lastSync: await getMeta(db, 'lastSync'), cursor: (await getMeta(db, 'cursor')) || 0,
    conflicts: (await getMeta(db, 'conflicts')) || [],
  });
  await refreshPending();
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  timers.interval = setInterval(() => { if (navigator.onLine) syncNow(); }, 30000);
  // Any local write refreshes the pending counter and schedules a background sync.
  unsubStore = store.onChange(() => {
    refreshPending();
    clearTimeout(timers.debounce);
    timers.debounce = setTimeout(syncNow, 2500);
  });
  syncNow();
}

export function stopSync() {
  window.removeEventListener('online', onOnline);
  window.removeEventListener('offline', onOffline);
  Object.values(timers).forEach((t) => { clearInterval(t); clearTimeout(t); });
  timers = { interval: null, retry: null, debounce: null };
  if (unsubStore) unsubStore();
  unsubStore = null;
  ctx = null;
  setState({ active: false, syncing: false, pending: 0, error: null });
}

const MAX_BATCH = 100;

export async function syncNow() {
  if (!ctx || running) return;
  if (!navigator.onLine) { setState({ online: false }); return; }
  const token = ctx.getToken();
  if (!token) { setState({ authExpired: true }); return; }
  const { db } = ctx;
  running = true;
  setState({ syncing: true, online: true, error: null });
  try {
    // ---- PUSH (only changed records; parents before children; failed ones retried next run)
    const attempts = new Map();
    const skip = new Set();
    const rejected = [];
    const conflictLog = [...state.conflicts];
    for (let round = 0; round < 50; round++) {
      const queue = (await store.pendingChanges()).filter(
        (c) => !skip.has(c.record.uid) && (attempts.get(c.record.uid) || 0) < 3
      );
      if (!queue.length) break;
      const changes = queue.slice(0, MAX_BATCH);
      changes.forEach((c) => attempts.set(c.record.uid, (attempts.get(c.record.uid) || 0) + 1));
      const res = await api.post('/sync/push', { deviceId: deviceId(), changes }, token);
      for (const r of res.results) {
        if (r.ok) {
          const { conflicts } = await store.applyRemote(r.collection, r.record);
          const fields = [...new Set([...(r.conflicts || []), ...conflicts])];
          if (fields.length) conflictLog.unshift({ at: Date.now(), collection: r.collection, uid: r.uid, fields });
        } else {
          skip.add(r.uid);
          rejected.push({ collection: r.collection, uid: r.uid, error: r.error, status: r.status });
        }
      }
    }

    // ---- PULL (server changes since cursor, paged)
    let cursor = (await getMeta(db, 'cursor')) || 0;
    for (let page = 0; page < 200; page++) {
      const r = await api.get(`/sync/pull?since=${cursor}`, token);
      for (const table of store.TABLES) {
        for (const rec of r[table] || []) await store.applyRemote(table, rec);
      }
      const advanced = r.cursor > cursor;
      cursor = Math.max(cursor, r.cursor);
      await setMeta(db, 'cursor', cursor);
      if (!r.hasMore || !advanced) break;
    }

    const now = Date.now();
    await setMeta(db, 'lastSync', now);
    await setMeta(db, 'conflicts', conflictLog.slice(0, 50));
    failures = 0;
    setState({
      lastSync: now, cursor, rejected, conflicts: conflictLog.slice(0, 50), authExpired: false,
      error: rejected.length ? `${rejected.length} change(s) were rejected by the server (${rejected[0].error})` : null,
    });
  } catch (e) {
    failures += 1;
    if (e.status === 401) {
      setState({ authExpired: true, error: 'Session expired. Sign out and sign in again online to resume syncing.' });
    } else {
      setState({ error: e.network ? 'Server unreachable. Your data is safe on this device; will retry automatically.' : e.message });
      // Exponential backoff retry: 5s, 10s, 20s ... up to 5 min
      clearTimeout(timers.retry);
      timers.retry = setTimeout(syncNow, Math.min(300000, 5000 * 2 ** Math.min(failures, 6)));
    }
  } finally {
    running = false;
    setState({ syncing: false });
    await refreshPending();
  }
}
