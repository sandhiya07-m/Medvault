import { useSyncState, syncNow } from '../lib/sync.js';
import { fmtDateTime } from '../lib/util.js';
import { Link } from 'react-router-dom';

// Offline / pending-sync status bar shown on every screen.
export default function SyncBanner({ showSync = true }) {
  const s = useSyncState();
  const cls = !s.online ? 'offline' : s.error || s.authExpired ? 'warn' : s.pending ? 'pending' : 'ok';
  let text;
  if (!s.online) text = 'Offline: working from this device';
  else if (s.syncing) text = 'Syncing…';
  else if (s.authExpired) text = 'Online, but session expired';
  else if (s.error) text = 'Online, sync problem';
  else if (s.pending) text = 'Online, changes waiting to sync';
  else text = 'Online, all changes synced';
  return (
    <div className={`syncbar ${cls}`} role="status" aria-live="polite">
      <span className="dot" />
      <span className="syncbar-text">{text}</span>
      {showSync && s.active && (
        <>
          <Link to="/sync" className="pill">{s.pending} pending</Link>
          <button className="btn small" disabled={!s.online || s.syncing} onClick={syncNow}>Sync now</button>
        </>
      )}
      {showSync && s.active && s.lastSync && <span className="syncbar-last">Last sync {fmtDateTime(s.lastSync)}</span>}
    </div>
  );
}
