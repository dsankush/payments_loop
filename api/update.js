'use strict';
const { db, send, authenticate, method, body, wrap } = require('../lib/auth');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TXN = /^[A-Za-z0-9]{6,40}$/;
const FUTURE_SLACK_MS = 10 * 60 * 1000;
const REMARK_MAX = 200;

module.exports = wrap(async (req, res) => {
  if (!method(req, res, 'POST')) return;
  const a = authenticate(req, res, 'person');
  if (!a) return;

  const { id, status, transaction_id, farmer_name, paid_at, remark, kind } = body(req);
  // 'rectification' entries live in their own table; everything else is a normal sheet number.
  const table = kind === 'rectification' ? 'rectifications' : 'farmers';
  const other = table === 'farmers' ? 'rectifications' : 'farmers';
  if (typeof id !== 'string' || !UUID.test(id)) return send(res, 400, { error: 'Invalid entry.' });
  if (status !== 'successful' && status !== 'failed' && status !== 'pending') return send(res, 400, { error: 'Invalid status.' });

  // The remark is the person's own note, e.g. why a payment failed.
  let note = null;
  if (remark !== undefined && remark !== null) {
    if (typeof remark !== 'string') return send(res, 400, { error: 'Invalid remark.' });
    note = remark.trim().replace(/\s+/g, ' ');
    if (note.length > REMARK_MAX) return send(res, 400, { error: `The remark can be at most ${REMARK_MAX} characters.` });
    if (!note) note = null;
  }

  // The time is whatever the person chose. If none is sent, the time of this request is used.
  let when = new Date();
  if (paid_at !== undefined && paid_at !== null && paid_at !== '') {
    when = new Date(paid_at);
    if (isNaN(when.getTime())) return send(res, 400, { error: 'Enter a valid date and time.' });
    if (when.getTime() > Date.now() + FUTURE_SLACK_MS) return send(res, 400, { error: 'Date and time cannot be in the future.' });
  }

  const supa = db();
  const { data: row, error: rErr } = await supa
    .from(table)
    .select('id,status,farmer_name')
    .eq('id', id)
    .eq('person_id', a.pid)
    .maybeSingle();
  if (rErr) throw rErr;
  if (!row) return send(res, 404, { error: 'This number was not found on your sheets.' });
  if (row.status === 'successful') return send(res, 409, { error: 'This number is already marked successful (locked).' });

  let patch;
  if (status === 'pending') {
    // Back to pending (or just a note on a pending number). The time of any earlier attempt stays in the history.
    patch = { status: 'pending', paid_at: null, transaction_id: null, remark: note };
  } else if (status === 'failed') {
    if (!note || note.length < 3) return send(res, 400, { error: 'Write the reason in the remark box before marking it failed.' });
    patch = { status: 'failed', paid_at: when.toISOString(), remark: note };
  } else {
    const txn = typeof transaction_id === 'string' ? transaction_id.trim() : '';
    if (!TXN.test(txn)) return send(res, 400, { error: 'Transaction ID must be 6 to 40 letters or digits, no spaces.' });
    // One Transaction ID can only ever be used once, across normal numbers and rectification entries.
    const { data: dup, error: dErr } = await supa.from(other).select('id').ilike('transaction_id', txn).limit(1);
    if (dErr) throw dErr;
    if (dup && dup.length) return send(res, 409, { error: 'This Transaction ID is already used for another number.' });
    patch = { status: 'successful', transaction_id: txn, paid_at: when.toISOString(), remark: null };
    // The farmer's name normally comes with the data and cannot be changed.
    // Only a number that came without a name needs one typed in now.
    if (!row.farmer_name) {
      const name = typeof farmer_name === 'string' ? farmer_name.trim().replace(/\s+/g, ' ') : '';
      if (name.length < 2 || name.length > 80) return send(res, 400, { error: 'Enter the farmer name (2 to 80 characters).' });
      patch.farmer_name = name;
    }
  }

  const { data, error } = await supa
    .from(table)
    .update(patch)
    .eq('id', id)
    .eq('person_id', a.pid)
    .neq('status', 'successful')
    .select('id,status,transaction_id,farmer_name,products,paid_at,state,remark')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') return send(res, 409, { error: 'This Transaction ID is already used for another number.' });
    throw error;
  }
  if (!data) return send(res, 409, { error: 'This number is already marked successful (locked) or is not yours.' });
  send(res, 200, { farmer: data });
});
