const test = require('node:test');
const assert = require('node:assert');
const { mergeRecords } = require('../src/utils/merge');

const rec = (data, ts, dev) => ({
  data,
  clock: Object.fromEntries(Object.keys(data).map((k) => [k, ts])),
  clockBy: Object.fromEntries(Object.keys(data).map((k) => [k, dev])),
});

test('newer field wins, other fields from both sides are kept', () => {
  const a = rec({ name: 'A', phone: '1' }, 100, 'dev1');
  const b = { data: { phone: '2', village: 'V' }, clock: { phone: 200, village: 200 }, clockBy: { phone: 'dev2', village: 'dev2' } };
  const m = mergeRecords(a, b);
  assert.deepStrictEqual(m.data, { name: 'A', phone: '2', village: 'V' });
  assert.deepStrictEqual(m.conflicts, ['phone']);
});

test('commutative, associative, idempotent (replicas converge)', () => {
  const a = rec({ x: 1, y: 1 }, 100, 'a');
  const b = rec({ x: 2, z: 2 }, 150, 'b');
  const c = rec({ y: 3, x: 3 }, 150, 'c'); // ties with b on x -> device id breaks tie
  const norm = (m) => JSON.stringify([m.data, m.clock, m.clockBy]);
  assert.strictEqual(norm(mergeRecords(a, b)), norm(mergeRecords(b, a)));
  assert.strictEqual(norm(mergeRecords(mergeRecords(a, b), c)), norm(mergeRecords(a, mergeRecords(b, c))));
  assert.strictEqual(norm(mergeRecords(a, a)), norm(mergeRecords(mergeRecords(a, a), a)));
  assert.strictEqual(mergeRecords(mergeRecords(a, b), c).data.x, 3);
});

test('tombstone (deleted) is an ordinary LWW field', () => {
  const a = rec({ name: 'A', deleted: false }, 100, 'a');
  const b = { data: { deleted: true }, clock: { deleted: 300 }, clockBy: { deleted: 'b' } };
  assert.strictEqual(mergeRecords(a, b).data.deleted, true);
  const undo = { data: { deleted: false }, clock: { deleted: 200 }, clockBy: { deleted: 'a' } };
  assert.strictEqual(mergeRecords(mergeRecords(a, b), undo).data.deleted, true);
});
