import { useState } from 'react';

const BLOOD = ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function PatientForm({ initial = {}, onSubmit, submitLabel = 'Save patient' }) {
  const [f, setF] = useState({
    name: '', sex: 'F', dob: '', phone: '', village: '', address: '', guardian: '', bloodGroup: '',
    allergies: '', conditions: '',
    ...initial,
    allergies: Array.isArray(initial.allergies) ? initial.allergies.join(', ') : initial.allergies || '',
    conditions: Array.isArray(initial.conditions) ? initial.conditions.join(', ') : initial.conditions || '',
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);

  const submit = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) return setErr('Name is required');
    if (!f.dob) return setErr('Date of birth is required');
    if (new Date(f.dob) > new Date()) return setErr('Date of birth cannot be in the future');
    if (f.phone && !/^[0-9+\-\s]{7,15}$/.test(f.phone)) return setErr('Enter a valid phone number');
    setBusy(true);
    try {
      await onSubmit({ ...f, name: f.name.trim(), allergies: list(f.allergies), conditions: list(f.conditions) });
    } catch (ex) {
      setErr(ex.message);
      setBusy(false);
    }
  };

  return (
    <form className="card form" onSubmit={submit}>
      <label>Full name *<input value={f.name} onChange={set('name')} autoComplete="off" required /></label>
      <div className="grid2">
        <label>Sex<select value={f.sex} onChange={set('sex')}><option value="F">Female</option><option value="M">Male</option><option value="O">Other</option></select></label>
        <label>Date of birth *<input type="date" value={f.dob} onChange={set('dob')} max={new Date().toISOString().slice(0, 10)} required /></label>
      </div>
      <div className="grid2">
        <label>Phone<input inputMode="tel" value={f.phone} onChange={set('phone')} /></label>
        <label>Blood group<select value={f.bloodGroup} onChange={set('bloodGroup')}>{BLOOD.map((b) => <option key={b} value={b}>{b || 'Unknown'}</option>)}</select></label>
      </div>
      <div className="grid2">
        <label>Village / town<input value={f.village} onChange={set('village')} /></label>
        <label>Guardian / emergency contact<input value={f.guardian} onChange={set('guardian')} /></label>
      </div>
      <label>Address<input value={f.address} onChange={set('address')} /></label>
      <label>Allergies <span className="muted small">(comma separated)</span><input value={f.allergies} onChange={set('allergies')} placeholder="e.g. Penicillin, Aspirin" /></label>
      <label>Chronic conditions <span className="muted small">(comma separated)</span><input value={f.conditions} onChange={set('conditions')} placeholder="e.g. Diabetes, Hypertension" /></label>
      {err && <p className="error" role="alert">{err}</p>}
      <button className="btn primary big" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
    </form>
  );
}
