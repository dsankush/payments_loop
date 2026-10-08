'use strict';
const { db, send, authenticate, method, body, wrap } = require('../lib/auth');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TXN = /^[A-Za-z0-9]{6,40}$/;
const FUTURE_SLACK_MS = 10 * 60 * 1000;

module.exports = wrap(async (req, res) => {
  if (!method(req, res, 'POST')) return;
  const a = authenticate(req, res, 'person');
  if (!a) return;

  const { id, status, transaction_id, farmer_name, paid_at } = body(req);
  if (typeof id !== 'string' || !UUID.test(id)) return send(res, 400, { error: 'Invalid entry.' });
  if (status !== 'successful' && status !== 'failed') return send(res, 400, { error: 'Invalid status.' });

  // The time is whatever the person chose. If none is sent, the time of this request is used.
  let when = new Date();
  if (paid_at !== undefined && paid_at !== null && paid_at !== '') {
    when = new Date(paid_at);
    if (isNaN(when.getTime())) return send(res, 400, { error: 'Enter a valid date and time.' });
    if (when.getTime() > Date.now() + FUTURE_SLACK_MS) return send(res, 400, { error: 'Date and time cannot be in the future.' });
  }

  const supa = db();
  const { data: row, error: rErr } = await supa
    .from('farmers')
    .select('id,status,farmer_name')
    .eq('id', id)
    .eq('person_id', a.pid)
    .maybeSingle();
  if (rErr) throw rErr;
  if (!row) return send(res, 404, { error: 'This number was not found on your sheets.' });
  if (row.status === 'successful') return send(res, 409, { error: 'This number is already marked successful (locked).' });

  let patch;
  if (status === 'failed') {
    patch = { status: 'failed', paid_at: when.toISOString() };
  } else {
    const txn = typeof transaction_id === 'string' ? transaction_id.trim() : '';
    if (!TXN.test(txn)) return send(res, 400, { error: 'Transaction ID must be 6 to 40 letters or digits, no spaces.' });
    patch = { status: 'successful', transaction_id: txn, paid_at: when.toISOString() };
    // The farmer's name normally comes with the data and cannot be changed.
    // Only a number that came without a name needs one typed in now.
    if (!row.farmer_name) {
      const name = typeof farmer_name === 'string' ? farmer_name.trim().replace(/\s+/g, ' ') : '';
      if (name.length < 2 || name.length > 80) return send(res, 400, { error: 'Enter the farmer name (2 to 80 characters).' });
      patch.farmer_name = name;
    }
  }

  const { data, error } = await supa
    .from('farmers')
    .update(patch)
    .eq('id', id)
    .eq('person_id', a.pid)
    .neq('status', 'successful')
    .select('id,status,transaction_id,farmer_name,products,paid_at')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') return send(res, 409, { error: 'This Transaction ID is already used for another number.' });
    throw error;
  }
  if (!data) return send(res, 409, { error: 'This number is already marked successful (locked) or is not yours.' });
  send(res, 200, { farmer: data });
});
