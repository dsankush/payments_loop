'use strict';
const { send, authenticate, method, fetchAll, wrap } = require('../../lib/auth');
const { rectReport } = require('../../lib/rect');

function cell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

module.exports = wrap(async (req, res) => {
  if (!method(req, res, 'GET')) return;
  if (!authenticate(req, res, 'admin')) return;

  const people = await fetchAll('people', 'id,name');
  const which = (req.query && req.query.type) || '';
  if (which === 'rectification' || which === 'overpaid') return exportRect(req, res, people, which);
  const names = new Map(people.map((p) => [p.id, p.name]));
  const rows = await fetchAll(
    'farmers',
    'phone,prize_money,person_id,sheet_no,position,status,transaction_id,paid_at,farmer_name,products,state,remark',
    { order: ['person_id', 'sheet_no', 'position'] }
  );
  rows.sort((a, b) => (names.get(a.person_id) || '').localeCompare(names.get(b.person_id) || '') || a.sheet_no - b.sheet_no || a.position - b.position);

  const head = ['Person', 'Sheet', 'Farmer Number', 'Prize Money', 'Status', 'Transaction ID', 'Date and Time (IST)', 'Name of the Farmer', 'State', 'Products Purchased', 'Remark'];
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
      r.state,
      r.products,
      r.remark,
    ].map(cell).join(','));
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="farmer-payments.csv"');
  res.status(200).send('﻿' + lines.join('\r\n'));
});

const ist = (v) => (v ? new Date(v).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '');
function csv(res, name, lines) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.status(200).send('\ufeff' + lines.join('\r\n'));
}

async function exportRect(req, res, people, which) {
  const farmers = await fetchAll('farmers', 'phone,prize_money,person_id,sheet_no,status,transaction_id,paid_at,farmer_name,state', { order: ['phone'] });
  const rects = await fetchAll('rectifications', 'phone,person_id,sheet_no,position,amount,paid_before,status,transaction_id,paid_at,farmer_name,state,remark', { order: ['person_id', 'position'] });
  const file = await fetchAll('rectification_file', 'phone,rect_amount,in_scope', { order: ['phone'] });
  const r = rectReport({ people, farmers, rects, file });
  if (which === 'overpaid') {
    const lines = [['Person', 'Sheet', 'Farmer Number', 'Name of the Farmer', 'State', 'Amount Paid', 'Correct Amount', 'Paid Extra', 'Transaction ID', 'Paid On (IST)'].join(',')];
    for (const o of r.overpaid) lines.push([o.person, 'Sheet ' + o.sheet_no, o.phone, o.farmer_name, o.state, o.paid, o.correct, o.excess, o.transaction_id, ist(o.paid_at)].map(cell).join(','));
    return csv(res, 'paid-more-than-corrected.csv', lines);
  }
  const lines = [['Person', 'Farmer Number', 'Rectified Amount', 'Already Paid Before', 'Status', 'Transaction ID', 'Date and Time (IST)', 'Name of the Farmer', 'State', 'Remark'].join(',')];
  for (const e of r.entries) lines.push([e.person, e.phone, e.amount, e.paid_before, e.status, e.transaction_id, ist(e.paid_at), e.farmer_name, e.state, e.remark].map(cell).join(','));
  csv(res, 'rectification-payments.csv', lines);
}
