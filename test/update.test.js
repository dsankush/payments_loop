'use strict';
const test = require('node:test');
const assert = require('node:assert');

process.env.SESSION_SECRET = 'test-secret-test-secret';
const auth = require('../lib/auth');

// A tiny in-memory stand-in for the farmers table.
const rows = [];
const mkRow = (o) => ({ id: o.id, person_id: 'P1', status: 'pending', transaction_id: null, farmer_name: null, products: null, paid_at: null, ...o });
function fakeDb() {
  return {
    from() {
      const q = { op: 'select', filters: [], neq: [], patch: null };
      const match = () => rows.filter((r) => q.filters.every(([k, v]) => r[k] === v) && q.neq.every(([k, v]) => r[k] !== v));
      const api = {
        select() { return api; },
        update(p) { q.op = 'update'; q.patch = p; return api; },
        eq(k, v) { q.filters.push([k, v]); return api; },
        neq(k, v) { q.neq.push([k, v]); return api; },
        async maybeSingle() {
          const m = match()[0];
          if (!m) return { data: null, error: null };
          if (q.op === 'update') {
            if (q.patch.transaction_id && rows.some((r) => r.id !== m.id && r.transaction_id === q.patch.transaction_id)) {
              return { data: null, error: { code: '23505' } };
            }
            Object.assign(m, q.patch);
          }
          return { data: { ...m }, error: null };
        },
      };
      return api;
    },
  };
}
auth.db = fakeDb;
const handler = require('../api/update');

function call(token, payload) {
  return new Promise((resolve) => {
    const req = { method: 'POST', headers: { authorization: 'Bearer ' + token }, body: payload };
    const res = { headers: {}, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { resolve({ code: this.code, body: o }); } };
    handler(req, res);
  });
}
const tok = auth.sign({ role: 'person', pid: 'P1', name: 'Ankita' });
const ID1 = '00000000-0000-4000-8000-000000000001';
const ID2 = '00000000-0000-4000-8000-000000000002';
const ID3 = '00000000-0000-4000-8000-000000000003';
rows.push(mkRow({ id: ID1, farmer_name: 'Given Name' }), mkRow({ id: ID2 }), mkRow({ id: ID3, farmer_name: 'Other', person_id: 'P2' }));

test('paid with a given name: name is not taken from the request, time is kept', async () => {
  const when = new Date(Date.now() - 3600 * 1000).toISOString();
  const r = await call(tok, { id: ID1, status: 'successful', transaction_id: 'UPI123456', farmer_name: 'Hacker', paid_at: when });
  assert.strictEqual(r.code, 200);
  assert.strictEqual(r.body.farmer.farmer_name, 'Given Name');
  assert.strictEqual(r.body.farmer.paid_at, when);
});

test('a paid number is locked', async () => {
  const r = await call(tok, { id: ID1, status: 'failed' });
  assert.strictEqual(r.code, 409);
});

test('no time sent: the server uses the current time (failed needs a remark)', async () => {
  const t0 = Date.now();
  const r = await call(tok, { id: ID2, status: 'failed', remark: 'Farmer phone switched off' });
  assert.strictEqual(r.code, 200);
  assert.ok(Math.abs(new Date(r.body.farmer.paid_at).getTime() - t0) < 3000);
});

test('number without a name needs one; transaction id rules; future time refused', async () => {
  let r = await call(tok, { id: ID2, status: 'successful', transaction_id: 'UPI777777' });
  assert.strictEqual(r.code, 400);
  r = await call(tok, { id: ID2, status: 'successful', transaction_id: 'bad id', farmer_name: 'Typed Name' });
  assert.strictEqual(r.code, 400);
  r = await call(tok, { id: ID2, status: 'successful', transaction_id: 'UPI777777', farmer_name: 'Typed Name', paid_at: new Date(Date.now() + 3600e3).toISOString() });
  assert.strictEqual(r.code, 400);
  r = await call(tok, { id: ID2, status: 'successful', transaction_id: 'UPI777777', farmer_name: 'Typed Name', paid_at: 'nonsense' });
  assert.strictEqual(r.code, 400);
  r = await call(tok, { id: ID2, status: 'successful', transaction_id: 'UPI777777', farmer_name: 'Typed Name' });
  assert.strictEqual(r.code, 200);
  assert.strictEqual(r.body.farmer.farmer_name, 'Typed Name');
});

test('failed needs a reason; pending can carry a note; remark rules', async () => {
  rows.push(mkRow({ id: '00000000-0000-4000-8000-000000000005', farmer_name: 'Remark Farmer' }));
  const R = '00000000-0000-4000-8000-000000000005';
  let r = await call(tok, { id: R, status: 'failed' });
  assert.strictEqual(r.code, 400);
  assert.match(r.body.error, /remark/i);
  r = await call(tok, { id: R, status: 'failed', remark: '  ' });
  assert.strictEqual(r.code, 400);
  r = await call(tok, { id: R, status: 'failed', remark: 'x'.repeat(201) });
  assert.strictEqual(r.code, 400);
  r = await call(tok, { id: R, status: 'failed', remark: 'Bank  server   down' });
  assert.strictEqual(r.code, 200);
  assert.strictEqual(r.body.farmer.status, 'failed');
  assert.strictEqual(r.body.farmer.remark, 'Bank server down');
  // back to pending with a note: time and transaction cleared
  r = await call(tok, { id: R, status: 'pending', remark: 'Will retry tomorrow' });
  assert.strictEqual(r.code, 200);
  assert.strictEqual(r.body.farmer.status, 'pending');
  assert.strictEqual(r.body.farmer.paid_at, null);
  assert.strictEqual(r.body.farmer.remark, 'Will retry tomorrow');
  // pending without a note is fine and clears it
  r = await call(tok, { id: R, status: 'pending' });
  assert.strictEqual(r.code, 200);
  assert.strictEqual(r.body.farmer.remark, null);
  // paying clears the failure remark
  await call(tok, { id: R, status: 'failed', remark: 'Wrong UPI id' });
  r = await call(tok, { id: R, status: 'successful', transaction_id: 'UPI999999', remark: 'ignored' });
  assert.strictEqual(r.code, 200);
  assert.strictEqual(r.body.farmer.remark, null);
  // and now it is locked for pending too
  r = await call(tok, { id: R, status: 'pending', remark: 'oops' });
  assert.strictEqual(r.code, 409);
  r = await call(tok, { id: ID3, status: 'bogus' });
  assert.strictEqual(r.code, 400);
});

test("someone else's number and bad ids are refused", async () => {
  let r = await call(tok, { id: ID3, status: 'failed', remark: 'test reason' });
  assert.strictEqual(r.code, 404);
  r = await call(tok, { id: 'abc', status: 'failed' });
  assert.strictEqual(r.code, 400);
  r = await call('bad-token', { id: ID3, status: 'failed' });
  assert.strictEqual(r.code, 401);
});

test('a duplicate transaction id is reported clearly', async () => {
  rows.push(mkRow({ id: '00000000-0000-4000-8000-000000000004', farmer_name: 'Dup' }));
  const r = await call(tok, { id: '00000000-0000-4000-8000-000000000004', status: 'successful', transaction_id: 'UPI123456' });
  assert.strictEqual(r.code, 409);
  assert.match(r.body.error, /already used/);
});
