'use strict';

/**
 * Rectification report.
 *  - entries : the new "Rectification" payments (numbers that had been paid LESS than the corrected amount)
 *  - overpaid: numbers already paid MORE than the corrected amount. No payment is created; only listed.
 *  - same    : paid exactly the corrected amount, nothing to do.
 * `file` is the corrected-amount list: [{ phone, rect_amount, in_scope }]. Only in_scope rows count.
 */
function rectReport({ people, farmers, rects, file }) {
  const names = new Map(people.map((p) => [p.id, p.name]));
  const byPhone = new Map(farmers.map((f) => [f.phone, f]));

  const entries = rects
    .map((r) => ({
      person: names.get(r.person_id), phone: r.phone, amount: r.amount, paid_before: r.paid_before,
      status: r.status, transaction_id: r.transaction_id, paid_at: r.paid_at, farmer_name: r.farmer_name,
      state: r.state, remark: r.remark, sheet_no: r.sheet_no, position: r.position,
    }))
    .sort((a, b) => (a.person || '').localeCompare(b.person || '') || a.position - b.position);

  const zero = () => ({ count: 0, total: 0, paid: 0, failed: 0, pending: 0, paidCount: 0, failedCount: 0, pendingCount: 0 });
  const sum = zero();
  const per = new Map();
  for (const e of entries) {
    if (!per.has(e.person)) per.set(e.person, { name: e.person, ...zero() });
    for (const t of [sum, per.get(e.person)]) {
      t.count++; t.total += e.amount;
      if (e.status === 'successful') { t.paid += e.amount; t.paidCount++; }
      else if (e.status === 'failed') { t.failed += e.amount; t.failedCount++; }
      else { t.pending += e.amount; t.pendingCount++; }
    }
  }

  const overpaid = [];
  let same = 0;
  for (const x of file || []) {
    if (x.in_scope === false) continue;
    const f = byPhone.get(x.phone);
    if (!f || f.status !== 'successful') continue;
    if (f.prize_money > x.rect_amount) {
      overpaid.push({
        person: names.get(f.person_id), sheet_no: f.sheet_no, phone: f.phone, farmer_name: f.farmer_name, state: f.state,
        paid: f.prize_money, correct: x.rect_amount, excess: f.prize_money - x.rect_amount,
        transaction_id: f.transaction_id, paid_at: f.paid_at,
      });
    } else if (f.prize_money === x.rect_amount) same++;
  }
  overpaid.sort((a, b) => (a.person || '').localeCompare(b.person || '') || a.sheet_no - b.sheet_no);

  return {
    summary: { ...sum, byPerson: [...per.values()].sort((a, b) => a.name.localeCompare(b.name)) },
    entries,
    overpaid,
    overpaidExcess: overpaid.reduce((s, o) => s + o.excess, 0),
    same,
  };
}

module.exports = { rectReport };
