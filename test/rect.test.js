'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { rectReport } = require('../lib/rect');

const people = [{ id: 'A', name: 'Ankita' }, { id: 'B', name: 'Jeet' }];
const farmers = [
  { phone: '9000000001', prize_money: 100, person_id: 'A', sheet_no: 1, status: 'successful', transaction_id: 'T1', paid_at: '2026-10-05T00:00:00Z' }, // paid more than 60
  { phone: '9000000002', prize_money: 50, person_id: 'A', sheet_no: 1, status: 'successful' },                                                         // same
  { phone: '9000000003', prize_money: 25, person_id: 'B', sheet_no: 2, status: 'successful' },                                                         // paid less -> entry
  { phone: '9000000004', prize_money: 200, person_id: 'B', sheet_no: 2, status: 'pending' },                                                           // not paid: amount changed on row, no report
  { phone: '9000000005', prize_money: 150, person_id: 'B', sheet_no: 2, status: 'successful' },                                                        // out of scope (after 19 Oct)
];
const file = [
  { phone: '9000000001', rect_amount: 60, in_scope: true },
  { phone: '9000000002', rect_amount: 50, in_scope: true },
  { phone: '9000000003', rect_amount: 75, in_scope: true },
  { phone: '9000000004', rect_amount: 75, in_scope: true },
  { phone: '9000000005', rect_amount: 25, in_scope: false },
];
const rects = [
  { phone: '9000000003', person_id: 'B', sheet_no: 1, position: 1, amount: 75, paid_before: 25, status: 'pending' },
  { phone: '9000000099', person_id: 'A', sheet_no: 1, position: 1, amount: 30, paid_before: 10, status: 'successful' },
  { phone: '9000000098', person_id: 'A', sheet_no: 1, position: 2, amount: 20, paid_before: 10, status: 'failed' },
];

test('rectification report splits paid-less entries, paid-more list and same', () => {
  const r = rectReport({ people, farmers, rects, file });
  assert.strictEqual(r.summary.count, 3);
  assert.strictEqual(r.summary.total, 125);
  assert.strictEqual(r.summary.paid, 30);
  assert.strictEqual(r.summary.pending, 75);
  assert.strictEqual(r.summary.failed, 20);
  assert.deepStrictEqual(r.summary.byPerson.map((p) => [p.name, p.count, p.total, p.pending]), [['Ankita', 2, 50, 0], ['Jeet', 1, 75, 75]]);
  assert.strictEqual(r.overpaid.length, 1);
  assert.deepStrictEqual([r.overpaid[0].phone, r.overpaid[0].paid, r.overpaid[0].correct, r.overpaid[0].excess], ['9000000001', 100, 60, 40]);
  assert.strictEqual(r.overpaidExcess, 40);
  assert.strictEqual(r.same, 1, 'out-of-scope and unpaid numbers are not counted');
});
