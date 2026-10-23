'use strict';

/**
 * Paid numbers compared with the amounts in the 23 Oct amount file (purchases 1 to 19 Oct, group 'w').
 * Paid records are locked, so nothing is changed; this only lists them.
 * Numbers that got a Rectification entry are left out, they are handled there.
 * kind 'more' = paid more than the file amount, 'same' = paid exactly that amount.
 */
function paidReview({ people, farmers, file, rects }) {
  const names = new Map(people.map((p) => [p.id, p.name]));
  const hasEntry = new Set((rects || []).map((r) => r.phone));
  const target = new Map((file || []).filter((x) => x.grp === 'w').map((x) => [x.phone, x.new_amount]));
  const rows = [];
  for (const f of farmers) {
    if (f.status !== 'successful' || !target.has(f.phone) || hasEntry.has(f.phone)) continue;
    const want = target.get(f.phone);
    if (f.prize_money < want) continue; // would need a payment; not expected (none exist)
    rows.push({
      person: names.get(f.person_id), sheet_no: f.sheet_no, position: f.position, phone: f.phone, farmer_name: f.farmer_name, state: f.state,
      paid: f.prize_money, new_amount: want, diff: f.prize_money - want, kind: f.prize_money > want ? 'more' : 'same',
      transaction_id: f.transaction_id, paid_at: f.paid_at,
    });
  }
  rows.sort((a, b) => (a.person || '').localeCompare(b.person || '') || a.sheet_no - b.sheet_no || a.position - b.position);
  const more = rows.filter((r) => r.kind === 'more');
  return { rows, summary: { more: more.length, same: rows.length - more.length, excess: more.reduce((s, r) => s + r.diff, 0) } };
}

module.exports = { paidReview };
