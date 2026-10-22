'use strict';
const { db, send, authenticate, method, body, fetchAll, wrap } = require('../../lib/auth');
const { normalize, randomPrize, allocate, SHEET_SIZE } = require('../../lib/numbers');

const MAX_NUMBERS = 5000;

module.exports = wrap(async (req, res) => {
  if (!method(req, res, 'POST')) return;
  if (!authenticate(req, res, 'admin')) return;

  const b = body(req);
  const commit = b.commit === true;
  const mode = b.mode === 'manual' ? 'manual' : 'auto';
  const topUp = b.topUp === true;
  const raw = typeof b.numbers === 'string' ? b.numbers : '';
  if (raw.length > 200000) return send(res, 400, { error: 'That list is too long.' });

  const { valid, invalid, duplicatesInPaste, info } = normalize(raw);
  if (valid.length > MAX_NUMBERS) return send(res, 400, { error: `Please add at most ${MAX_NUMBERS} numbers at a time.` });

  const supa = db();

  // Numbers already in the permanent registry are never assigned again.
  const existing = new Map();
  for (let i = 0; i < valid.length; i += 200) {
    const chunk = valid.slice(i, i + 200);
    const { data, error } = await supa.from('farmers').select('phone,status').in('phone', chunk);
    if (error) throw error;
    for (const r of data) existing.set(r.phone, r.status);
  }
  const pool = valid.filter((p) => !existing.has(p));
  const already = { successful: 0, pending: 0, failed: 0 };
  for (const s of existing.values()) already[s]++;

  // Where each person's sheets currently stand.
  const people = await fetchAll('people', 'id,name', { order: ['name'] });
  const sheetRows = await fetchAll('farmers', 'person_id,sheet_no,position', {
    order: ['person_id', 'sheet_no', 'position'],
  });
  const state = {};
  for (const p of people) {
    let lastSheet = 0;
    for (const r of sheetRows) if (r.person_id === p.id && r.sheet_no > lastSheet) lastSheet = r.sheet_no;
    // Positions already used in the last sheet. A removed number leaves a gap that top-up fills.
    const used = new Set();
    for (const r of sheetRows) if (r.person_id === p.id && r.sheet_no === lastSheet) used.add(r.position);
    const free = [];
    if (lastSheet) for (let k = 1; k <= SHEET_SIZE; k++) if (!used.has(k)) free.push(k);
    state[p.name] = { id: p.id, lastSheet, lastCount: lastSheet ? used.size : SHEET_SIZE, free };
  }
  const peopleState = people.map((p) => ({ name: p.name, lastSheet: state[p.name].lastSheet, lastCount: state[p.name].lastSheet ? state[p.name].lastCount : 0 }));

  const summary = {
    pasted: valid.length + invalid.length + duplicatesInPaste,
    invalid: invalid.slice(0, 20),
    invalidCount: invalid.length,
    duplicatesInPaste,
    already,
    alreadyCount: existing.size,
    newCount: pool.length,
    withNames: pool.filter((p) => info[p] && info[p].name).length,
    withProducts: pool.filter((p) => info[p] && info[p].products).length,
    withStates: pool.filter((p) => info[p] && info[p].state).length,
    people: peopleState,
  };

  // Which people were ticked (names must be among the 7 real ones).
  const chosen = Array.isArray(b.people) ? [...new Set(b.people.filter((n) => typeof n === 'string' && state[n]))] : [];
  if (!chosen.length || !pool.length) return send(res, 200, { summary, plan: null });

  const counts = {};
  if (mode === 'manual') {
    for (const n of chosen) {
      const v = Number(b.counts && b.counts[n]);
      counts[n] = Number.isInteger(v) && v >= 0 ? v : 0;
    }
  }

  let result;
  try {
    result = allocate({ pool, people: chosen, state, mode, counts, topUp });
  } catch (e) {
    return send(res, 400, { error: e.message });
  }

  if (!commit) return send(res, 200, { summary, plan: result.plan, unassigned: result.unassigned });
  if (!result.rows.length) return send(res, 400, { error: 'Nothing to assign. Check the counts.' });

  // Fresh random prize for every number, fixed forever once saved.
  const insertRows = result.rows.map((r) => ({
    person_id: state[r.name].id,
    sheet_no: r.sheet_no,
    position: r.position,
    phone: r.phone,
    prize_money: randomPrize(),
    farmer_name: (info[r.phone] && info[r.phone].name) || null,
    products: (info[r.phone] && info[r.phone].products) || null,
    state: (info[r.phone] && info[r.phone].state) || null,
  }));
  const { error } = await supa.from('farmers').insert(insertRows);
  if (error) {
    if (error.code === '23505') return send(res, 409, { error: 'Some of these numbers or sheet positions were just added by another request. Check again and retry.' });
    throw error;
  }
  const total = insertRows.reduce((s, r) => s + r.prize_money, 0);
  send(res, 200, { committed: true, assigned: insertRows.length, totalPrize: total, plan: result.plan, unassigned: result.unassigned });
});
