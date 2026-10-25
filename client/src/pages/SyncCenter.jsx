import { useEffect, useState } from 'react';
import * as store from '../lib/store.js';
import { useSyncState, syncNow } from '../lib/sync.js';
import { deviceId } from '../lib/db.js';
import { fmtDateTime, useStoreTick } from '../lib/util.js';

const LABEL = { patients: 'Patients', visits: 'Visits', prescriptions: 'Prescriptions', labresults: 'Lab results' };

export default function SyncCenter() {
  const s = useSyncState();
  const tick = useStoreTick();
  const [byTable, setByTable] = useState({});
  useEffect(() => { store.pendingByTable().then(setByTable); }, [tick, s.pending, s.syncing]);

  return (
    <section>
      <div className="between page-head">
        <h1>Sync Center</h1>
        <button className="btn primary big" disabled={!s.online || s.syncing} onClick={syncNow}>{s.syncing ? 'Syncing…' : 'Sync now'}</button>
      </div>

      <div className="stats">
        <div className="stat card"><span className="num">{s.online ? 'Online' : 'Offline'}</span><span className="muted">Connection</span></div>
        <div className="stat card"><span className="num">{s.pending}</span><span className="muted">Changes waiting</span></div>
        <div className="stat card"><span className="num small">{fmtDateTime(s.lastSync)}</span><span className="muted">Last successful sync</span></div>
      </div>

      {s.error && <p className="notice warn" role="alert">{s.error}</p>}
      {s.authExpired && <p className="notice warn">Your sign-in expired. Use “Lock / Sign out”, then sign in again while online to resume syncing. Nothing is lost.</p>}

      <div className="card">
        <h2>Pending queue</h2>
        {s.pending === 0 ? <p className="muted">Everything on this device is synced.</p> : (
          <ul className="plain">
            {Object.entries(byTable).filter(([, n]) => n > 0).map(([t, n]) => <li key={t}>{LABEL[t]}: <strong>{n}</strong></li>)}
          </ul>
        )}
        <p className="muted small">Only changed records are sent (delta sync). Failed uploads stay queued and retry automatically with increasing delays.</p>
        {s.rejected.length > 0 && (
          <>
            <h3>Rejected by server</h3>
            <ul className="plain">{s.rejected.map((r) => <li key={r.uid}>{LABEL[r.collection] || r.collection}: {r.error}</li>)}</ul>
          </>
        )}
      </div>

      <div className="card">
        <h2>Conflicts resolved automatically</h2>
        {s.conflicts.length === 0 ? <p className="muted">No conflicts so far.</p> : (
          <ul className="plain">
            {s.conflicts.slice(0, 10).map((c, i) => <li key={i}>{fmtDateTime(c.at)} · {LABEL[c.collection] || c.collection} · fields: {c.fields.join(', ')} <span className="muted">(latest edit won, other fields merged)</span></li>)}
          </ul>
        )}
      </div>

      <div className="card">
        <h2>Encrypted local store</h2>
        <ul className="plain">
          <li>Records on this device are encrypted with <strong>AES-256-GCM</strong> (Web Crypto) before they are written to IndexedDB.</li>
          <li>The key is derived from your password and kept only in memory; signing out locks the data.</li>
          <li>Device ID: <span className="mono">{deviceId()}</span></li>
        </ul>
      </div>
    </section>
  );
}
