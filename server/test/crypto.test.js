const test = require('node:test');
const assert = require('node:assert');
const { encryptJSON, decryptJSON } = require('../src/utils/crypto');
const { generateHealthId, HEALTH_ID_RE } = require('../src/utils/healthId');

test('AES-256-GCM round trip and tamper detection', () => {
  const obj = { name: 'Lakshmi', allergies: ['Penicillin'] };
  const enc = encryptJSON(obj);
  assert.ok(!enc.includes('Lakshmi'));
  assert.deepStrictEqual(decryptJSON(enc), obj);
  assert.notStrictEqual(encryptJSON(obj), enc); // random IV
  const buf = Buffer.from(enc, 'base64');
  buf[buf.length - 1] ^= 1;
  assert.throws(() => decryptJSON(buf.toString('base64')));
});

test('health ids match the format and are distinct', () => {
  const ids = new Set();
  for (let i = 0; i < 500; i++) { const id = generateHealthId(); assert.match(id, HEALTH_ID_RE); ids.add(id); }
  assert.strictEqual(ids.size, 500);
});
