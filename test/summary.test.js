'use strict';
const test = require('node:test');
const assert = require('node:assert');

process.env.SESSION_SECRET = 'test-secret-test-secret';
const auth = require('../lib/auth');

const people = [{ id: 'A', name: 'Ankita' }, { id: 'B', name: 'Jeet' }];
const mk = (person_id, sheet_no, position, prize_money, status, paid_at) => ({ phone: '9' + String(sheet_no * 100 + position).padStart(9, '0'), prize_money, person_id, sheet_no, status, paid_at, farmer_name: 'N', products: 'P' });
const farmers = [
  mk('A', 1, 1, 100, 'successful', '2026-10-09T20:00:00Z'), // 10 Oct 01:30 in India
  mk('A', 1, 2, 50, 'successful', '2026-10-10T05:00:00Z'),
  mk('B', 1, 1, 70, 'successful', '2026-10-09T10:00:00Z'), // 9 Oct in India
  mk('A', 1, 3, 25, 'failed', '2026-10-10T06:00:00Z'),      // failed: never counted as paid
  mk('B', 1, 2, 80, 'pending', null),
];
auth.fetchAll = async (table) => (table === 'people' ? people : farmers);
const handler = require('../api/admin/summary');

test('daily totals use India dates and count successful payments only', async () => {
  const token = auth.sign({ role: 'admin' });
  const out = await new Promise((resolve) => {
    const req = { method: 'GET', headers: { authorization: 'Bearer ' + token } };
    const res = { setHeader() {}, status(c) { this.code = c; return this; }, json(o) { resolve({ code: this.code, body: o }); } };
    handler(req, res);
  });
  assert.strictEqual(out.code, 200);
  const { daily, overall } = out.body;
  assert.deepStrictEqual(daily.map((d) => d.date), ['2026-10-10', '2026-10-09']);
  assert.deepStrictEqual(daily[0], { date: '2026-10-10', count: 2, amount: 150, byPerson: { Ankita: { count: 2, amount: 150 } } });
  assert.deepStrictEqual(daily[1], { date: '2026-10-09', count: 1, amount: 70, byPerson: { Jeet: { count: 1, amount: 70 } } });
  assert.strictEqual(overall.paid, 220);
  assert.strictEqual(daily.reduce((s, d) => s + d.amount, 0), overall.paid, 'days add up to the paid total');
});

test('state totals, failed list and pending notes carry state and remark', async () => {
  farmers[0].state = 'Karnataka'; farmers[1].state = 'Karnataka'; farmers[2].state = 'Telangana';
  farmers[3].state = 'Karnataka'; farmers[3].remark = 'Number switched off';
  farmers[4].state = null; farmers[4].remark = 'Call back after 5';
  const token = auth.sign({ role: 'admin' });
  const out = await new Promise((resolve) => {
    const req = { method: 'GET', headers: { authorization: 'Bearer ' + token } };
    const res = { setHeader() {}, status(c) { this.code = c; return this; }, json(o) { resolve({ code: this.code, body: o }); } };
    handler(req, res);
  });
  const { byState, failedList, notedList, overall } = out.body;
  const kn = byState.find((s) => s.state === 'Karnataka');
  assert.deepStrictEqual(kn, { state: 'Karnataka', numbers: 3, total: 175, paidCount: 2, paid: 150, failed: 25, pending: 0 });
  assert.strictEqual(byState.find((s) => s.state === 'Telangana').paid, 70);
  assert.strictEqual(byState.find((s) => s.state === 'Not set').pending, 80);
  assert.strictEqual(byState.reduce((s, x) => s + x.paid, 0), overall.paid);
  assert.strictEqual(byState.reduce((s, x) => s + x.numbers, 0), overall.numbers);
  assert.strictEqual(failedList[0].remark, 'Number switched off');
  assert.strictEqual(failedList[0].state, 'Karnataka');
  assert.strictEqual(notedList.length, 1);
  assert.strictEqual(notedList[0].remark, 'Call back after 5');
});
