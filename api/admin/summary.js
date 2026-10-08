'use strict';
const { send, authenticate, method, fetchAll, wrap } = require('../../lib/auth');

module.exports = wrap(async (req, res) => {
  if (!method(req, res, 'GET')) return;
  if (!authenticate(req, res, 'admin')) return;

  const people = await fetchAll('people', 'id,name', { order: ['name'] });
  const farmers = await fetchAll('farmers', 'phone,prize_money,person_id,sheet_no,status', {
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
    .map((f) => ({ phone: f.phone, prize_money: f.prize_money, person: byPerson.get(f.person_id)?.name, sheet_no: f.sheet_no }));

  send(res, 200, { overall, people: out, failedList });
});
