'use strict';
const { send, authenticate, method, fetchAll, wrap } = require('../../lib/auth');
const { rectReport } = require('../../lib/rect');
const { paidReview } = require('../../lib/paidreview');

module.exports = wrap(async (req, res) => {
  if (!method(req, res, 'GET')) return;
  if (!authenticate(req, res, 'admin')) return;

  const people = await fetchAll('people', 'id,name', { order: ['name'] });
  const farmers = await fetchAll('farmers', 'phone,prize_money,person_id,sheet_no,position,status,farmer_name,products,paid_at,state,remark', {
    order: ['person_id', 'sheet_no', 'position'],
  });

  const byPerson = new Map(people.map((p) => [p.id, { name: p.name, sheets: new Map() }]));
  for (const f of farmers) {
    const p = byPerson.get(f.person_id);
    if (!p) continue;
    if (!p.sheets.has(f.sheet_no)) {
      p.sheets.set(f.sheet_no, { sheet_no: f.sheet_no, count: 0, total: 0, paid: 0, failed: 0, pending: 0, paidCount: 0, failedCount: 0, pendingCount: 0 });
    }
    const s = p.sheets.get(f.sheet_no);
    s.count++;
    s.total += f.prize_money;
    if (f.status === 'successful') { s.paid += f.prize_money; s.paidCount++; }
    else if (f.status === 'failed') { s.failed += f.prize_money; s.failedCount++; }
    else { s.pending += f.prize_money; s.pendingCount++; }
  }

  const overall = { numbers: 0, total: 0, paid: 0, failed: 0, pending: 0 };
  const out = [];
  for (const p of byPerson.values()) {
    const sheets = [...p.sheets.values()].sort((a, b) => a.sheet_no - b.sheet_no);
    const t = { numbers: 0, total: 0, paid: 0, failed: 0, pending: 0 };
    for (const s of sheets) {
      t.numbers += s.count; t.total += s.total; t.paid += s.paid; t.failed += s.failed; t.pending += s.pending;
    }
    // Failed amounts have not left, so they stay with the person and reduce the next top-up.
    const carry = t.failed;
    const next = sheets.find((s) => s.pendingCount === s.count);
    const nextSheet = next
      ? { sheet_no: next.sheet_no, total: next.total, carry, toSend: Math.max(0, next.total - carry) }
      : null;
    out.push({ name: p.name, ...t, carry, nextSheet, sheets });
    for (const k of Object.keys(overall)) overall[k] += t[k];
  }
  out.sort((a, b) => a.name.localeCompare(b.name));

  const failedList = farmers
    .filter((f) => f.status === 'failed')
    .map((f) => ({ phone: f.phone, prize_money: f.prize_money, person: byPerson.get(f.person_id)?.name, sheet_no: f.sheet_no, farmer_name: f.farmer_name, products: f.products, state: f.state, remark: f.remark, at: f.paid_at }));

  // Pending numbers that carry a note from the person (e.g. farmer not picking up).
  const notedList = farmers
    .filter((f) => f.status === 'pending' && f.remark)
    .map((f) => ({ phone: f.phone, prize_money: f.prize_money, person: byPerson.get(f.person_id)?.name, sheet_no: f.sheet_no, farmer_name: f.farmer_name, products: f.products, state: f.state, remark: f.remark }));

  // Totals by state. Numbers without a state are grouped as "Not set".
  const stateMap = new Map();
  for (const f of farmers) {
    const k = f.state || 'Not set';
    if (!stateMap.has(k)) stateMap.set(k, { state: k, numbers: 0, total: 0, paidCount: 0, paid: 0, failed: 0, pending: 0 });
    const t = stateMap.get(k);
    t.numbers++; t.total += f.prize_money;
    if (f.status === 'successful') { t.paidCount++; t.paid += f.prize_money; }
    else if (f.status === 'failed') t.failed += f.prize_money;
    else t.pending += f.prize_money;
  }
  const byState = [...stateMap.values()].sort((a, b) => b.paid - a.paid || a.state.localeCompare(b.state));

  // Successful payments grouped by calendar day (India time), newest day first.
  const dayOf = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const days = new Map();
  for (const f of farmers) {
    if (f.status !== 'successful' || !f.paid_at) continue;
    const day = dayOf(f.paid_at);
    if (!days.has(day)) days.set(day, { date: day, count: 0, amount: 0, byPerson: {} });
    const d = days.get(day);
    const name = byPerson.get(f.person_id)?.name;
    if (!name) continue;
    d.count++;
    d.amount += f.prize_money;
    d.byPerson[name] = d.byPerson[name] || { count: 0, amount: 0 };
    d.byPerson[name].count++;
    d.byPerson[name].amount += f.prize_money;
  }
  const daily = [...days.values()].sort((a, b) => (a.date < b.date ? 1 : -1));

  // Rectification: corrected-amount entries for numbers paid too little, and the list of numbers paid too much.
  const rects = await fetchAll('rectifications', 'phone,person_id,sheet_no,position,amount,paid_before,status,transaction_id,paid_at,farmer_name,state,remark', { order: ['person_id', 'position'] });
  const rect = rectReport({ people, rects });

  // Paid numbers that were paid more than (or exactly) the amount in the 23 Oct amount file. Listed only.
  const amountFile = await fetchAll('amount_file2', 'phone,new_amount,grp', { order: ['phone'] });
  const review = paidReview({ people, farmers, file: amountFile, rects });

  send(res, 200, { overall, people: out, failedList, notedList, byState, daily, rectification: rect.summary, rectEntries: rect.entries, paidReview: review.summary });
});
