import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import * as store from '../lib/store.js';
import PatientForm from '../components/PatientForm.jsx';

// Used for both /patients/new and /patients/:uid/edit
export default function PatientRegister() {
  const { uid } = useParams();
  const nav = useNavigate();
  const [existing, setExisting] = useState(uid ? undefined : null);

  useEffect(() => { if (uid) store.getRecord('patients', uid).then(setExisting); }, [uid]);

  if (existing === undefined) return <p className="muted">Loading…</p>;
  if (uid && !existing) return <p className="error">Patient not found on this device.</p>;

  return (
    <section>
      <p><Link to={uid ? `/patients/${uid}` : '/patients'}>← Back</Link></p>
      <h1>{uid ? 'Edit patient' : 'Register patient'}</h1>
      {!uid && <p className="muted">A unique Health ID and QR code are generated on this device, even without internet.</p>}
      <PatientForm
        initial={existing ? existing.data : {}}
        submitLabel={uid ? 'Save changes' : 'Register & create Health ID'}
        onSubmit={async (fields) => {
          if (uid) { await store.updatePatient(uid, fields); nav(`/patients/${uid}`); }
          else { const p = await store.createPatient(fields); nav(`/patients/${p.uid}`); }
        }}
      />
    </section>
  );
}
