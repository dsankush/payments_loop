'use strict';
const { db, send, authenticate, method, body, wrap } = require('../lib/auth');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TXN = /^[A-Za-z0-9]{6,40}$/;

module.exports = wrap(async (req, res) => {
  if (!method(req, res, 'POST')) return;
  const a = authenticate(req, res, 'person');
  if (!a) return;

  const { id, status, transaction_id, farmer_name, paid_at } = body(req);
  if (typeof id !== 'string' || !UUID.test(id)) return send(res, 400, { error: 'Invalid entry.' });
  if (status !== 'successful' && status !== 'failed') return send(res, 400, { error: 'Invalid status.' });

  let patch;
  if (status === 'failed') {
    patch = { status: 'failed' };
  } else {
    const txn = typeof transaction_id === 'string' ? transaction_id.trim() : '';
    const name = typeof farmer_name === 'string' ? farmer_name.trim().replace(/\s+/g, ' ') : '';
    const when = new Date(paid_at);
    if (!TXN.test(txn)) return send(res, 400, { error: 'Transaction ID must be 6 to 40 letters or digits, no spaces.' });
    if (name.length < 2 || name.length > 80) return send(res, 400, { error: 'Enter the farmer name (2 to 80 characters).' });
    if (isNaN(when.getTime())) return send(res, 400, { error: 'Enter a valid date and time.' });
    if (when.getTime() > Date.now() + 10 * 60 * 1000) return send(res, 400, { error: 'Date and time cannot be in the future.' });
    patch = { status: 'successful', transaction_id: txn, farmer_name: name, paid_at: when.toISOString() };
  }

  const { data, error } = await db()
    .from('farmers')
    .update(patch)
    .eq('id', id)
    .eq('person_id', a.pid)
    .neq('status', 'successful')
    .select('id,status,transaction_id,farmer_name,paid_at')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') return send(res, 409, { error: 'This Transaction ID is already used for another number.' });
    throw error;
  }
  if (!data) return send(res, 409, { error: 'This number is already marked successful (locked) or is not yours.' });
  send(res, 200, { farmer: data });
});
