import { useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import SyncBanner from '../components/SyncBanner.jsx';

export default function Login() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ name: '', email: (() => { try { return localStorage.getItem('mv_last_email') || ''; } catch { return ''; } })(), password: '', role: 'healthworker', facility: '' });
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const doLogin = async (opts) => {
    setBusy(true); setErr('');
    try {
      await login(f.email.trim(), f.password, opts);
    } catch (ex) {
      if (ex.code === 'PASSWORD_CHANGED') {
        const ok = window.confirm(`${ex.message}\n\nReset this device's local copy for this account? Any changes not yet synced will be lost. Records are re-downloaded from the server.`);
        if (ok) return doLogin({ resetLocal: true });
      }
      setErr(ex.message || 'Sign in failed');
    } finally { setBusy(false); }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (mode === 'login') return doLogin();
    setBusy(true); setErr(''); setMsg('');
    try {
      const r = await register({ name: f.name, email: f.email.trim().toLowerCase(), password: f.password, role: f.role, facility: f.facility });
      setMsg(r.message);
      setMode('login');
    } catch (ex) {
      setErr(ex.network ? 'Registration needs an internet connection.' : ex.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="login-wrap">
      <SyncBanner showSync={false} />
      <main className="login-card card">
        <div className="brand big"><span className="brand-mark">+</span> MedVault</div>
        <p className="muted">Offline-first health records for rural clinics.</p>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setErr(''); }}>Sign in</button>
          <button role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setErr(''); }}>Request account</button>
        </div>
        <form className="form" onSubmit={submit}>
          {mode === 'register' && <label>Full name<input value={f.name} onChange={set('name')} required minLength={2} /></label>}
          <label>Email<input type="email" value={f.email} onChange={set('email')} autoComplete="username" required /></label>
          <label>Password<input type="password" value={f.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 8 : 1} /></label>
          {mode === 'register' && (
            <>
              <label>Role<select value={f.role} onChange={set('role')}><option value="healthworker">Health worker</option><option value="doctor">Doctor</option></select></label>
              <label>Facility<input value={f.facility} onChange={set('facility')} placeholder="e.g. Kallakurichi PHC" /></label>
            </>
          )}
          {msg && <p className="success" role="status">{msg}</p>}
          {err && <p className="error" role="alert">{err}</p>}
          <button className="btn primary big" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Request account'}</button>
        </form>
        <p className="muted small">Your password also unlocks the encrypted data stored on this device, so you can sign in without a connection after your first online sign-in.</p>
      </main>
    </div>
  );
}
