import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { fmtDateTime, ROLE_LABEL } from '../lib/util.js';

function useRemote(path, token, deps = []) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    api.get(path, token)
      .then((data) => setState({ data, error: '', loading: false }))
      .catch((e) => setState({ data: null, error: e.network ? 'You are offline. Admin tools need an internet connection.' : e.message, loading: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, token, ...deps]);
  useEffect(load, [load]);
  return { ...state, reload: load };
}

function AddUser({ token, onDone }) {
  const empty = { name: '', email: '', password: '', role: 'healthworker', facility: '' };
  const [f, setF] = useState(empty);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      await api.post('/admin/users', { ...f, email: f.email.trim().toLowerCase() }, token);
      setF(empty); setOpen(false); onDone();
    } catch (ex) { setErr(ex.network ? 'You are offline.' : ex.message); } finally { setBusy(false); }
  };
  if (!open) return <p><button className="btn primary" onClick={() => setOpen(true)}>+ Add user</button></p>;
  return (
    <form className="card form" onSubmit={submit}>
      <h3>Add user</h3>
      <label>Full name<input value={f.name} onChange={set('name')} required minLength={2} /></label>
      <label>Email<input type="email" value={f.email} onChange={set('email')} required /></label>
      <label>Temporary password<input type="text" value={f.password} onChange={set('password')} required minLength={8} autoComplete="off" /></label>
      <label>Role<select value={f.role} onChange={set('role')}><option value="healthworker">Health worker</option><option value="doctor">Doctor</option><option value="admin">Admin</option></select></label>
      <label>Facility<input value={f.facility} onChange={set('facility')} placeholder="e.g. Kallakurichi PHC" /></label>
      {err && <p className="error" role="alert">{err}</p>}
      <div className="row">
        <button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create (active immediately)'}</button>
        <button type="button" className="btn ghost" onClick={() => { setOpen(false); setErr(''); }}>Cancel</button>
      </div>
    </form>
  );
}

function Users({ token, me }) {
  const { data, error, loading, reload } = useRemote('/admin/users', token);
  const [msg, setMsg] = useState('');
  const patch = async (id, body) => {
    setMsg('');
    try { await api.patch(`/admin/users/${id}`, body, token); reload(); } catch (e) { setMsg(e.message); }
  };
  if (loading) return <p className="muted">Loading…</p>;
  if (error) return <p className="error">{error}</p>;
  const resetPw = (u) => {
    const pw = window.prompt(`New password for ${u.name} (min 8 characters).\nOn their devices, they will be asked to reset the local copy; unsynced changes there are lost.`);
    if (pw) patch(u.id, { password: pw });
  };
  return (
    <>
    <AddUser token={token} onDone={reload} />
    <div className="card tablewrap">
      {msg && <p className="error">{msg}</p>}
      <table>
        <thead><tr><th>Name</th><th>Role</th><th>Facility</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {data.map((u) => (
            <tr key={u.id}>
              <td><strong>{u.name}</strong><div className="muted small">{u.email}</div></td>
              <td>{ROLE_LABEL[u.role]}</td>
              <td>{u.facility}</td>
              <td><span className={`badge ${u.status === 'active' ? 'ok' : u.status === 'pending' ? 'pending' : 'off'}`}>{u.status}</span></td>
              <td className="actions">
                {u.status !== 'active' && <button className="btn small primary" onClick={() => patch(u.id, { status: 'active' })}>{u.status === 'pending' ? 'Approve' : 'Reactivate'}</button>}
                {u.status === 'active' && u.id !== me.id && <button className="btn small danger" onClick={() => window.confirm(`Deactivate ${u.name}?`) && patch(u.id, { status: 'deactivated' })}>Deactivate</button>}
                <button className="btn small ghost" onClick={() => resetPw(u)}>Reset password</button>
                {u.status === 'pending' && <button className="btn small ghost" onClick={() => window.confirm(`Reject ${u.name}'s request?`) && patch(u.id, { status: 'deactivated' })}>Reject</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}

function Audit({ token }) {
  const [action, setAction] = useState('');
  const [user, setUser] = useState('');
  const path = `/audit?limit=200${action ? `&action=${encodeURIComponent(action)}` : ''}${user ? `&user=${encodeURIComponent(user)}` : ''}`;
  const { data, error, loading } = useRemote(path, token);
  return (
    <div className="card tablewrap">
      <div className="row wrap filters">
        <select value={action} onChange={(e) => setAction(e.target.value)} aria-label="Filter action">
          <option value="">All actions</option>
          {['auth', 'patient', 'visit', 'sync', 'admin'].map((a) => <option key={a} value={a}>{a}.*</option>)}
        </select>
        <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="Filter by user" aria-label="Filter by user" />
      </div>
      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">{error}</p>}
      {data && (
        <table>
          <thead><tr><th>When</th><th>User</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
          <tbody>
            {data.map((l) => (
              <tr key={l._id}>
                <td>{fmtDateTime(l.at)}</td>
                <td>{l.userName || '—'}<div className="muted small">{l.role} {l.facility && `· ${l.facility}`}</div></td>
                <td className="mono">{l.action}</td>
                <td className="mono small">{[l.entity, l.entityId].filter(Boolean).join(' ')}</td>
                <td className="small">{l.meta ? Object.entries(l.meta).map(([k, v]) => `${k}: ${v}`).join(', ') : ''}</td>
              </tr>
            ))}
            {data.length === 0 && <tr><td colSpan="5" className="muted">No matching entries.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Bars({ rows, labelKey, valueKey }) {
  const max = Math.max(1, ...rows.map((r) => r[valueKey]));
  if (!rows.length) return <p className="muted">No data yet.</p>;
  return (
    <ul className="bars">
      {rows.map((r) => (
        <li key={r[labelKey]}>
          <span className="bl">{r[labelKey]}</span>
          <span className="bar"><span style={{ width: `${(r[valueKey] / max) * 100}%` }} /></span>
          <span className="bv">{r[valueKey]}</span>
        </li>
      ))}
    </ul>
  );
}

function Reports({ token }) {
  const { data, error, loading } = useRemote('/admin/reports', token);
  if (loading) return <p className="muted">Loading…</p>;
  if (error) return <p className="error">{error}</p>;
  const t = data.totals;
  return (
    <>
      <div className="stats">
        {[['Patients', t.patients], ['Visits', t.visits], ['Prescriptions', t.prescriptions], ['Lab results', t.labResults], ['Active staff', t.activeUsers], ['Awaiting approval', t.pendingUsers]].map(([l, n]) => (
          <div key={l} className="stat card"><span className="num">{n}</span><span className="muted">{l}</span></div>
        ))}
      </div>
      <div className="card"><h3>Patients by facility</h3><Bars rows={data.byFacility} labelKey="facility" valueKey="patients" /></div>
      <div className="card"><h3>Visits, last 14 days</h3><Bars rows={data.visitsByDay} labelKey="day" valueKey="visits" /></div>
      <p className="muted small">Reports use counts only; clinical content stays encrypted on the server.</p>
    </>
  );
}

export default function Admin() {
  const { token, user } = useAuth();
  const [tab, setTab] = useState('users');
  return (
    <section>
      <h1>Administration</h1>
      <div className="tabs" role="tablist">
        {[['users', 'Users'], ['audit', 'Audit logs'], ['reports', 'Reports']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'users' && <Users token={token} me={user} />}
      {tab === 'audit' && <Audit token={token} />}
      {tab === 'reports' && <Reports token={token} />}
    </section>
  );
}
