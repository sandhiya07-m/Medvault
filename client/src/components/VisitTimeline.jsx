import { useState } from 'react';
import { fmtDate, today, imageToDataUrl } from '../lib/util.js';

export function Attachments({ items = [], onOpen }) {
  if (!items.length) return null;
  return (
    <div className="thumbs">
      {items.map((a, i) => (
        <button key={i} type="button" className="thumb" onClick={() => onOpen(a)} aria-label={`Open ${a.name || 'attachment'}`}>
          <img src={a.dataUrl} alt={a.name || 'attachment'} />
        </button>
      ))}
    </div>
  );
}

function PhotoPicker({ files, setFiles }) {
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    setBusy(true);
    try {
      const added = [];
      for (const file of [...e.target.files].slice(0, 3)) {
        added.push({ name: file.name, dataUrl: await imageToDataUrl(file) });
      }
      setFiles([...files, ...added].slice(0, 4));
    } finally { setBusy(false); e.target.value = ''; }
  };
  return (
    <div>
      <label className="filebtn">{busy ? 'Processing…' : 'Attach photo / scan'}
        <input type="file" accept="image/*" multiple onChange={pick} hidden />
      </label>
      {files.map((a, i) => (
        <span key={i} className="chip">{a.name || 'scan'} <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label="Remove">×</button></span>
      ))}
    </div>
  );
}

export function VisitForm({ initial, onSubmit, onCancel }) {
  const v = initial || {};
  const vit = v.vitals || {};
  const [f, setF] = useState({
    date: v.date || today(), complaint: v.complaint || '', diagnosis: v.diagnosis || '', notes: v.notes || '',
    temp: vit.temp ?? '', bp: vit.bp || '', pulse: vit.pulse ?? '', spo2: vit.spo2 ?? '', weight: vit.weight ?? '',
  });
  const [files, setFiles] = useState(v.attachments || []);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const num = (x) => (x === '' ? null : Number(x));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.complaint.trim()) return setErr('Chief complaint is required');
    if (f.bp && !/^\d{2,3}\/\d{2,3}$/.test(f.bp)) return setErr('Blood pressure should look like 120/80');
    if (f.temp !== '' && (num(f.temp) < 30 || num(f.temp) > 45)) return setErr('Temperature must be between 30 and 45 °C');
    if (f.spo2 !== '' && (num(f.spo2) < 50 || num(f.spo2) > 100)) return setErr('SpO₂ must be between 50 and 100');
    try {
      await onSubmit({
        date: f.date, complaint: f.complaint.trim(), diagnosis: f.diagnosis.trim(), notes: f.notes.trim(),
        vitals: { temp: num(f.temp), bp: f.bp, pulse: num(f.pulse), spo2: num(f.spo2), weight: num(f.weight) },
        attachments: files,
      });
    } catch (ex) { setErr(ex.message); }
  };

  return (
    <form className="card form" onSubmit={submit}>
      <h3>{initial ? 'Edit visit' : 'New visit'}</h3>
      <div className="grid2">
        <label>Date<input type="date" value={f.date} onChange={set('date')} max={today()} /></label>
        <label>Chief complaint *<input value={f.complaint} onChange={set('complaint')} required /></label>
      </div>
      <div className="grid3">
        <label>Temp °C<input inputMode="decimal" value={f.temp} onChange={set('temp')} /></label>
        <label>BP (mmHg)<input value={f.bp} onChange={set('bp')} placeholder="120/80" /></label>
        <label>Pulse /min<input inputMode="numeric" value={f.pulse} onChange={set('pulse')} /></label>
        <label>SpO₂ %<input inputMode="numeric" value={f.spo2} onChange={set('spo2')} /></label>
        <label>Weight kg<input inputMode="decimal" value={f.weight} onChange={set('weight')} /></label>
      </div>
      <label>Diagnosis<input value={f.diagnosis} onChange={set('diagnosis')} /></label>
      <label>Notes<textarea rows="3" value={f.notes} onChange={set('notes')} /></label>
      <PhotoPicker files={files} setFiles={setFiles} />
      {err && <p className="error" role="alert">{err}</p>}
      <div className="row">
        <button className="btn primary big">Save visit</button>
        <button type="button" className="btn ghost big" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

export function PrescriptionForm({ onSubmit, onCancel }) {
  const [f, setF] = useState({ drug: '', dose: '', frequency: 'Twice daily', days: '5', instructions: '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    if (!f.drug.trim() || !f.dose.trim()) return setErr('Drug and dose are required');
    if (!(Number(f.days) > 0)) return setErr('Days must be a positive number');
    await onSubmit({ ...f, drug: f.drug.trim(), dose: f.dose.trim(), days: Number(f.days) });
  };
  return (
    <form className="subform" onSubmit={submit}>
      <div className="grid2">
        <label>Drug *<input value={f.drug} onChange={set('drug')} /></label>
        <label>Dose *<input value={f.dose} onChange={set('dose')} placeholder="500 mg" /></label>
      </div>
      <div className="grid2">
        <label>Frequency<select value={f.frequency} onChange={set('frequency')}>{['Once daily', 'Twice daily', 'Thrice daily', 'Four times daily', 'At night', 'As needed'].map((x) => <option key={x}>{x}</option>)}</select></label>
        <label>Days<input inputMode="numeric" value={f.days} onChange={set('days')} /></label>
      </div>
      <label>Instructions<input value={f.instructions} onChange={set('instructions')} /></label>
      {err && <p className="error">{err}</p>}
      <div className="row"><button className="btn primary">Add prescription</button><button type="button" className="btn ghost" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}

export function LabForm({ onSubmit, onCancel }) {
  const [f, setF] = useState({ test: '', result: '', notes: '' });
  const [files, setFiles] = useState([]);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    if (!f.test.trim() || !f.result.trim()) return setErr('Test name and result are required');
    await onSubmit({ ...f, test: f.test.trim(), result: f.result.trim(), date: today(), attachments: files });
  };
  return (
    <form className="subform" onSubmit={submit}>
      <div className="grid2">
        <label>Test *<input value={f.test} onChange={set('test')} placeholder="Hemoglobin" /></label>
        <label>Result *<input value={f.result} onChange={set('result')} placeholder="11.2 g/dL" /></label>
      </div>
      <label>Notes<input value={f.notes} onChange={set('notes')} /></label>
      <PhotoPicker files={files} setFiles={setFiles} />
      {err && <p className="error">{err}</p>}
      <div className="row"><button className="btn primary">Add lab result</button><button type="button" className="btn ghost" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}

export function VisitCard({ visit, prescriptions, labs, can, onEdit, onAddRx, onAddLab, onOpenImage, pendingIds }) {
  const d = visit.data;
  const v = d.vitals || {};
  const vitals = [
    v.temp != null && `${v.temp} °C`, v.bp && `BP ${v.bp}`, v.pulse != null && `Pulse ${v.pulse}`,
    v.spo2 != null && `SpO₂ ${v.spo2}%`, v.weight != null && `${v.weight} kg`,
  ].filter(Boolean);
  return (
    <article className="visit">
      <div className="visit-date">{fmtDate(d.date)}</div>
      <div className="visit-body card">
        <div className="between">
          <h4>{d.complaint}</h4>
          {pendingIds.has(visit.uid) && <span className="badge pending">Pending sync</span>}
        </div>
        {vitals.length > 0 && <div className="vitals">{vitals.map((x) => <span key={x} className="chip">{x}</span>)}</div>}
        {d.diagnosis && <p><strong>Diagnosis:</strong> {d.diagnosis}</p>}
        {d.notes && <p className="muted">{d.notes}</p>}
        <Attachments items={d.attachments} onOpen={onOpenImage} />
        {prescriptions.length > 0 && (
          <div className="rxlist">
            <h5>Prescriptions</h5>
            {prescriptions.map((p) => (
              <div key={p.uid} className="rx"><strong>{p.data.drug}</strong> {p.data.dose} · {p.data.frequency} · {p.data.days} days
                {p.data.instructions && <span className="muted"> ({p.data.instructions})</span>}
                {p.data.authorName && <span className="muted small"> by {p.data.authorName}</span>}
                {pendingIds.has(p.uid) && <span className="badge pending">Pending</span>}
              </div>
            ))}
          </div>
        )}
        {labs.length > 0 && (
          <div className="rxlist">
            <h5>Lab results</h5>
            {labs.map((l) => (
              <div key={l.uid} className="rx"><strong>{l.data.test}</strong>: {l.data.result}
                {l.data.notes && <span className="muted"> ({l.data.notes})</span>}
                {pendingIds.has(l.uid) && <span className="badge pending">Pending</span>}
                <Attachments items={l.data.attachments} onOpen={onOpenImage} />
              </div>
            ))}
          </div>
        )}
        <div className="row wrap">
          {can.visit && <button className="btn small ghost" onClick={onEdit}>Edit</button>}
          {can.rx && <button className="btn small" onClick={onAddRx}>+ Prescription</button>}
          {can.lab && <button className="btn small" onClick={onAddLab}>+ Lab result</button>}
        </div>
        <div className="muted small">Recorded by {d.authorName || 'staff'}</div>
      </div>
    </article>
  );
}
