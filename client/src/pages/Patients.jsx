import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as store from '../lib/store.js';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { normaliseHealthId } from '../lib/ids.js';
import { age, useStoreTick } from '../lib/util.js';
import { syncNow } from '../lib/sync.js';
import QrScanner from '../components/QrScanner.jsx';

export default function Patients() {
  const { token } = useAuth();
  const nav = useNavigate();
  const tick = useStoreTick();
  const [patients, setPatients] = useState(null);
  const [q, setQ] = useState('');
  const [scan, setScan] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => { store.listPatients().then(setPatients); }, [tick]);

  const shown = useMemo(() => {
    if (!patients) return [];
    const term = q.trim().toLowerCase();
    if (!term) return patients;
    const hid = normaliseHealthId(q);
    return patients.filter((p) => {
      const d = p.data;
      return (hid && d.healthId === hid) || [d.name, d.healthId, d.village, d.phone].some((x) => String(x || '').toLowerCase().includes(term));
    });
  }, [patients, q]);

  // Open by Health ID: local store first (works offline), then fetch from the server if online.
  const openByHealthId = async (id) => {
    setScan(false); setNote('');
    const local = await store.findPatientByHealthId(id);
    if (local) return nav(`/patients/${local.uid}`);
    if (!navigator.onLine || !token) return setNote(`${id} is not on this device yet. Connect to the internet to fetch it from the server.`);
    try {
      const rec = await api.get(`/patients/${id}`, token);
      await store.applyRemote('patients', rec);
      syncNow(); // also bring down this patient's visits, prescriptions and lab results
      nav(`/patients/${rec.uid}`);
    } catch (e) {
      setNote(e.status === 404 ? `No patient found with Health ID ${id}.` : e.message);
    }
  };

  const onSearchEnter = (e) => {
    e.preventDefault();
    const id = normaliseHealthId(q);
    if (id) openByHealthId(id);
  };

  return (
    <section>
      <div className="between page-head">
        <h1>Patients</h1>
        <Link to="/patients/new" className="btn primary big">+ Register patient</Link>
      </div>
      <form className="searchrow" onSubmit={onSearchEnter}>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, Health ID, village or phone" aria-label="Search patients" />
        <button type="button" className="btn big" onClick={() => setScan(true)}>Scan QR</button>
      </form>
      {note && <p className="notice" role="status">{note}</p>}
      {patients === null && <p className="muted">Loading from device…</p>}
      {patients && shown.length === 0 && (
        <div className="card empty">
          <p>{patients.length === 0 ? 'No patients on this device yet.' : 'No patients match your search.'}</p>
          {normaliseHealthId(q) && <button className="btn" onClick={() => openByHealthId(normaliseHealthId(q))}>Look up {normaliseHealthId(q)}</button>}
        </div>
      )}
      <ul className="plist">
        {shown.map((p) => (
          <li key={p.uid}>
            <Link to={`/patients/${p.uid}`} className="card pcard">
              <div className="avatar" aria-hidden="true">{(p.data.name || '?')[0].toUpperCase()}</div>
              <div className="pinfo">
                <strong>{p.data.name}</strong>
                <span className="muted">{[age(p.data.dob), p.data.sex, p.data.village].filter(Boolean).join(' · ')}</span>
                <span className="mono small">{p.data.healthId}</span>
              </div>
              <span className={`badge ${p.dirty ? 'pending' : 'ok'}`}>{p.dirty ? 'Pending sync' : 'Synced'}</span>
            </Link>
          </li>
        ))}
      </ul>
      {scan && <QrScanner onResult={openByHealthId} onClose={() => setScan(false)} />}
    </section>
  );
}
