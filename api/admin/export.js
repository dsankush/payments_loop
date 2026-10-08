'use strict';
const { send, authenticate, method, fetchAll, wrap } = require('../../lib/auth');

function cell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

module.exports = wrap(async (req, res) => {
  if (!method(req, res, 'GET')) return;
  if (!authenticate(req, res, 'admin')) return;

  const people = await fetchAll('people', 'id,name');
  const names = new Map(people.map((p) => [p.id, p.name]));
  const rows = await fetchAll(
    'farmers',
    'phone,prize_money,person_id,sheet_no,position,status,transaction_id,paid_at,farmer_name',
    { order: ['person_id', 'sheet_no', 'position'] }
  );
  rows.sort((a, b) => (names.get(a.person_id) || '').localeCompare(names.get(b.person_id) || '') || a.sheet_no - b.sheet_no || a.position - b.position);

  const head = ['Person', 'Sheet', 'Farmer Number', 'Prize Money', 'Status', 'Transaction ID', 'Date and Time', 'Name of the Farmer'];
  const lines = [head.join(',')];
  for (const r of rows) {
    lines.push([
      names.get(r.person_id),
      'Sheet ' + r.sheet_no,
      r.phone,
      r.prize_money,
      r.status,
      r.transaction_id,
      r.paid_at ? new Date(r.paid_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
      r.farmer_name,
    ].map(cell).join(','));
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="farmer-payments.csv"');
  res.status(200).send('﻿' + lines.join('\r\n'));
});
