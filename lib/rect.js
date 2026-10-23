'use strict';

/**
 * Rectification report. The corrected amount in the shared file is the EXTRA amount to pay, so every paid number
 * has one entry for exactly that amount (`paid_before` is only for reference).
 */
function rectReport({ people, rects }) {
  const names = new Map(people.map((p) => [p.id, p.name]));

  const entries = rects
    .map((r) => ({
      person: names.get(r.person_id), phone: r.phone, amount: r.amount, paid_before: r.paid_before,
      status: r.status, transaction_id: r.transaction_id, paid_at: r.paid_at, farmer_name: r.farmer_name,
      state: r.state, remark: r.remark, sheet_no: r.sheet_no, position: r.position,
    }))
    .sort((a, b) => (a.person || '').localeCompare(b.person || '') || a.sheet_no - b.sheet_no || a.position - b.position);

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

  return {
    summary: { ...sum, byPerson: [...per.values()].sort((a, b) => a.name.localeCompare(b.name)) },
    entries,
  };
}

module.exports = { rectReport };
