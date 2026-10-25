import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as store from '../lib/store.js';
import { useAuth } from '../lib/auth.jsx';
import { age, fmtDate, useStoreTick } from '../lib/util.js';
import HealthIdCard from '../components/HealthIdCard.jsx';
import { VisitCard, VisitForm, PrescriptionForm, LabForm } from '../components/VisitTimeline.jsx';

export default function PatientRecord() {
  const { uid } = useParams();
  const { user } = useAuth();
  const tick = useStoreTick();
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null); // { type:'visit'|'edit'|'rx'|'lab', visit? }
  const [image, setImage] = useState(null);

  useEffect(() => {
    (async () => {
      const patient = await store.getRecord('patients', uid);
      if (!patient) return setData({ missing: true });
      const [visits, rx, labs] = await Promise.all([
        store.listByPatient('visits', uid), store.listByPatient('prescriptions', uid), store.listByPatient('labresults', uid),
      ]);
      visits.sort((a, b) => String(b.data.date).localeCompare(String(a.data.date)) || b.updatedAt - a.updatedAt);
      setData({ patient, visits, rx, labs });
    })();
  }, [uid, tick]);

  if (!data) return <p className="muted">Loading from device…</p>;
  if (data.missing) return <div className="card"><p>This patient is not on the device.</p><Link to="/patients">Back to patients</Link></div>;

  const { patient, visits, rx, labs } = data;
  const d = patient.data;
  const can = { visit: ['healthworker', 'doctor'].includes(user.role), rx: user.role === 'doctor', lab: ['healthworker', 'doctor'].includes(user.role) };
  const pendingIds = new Set([patient, ...visits, ...rx, ...labs].filter((r) => r.dirty).map((r) => r.uid));
  const close = () => setForm(null);

  return (
    <section>
      <p><Link to="/patients">← Patients</Link></p>
      <div className="card phead">
        <div className="between">
          <div>
            <h1>{d.name}</h1>
            <p className="muted">{[age(d.dob), d.sex === 'F' ? 'Female' : d.sex === 'M' ? 'Male' : d.sex, d.bloodGroup && `Blood ${d.bloodGroup}`].filter(Boolean).join(' · ')} · Born {fmtDate(d.dob)}</p>
          </div>
          <span className={`badge ${patient.dirty ? 'pending' : 'ok'}`}>{patient.dirty ? 'Saved on device · pending sync' : 'Synced'}</span>
        </div>
        <dl className="facts">
          {d.phone && <><dt>Phone</dt><dd><a href={`tel:${d.phone}`}>{d.phone}</a></dd></>}
          {(d.village || d.address) && <><dt>Address</dt><dd>{[d.address, d.village].filter(Boolean).join(', ')}</dd></>}
          {d.guardian && <><dt>Emergency contact</dt><dd>{d.guardian}</dd></>}
        </dl>
        {(d.allergies || []).length > 0 && <div className="alert-chips"><strong>Allergies:</strong> {d.allergies.map((a) => <span key={a} className="chip danger">{a}</span>)}</div>}
        {(d.conditions || []).length > 0 && <div><strong>Conditions:</strong> {d.conditions.map((a) => <span key={a} className="chip">{a}</span>)}</div>}
        {can.visit && <Link className="btn small ghost" to={`/patients/${uid}/edit`}>Edit details</Link>}
      </div>

      <HealthIdCard patient={patient} />

      <div className="between page-head">
        <h2>Visit history</h2>
        {can.visit && !form && <button className="btn primary big" onClick={() => setForm({ type: 'visit' })}>+ New visit</button>}
      </div>

      {form && form.type === 'visit' && (
        <VisitForm onCancel={close} onSubmit={async (f) => {
          await store.addChild('visits', { ...f, patientId: uid, authorName: user.name, authorRole: user.role });
          close();
        }} />
      )}
      {form && form.type === 'edit' && (
        <VisitForm initial={form.visit.data} onCancel={close} onSubmit={async (f) => {
          await store.saveRecord('visits', form.visit.uid, f);
          close();
        }} />
      )}

      {visits.length === 0 && !form && <div className="card empty">No visits recorded yet.</div>}
      <div className="timeline">
        {visits.map((v) => (
          <div key={v.uid}>
            <VisitCard
              visit={v}
              prescriptions={rx.filter((r) => r.data.visitId === v.uid)}
              labs={labs.filter((l) => l.data.visitId === v.uid)}
              can={can} pendingIds={pendingIds} onOpenImage={setImage}
              onEdit={() => setForm({ type: 'edit', visit: v })}
              onAddRx={() => setForm({ type: 'rx', visit: v })}
              onAddLab={() => setForm({ type: 'lab', visit: v })}
            />
            {form && form.type === 'rx' && form.visit.uid === v.uid && (
              <PrescriptionForm onCancel={close} onSubmit={async (f) => {
                await store.addChild('prescriptions', { ...f, patientId: uid, visitId: v.uid, authorName: user.name });
                close();
              }} />
            )}
            {form && form.type === 'lab' && form.visit.uid === v.uid && (
              <LabForm onCancel={close} onSubmit={async (f) => {
                await store.addChild('labresults', { ...f, patientId: uid, visitId: v.uid, authorName: user.name });
                close();
              }} />
            )}
          </div>
        ))}
      </div>

      {image && (
        <div className="modal" onClick={() => setImage(null)} role="dialog" aria-label="Attachment">
          <div className="modal-card wide"><img src={image.dataUrl} alt={image.name || 'attachment'} className="lightbox" /><button className="btn" onClick={() => setImage(null)}>Close</button></div>
        </div>
      )}
    </section>
  );
}
