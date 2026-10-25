// Offline-layer tests. Run with: npm test (Node 20+, no browser needed)
import test from 'node:test';
import assert from 'node:assert';
import { webcrypto } from 'node:crypto';
import * as store from '../src/lib/store.js';
import { deriveKey, makeVerifier, checkVerifier, encryptJSON, decryptJSON, randomBytes } from '../src/lib/crypto.js';
import { normaliseHealthId, generateHealthId } from '../src/lib/ids.js';
import { mergeRecords } from '../src/lib/merge.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const serverMerge = require('../../server/src/utils/merge.js').mergeRecords; // the real server algorithm

if (!globalThis.crypto) globalThis.crypto = webcrypto;

// Minimal in-memory stand-in for the Dexie API used by store.js
function fakeDb() {
  const tables = {};
  const t = (name) => (tables[name] ||= new Map());
  const wrap = (name) => ({
    put: async (row) => { t(name).set(row.uid, structuredClone(row)); },
    get: async (uid) => { const r = t(name).get(uid); return r ? structuredClone(r) : undefined; },
    toArray: async () => [...t(name).values()].map((r) => structuredClone(r)),
    clear: async () => t(name).clear(),
    where: (idx) => ({
      equals: (v) => {
        const rows = () => [...t(name).values()].filter((r) => r[idx] === v).map((r) => structuredClone(r));
        return { toArray: async () => rows(), first: async () => rows()[0], count: async () => rows().length };
      },
    }),
  });
  return { table: wrap };
}

async function device(name, password = 'pw-12345678') {
  const key = await deriveKey(password, new Uint8Array(16));
  const db = fakeDb();
  return { db, key, name };
}
const use = (d) => store.bind(d.db, d.key, d.name);

test('AES-GCM: round trip, wrong password rejected, ciphertext hides data', async () => {
  const k1 = await deriveKey('right-password', new Uint8Array(16));
  const k2 = await deriveKey('wrong-password', new Uint8Array(16));
  const blob = await encryptJSON(k1, { name: 'Lakshmi' });
  assert.ok(!Buffer.from(blob.ct).toString('utf8').includes('Lakshmi'));
  assert.deepStrictEqual(await decryptJSON(k1, blob), { name: 'Lakshmi' });
  const ver = await makeVerifier(k1);
  assert.equal(await checkVerifier(k1, ver), true);
  assert.equal(await checkVerifier(k2, ver), false);
});

test('health id normalisation accepts QR/typed variants', () => {
  const id = generateHealthId();
  assert.equal(normaliseHealthId(id.toLowerCase().replace(/-/g, ' ')), id);
  assert.equal(normaliseHealthId('nonsense'), null);
});

test('client merge equals server merge', () => {
  const a = { data: { x: 1, y: 2 }, clock: { x: 10, y: 20 }, clockBy: { x: 'a', y: 'a' } };
  const b = { data: { x: 9, z: 3 }, clock: { x: 15, z: 5 }, clockBy: { x: 'b', z: 'b' } };
  assert.deepStrictEqual(mergeRecords(a, b), serverMerge(a, b));
});

test('offline create/search/update; data is encrypted at rest; queue tracks pending', async () => {
  const d = await device('dev1'); use(d);
  const p = await store.createPatient({ name: 'Murugan K', village: 'Villupuram', allergies: [] });
  assert.match(p.data.healthId, /^MV-/);
  const raw = [...(await d.db.table('patients').toArray())][0];
  assert.ok(!JSON.stringify(Array.from(raw.blob.ct)).includes('Murugan'));
  assert.ok(!('name' in raw));
  assert.equal((await store.findPatientByHealthId(p.data.healthId)).uid, p.uid);
  await store.updatePatient(p.uid, { village: 'Cuddalore' });
  assert.equal((await store.listPatients())[0].data.village, 'Cuddalore');
  await store.addChild('visits', { patientId: p.uid, complaint: 'Fever' });
  assert.equal(await store.pendingCount(), 2);
  const changes = await store.pendingChanges();
  assert.deepEqual(changes.map((c) => c.collection), ['patients', 'visits']); // parents pushed first
});

test('wrong key cannot read another user\'s rows', async () => {
  const d = await device('dev1'); use(d);
  await store.createPatient({ name: 'Secret' });
  store.bind(d.db, await deriveKey('other-password', new Uint8Array(16)), 'dev1');
  await assert.rejects(store.listPatients());
});

test('two devices edit the same patient offline and converge, no duplicates', async () => {
  // simulated server = Map of uid -> record using the real server merge
  const server = new Map();
  const serverPush = (changes) => changes.map(({ collection, record }) => {
    const cur = server.get(record.uid);
    const m = cur ? serverMerge(cur, record) : { data: record.data, clock: record.clock, clockBy: record.clockBy };
    const stored = { uid: record.uid, data: m.data, clock: m.clock, clockBy: m.clockBy, version: (cur ? cur.version : 0) + 1 };
    server.set(record.uid, stored);
    return { collection, record: stored };
  });
  const sync = async (d) => {
    use(d);
    for (const r of serverPush(await store.pendingChanges())) await store.applyRemote(r.collection, r.record);
    for (const rec of server.values()) await store.applyRemote('patients', rec);
  };

  const A = await device('A'), B = await device('B');
  use(A);
  const p = await store.createPatient({ name: 'Fathima', phone: '111', village: 'Cuddalore' });
  await sync(A); await sync(B); // B downloads the patient
  assert.equal((await (use(B), store.listPatients())).length, 1);

  await new Promise((r) => setTimeout(r, 5));
  use(A); await store.updatePatient(p.uid, { phone: '222' });                  // A edits phone
  await new Promise((r) => setTimeout(r, 5));
  use(B); await store.updatePatient(p.uid, { village: 'Villupuram', phone: '333' }); // B edits phone (later) + village
  await sync(B); await sync(A); await sync(B); await sync(A); await sync(B);   // retries are harmless

  for (const d of [A, B]) {
    use(d);
    const list = await store.listPatients();
    assert.equal(list.length, 1);
    assert.equal(list[0].data.phone, '333');         // latest write wins
    assert.equal(list[0].data.village, 'Villupuram'); // non-conflicting field merged
    assert.equal(await store.pendingCount(), 0);      // queue drained
  }
});

test('local edit made while a push was in flight stays queued', async () => {
  const d = await device('A'); use(d);
  const p = await store.createPatient({ name: 'Arjun' });
  const sent = (await store.pendingChanges())[0].record;            // push starts
  await new Promise((r) => setTimeout(r, 5));
  await store.updatePatient(p.uid, { name: 'Arjun S' });             // user edits meanwhile
  await store.applyRemote('patients', { ...sent, version: 1 });      // server ack arrives
  assert.equal(await store.pendingCount(), 1);                       // newer edit still pending
  assert.equal((await store.listPatients())[0].data.name, 'Arjun S');
});
