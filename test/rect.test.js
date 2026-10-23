'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { rectReport } = require('../lib/rect');

const people = [{ id: 'A', name: 'Ankita' }, { id: 'B', name: 'Jeet' }];
const rects = [
  { phone: '9000000003', person_id: 'B', sheet_no: 1, position: 1, amount: 75, paid_before: 25, status: 'pending' },
  { phone: '9000000099', person_id: 'A', sheet_no: 2, position: 1, amount: 30, paid_before: 10, status: 'successful' },
  { phone: '9000000098', person_id: 'A', sheet_no: 1, position: 2, amount: 20, paid_before: 100, status: 'failed' },
];

test('rectification report totals per person and status', () => {
  const r = rectReport({ people, rects });
  assert.strictEqual(r.summary.count, 3);
  assert.strictEqual(r.summary.total, 125);
  assert.strictEqual(r.summary.paid, 30);
  assert.strictEqual(r.summary.pending, 75);
  assert.strictEqual(r.summary.failed, 20);
  assert.deepStrictEqual(r.summary.byPerson.map((p) => [p.name, p.count, p.total, p.pending]), [['Ankita', 2, 50, 0], ['Jeet', 1, 75, 75]]);
  assert.deepStrictEqual(r.entries.map((e) => e.phone), ['9000000098', '9000000099', '9000000003'], 'sorted by person, sheet, position');
});
