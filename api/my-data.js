'use strict';
const { send, authenticate, method, fetchAll, wrap } = require('../lib/auth');

module.exports = wrap(async (req, res) => {
  if (!method(req, res, 'GET')) return;
  const a = authenticate(req, res, 'person');
  if (!a) return;
  const rows = await fetchAll(
    'farmers',
    'id,phone,prize_money,sheet_no,position,status,transaction_id,farmer_name,products,paid_at',
    { filter: (q) => q.eq('person_id', a.pid), order: ['sheet_no', 'position'] }
  );
  send(res, 200, { name: a.name, farmers: rows });
});
