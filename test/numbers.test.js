'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { normalize, randomPrize, allocate } = require('../lib/numbers');

const mk = (n, start = 6000000000) => Array.from({ length: n }, (_, i) => String(start + i + 3000000000));

test('normalize cleans, dedupes and rejects bad numbers', () => {
  const r = normalize('9876543210, +91 98765 43211\n09876543212 9876543210 12345 5876543210');
  assert.deepStrictEqual(r.valid, ['9876543210', '9876543211', '9876543212']);
  assert.strictEqual(r.duplicatesInPaste, 1);
  assert.deepStrictEqual(r.invalid.sort(), ['12345', '5876543210'].sort());
});

test('randomPrize always 25..200 and covers both ends over many draws', () => {
  let min = 999, max = 0;
  for (let i = 0; i < 20000; i++) { const p = randomPrize(); assert.ok(Number.isInteger(p)); min = Math.min(min, p); max = Math.max(max, p); }
  assert.strictEqual(min, 25);
  assert.strictEqual(max, 200);
});

const fresh = (names, last = {}) => Object.fromEntries(names.map((n) => [n, { lastSheet: (last[n] || [0, 15])[0], lastCount: (last[n] || [0, 15])[1] }]));

test('auto: 40 numbers over 3 people, sheets of 15 dealt in turn, last shorter', () => {
  const people = ['A', 'B', 'C'];
  const r = allocate({ pool: mk(40), people, state: fresh(people), mode: 'auto', counts: {}, topUp: false });
  assert.strictEqual(r.rows.length, 40);
  assert.deepStrictEqual(r.plan.A, [{ sheet: 1, count: 15, kind: 'new sheet' }]);
  assert.deepStrictEqual(r.plan.B, [{ sheet: 1, count: 15, kind: 'new sheet' }]);
  assert.deepStrictEqual(r.plan.C, [{ sheet: 1, count: 10, kind: 'new sheet' }]);
});

test('top-up fills the short sheet first (Dean has 10 of 15 on sheet 3)', () => {
  const people = ['Dean', 'Jeet'];
  const state = fresh(people, { Dean: [3, 10], Jeet: [2, 15] });
  const r = allocate({ pool: mk(20), people, state, mode: 'auto', counts: {}, topUp: true });
  const deanRows = r.rows.filter((x) => x.name === 'Dean');
  assert.deepStrictEqual(deanRows.map((x) => [x.sheet_no, x.position]).slice(0, 5), [[3, 11], [3, 12], [3, 13], [3, 14], [3, 15]]);
  assert.strictEqual(r.rows.length, 20);
  assert.ok(r.plan.Dean[0].kind === 'top-up' && r.plan.Dean[0].count === 5);
});

test('without top-up the short sheet is left alone and a new sheet starts', () => {
  const people = ['Dean'];
  const r = allocate({ pool: mk(4), people, state: fresh(people, { Dean: [3, 10] }), mode: 'auto', counts: {}, topUp: false });
  assert.deepStrictEqual(r.rows.map((x) => [x.sheet_no, x.position]), [[4, 1], [4, 2], [4, 3], [4, 4]]);
});

test('manual counts and over-asking', () => {
  const people = ['A', 'B'];
  const r = allocate({ pool: mk(10), people, state: fresh(people), mode: 'manual', counts: { A: 3, B: 4 }, topUp: false });
  assert.strictEqual(r.rows.filter((x) => x.name === 'A').length, 3);
  assert.strictEqual(r.rows.filter((x) => x.name === 'B').length, 4);
  assert.strictEqual(r.unassigned, 3);
  assert.throws(() => allocate({ pool: mk(5), people, state: fresh(people), mode: 'manual', counts: { A: 4, B: 4 }, topUp: false }));
});

test('no duplicate numbers or (sheet, position) pairs in any allocation', () => {
  const people = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  const r = allocate({ pool: mk(250), people, state: fresh(people), mode: 'auto', counts: {}, topUp: true });
  assert.strictEqual(new Set(r.rows.map((x) => x.phone)).size, 250);
  assert.strictEqual(new Set(r.rows.map((x) => `${x.name}|${x.sheet_no}|${x.position}`)).size, 250);
  assert.ok(r.rows.every((x) => x.position >= 1 && x.position <= 15));
});
