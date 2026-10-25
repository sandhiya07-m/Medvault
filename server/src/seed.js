// Seed sample rural-clinic data: node src/seed.js
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const env = require('./config/env');
const connectDB = require('./config/db');
const User = require('./models/User');
const SyncLog = require('./models/SyncLog');
const { Patient, Visit, Prescription, LabResult } = require('./models/records');
const { upsertRecord } = require('./utils/syncService');
const { generateHealthId } = require('./utils/healthId');

const PEOPLE = [
  ['Lakshmi Devi', 'F', '1984-03-12', 'Kallakurichi', ['Penicillin']],
  ['Murugan K', 'M', '1971-11-02', 'Villupuram', []],
  ['Selvi Annamalai', 'F', '1995-07-21', 'Thiruvannamalai', ['Sulfa drugs']],
  ['Ramesh P', 'M', '2016-01-30', 'Kallakurichi', []],
  ['Fathima Begum', 'F', '1962-05-09', 'Cuddalore', ['Aspirin']],
  ['Arjun S', 'M', '1990-09-17', 'Villupuram', []],
];

function stamp(data, by, ts) {
  const clock = {}; const clockBy = {};
  Object.keys(data).forEach((f) => { clock[f] = ts; clockBy[f] = by; });
  return { clock, clockBy };
}

(async () => {
  await connectDB();
  if (process.argv.includes('--reset')) {
    await Promise.all([User, SyncLog, Patient, Visit, Prescription, LabResult].map((m) => m.deleteMany({})));
  }
  const mk = async (name, email, role, facility) => {
    let u = await User.findOne({ email });
    if (!u) u = await User.create({ name, email, role, facility, status: 'active', passwordHash: await bcrypt.hash('Password@123', 12) });
    return u;
  };
  const admin = await mk('Admin User', 'admin@medvault.test', 'admin', 'District Office');
  const doctor = await mk('Dr. Priya Raman', 'doctor@medvault.test', 'doctor', 'Kallakurichi PHC');
  const worker = await mk('Sandhiya M', 'worker@medvault.test', 'healthworker', 'Kallakurichi PHC');

  if (!(await Patient.countDocuments())) {
    const day = 24 * 3600 * 1000;
    for (const [i, [name, sex, dob, village, allergies]] of PEOPLE.entries()) {
      const ts = Date.now() - (10 - i) * day;
      const pUid = crypto.randomUUID();
      const pData = { name, sex, dob, phone: `98${String(40000000 + i * 12345).slice(0, 8)}`, village, allergies, healthId: generateHealthId(), deleted: false };
      await upsertRecord('patients', { uid: pUid, data: pData, ...stamp(pData, 'seed', ts) }, worker);
      const vUid = crypto.randomUUID();
      const vData = { patientId: pUid, date: new Date(ts).toISOString().slice(0, 10), complaint: ['Fever and cough', 'Joint pain', 'Prenatal check-up', 'Skin rash', 'High blood pressure', 'Headache'][i], vitals: { temp: 37 + (i % 3) * 0.6, bp: '120/80', pulse: 72 + i * 3, weight: 50 + i * 4 }, notes: 'Seeded sample visit', authorName: worker.name, deleted: false };
      await upsertRecord('visits', { uid: vUid, data: vData, ...stamp(vData, 'seed', ts) }, worker);
      if (i % 2 === 0) {
        const rData = { patientId: pUid, visitId: vUid, drug: 'Paracetamol 500mg', dose: '1 tablet', frequency: 'Thrice daily', days: 3, authorName: doctor.name, deleted: false };
        await upsertRecord('prescriptions', { uid: crypto.randomUUID(), data: rData, ...stamp(rData, 'seed', ts) }, doctor);
        const lData = { patientId: pUid, visitId: vUid, test: 'Hemoglobin', result: `${11 + i * 0.4} g/dL`, date: vData.date, deleted: false };
        await upsertRecord('labresults', { uid: crypto.randomUUID(), data: lData, ...stamp(lData, 'seed', ts) }, worker);
      }
    }
  }
  console.log('Seeded. Logins (password Password@123): admin@medvault.test, doctor@medvault.test, worker@medvault.test');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
