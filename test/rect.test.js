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

const { paidReview } = require('../lib/paidreview');
test('paid review lists paid-more and same, skips numbers with a rectification entry and out-of-window ones', () => {
  const farmers = [
    { phone: '9000000001', prize_money: 100, person_id: 'A', sheet_no: 1, position: 1, status: 'successful' }, // more
    { phone: '9000000002', prize_money: 50, person_id: 'A', sheet_no: 1, position: 2, status: 'successful' },  // same
    { phone: '9000000003', prize_money: 25, person_id: 'B', sheet_no: 1, position: 1, status: 'successful' },  // has entry
    { phone: '9000000004', prize_money: 75, person_id: 'B', sheet_no: 1, position: 2, status: 'pending' },     // not paid
    { phone: '9000000005', prize_money: 150, person_id: 'B', sheet_no: 1, position: 3, status: 'successful' }, // outside window
  ];
  const file = [
    { phone: '9000000001', new_amount: 60, grp: 'w' }, { phone: '9000000002', new_amount: 50, grp: 'w' },
    { phone: '9000000003', new_amount: 75, grp: 'w' }, { phone: '9000000004', new_amount: 50, grp: 'w' },
    { phone: '9000000005', new_amount: 25, grp: 'b' },
  ];
  const r = paidReview({ people, farmers, file, rects: [{ phone: '9000000003' }] });
  assert.deepStrictEqual(r.rows.map((x) => [x.phone, x.kind, x.diff]), [['9000000001', 'more', 40], ['9000000002', 'same', 0]]);
  assert.deepStrictEqual(r.summary, { more: 1, same: 1, excess: 40 });
});
