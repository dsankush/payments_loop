'use strict';
const crypto = require('crypto');

const SHEET_SIZE = 15;
const PRIZE_MIN = 25;
const PRIZE_MAX = 200;

// Cleans a pasted list into valid 10-digit Indian mobile numbers.
function clean(t) {
  let d = String(t).replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9][0-9]{9}$/.test(d) ? d : null;
}

const NAME_MAX = 80;
const PRODUCTS_MAX = 300;
const STATE_MAX = 40;
const squash = (t) => String(t || '').replace(/\s+/g, ' ').trim();

/**
 * Reads what the admin pasted. Two kinds of lines are understood and can be mixed:
 *  - Rows copied from a sheet, columns separated by a tab:  Phone <tab> Farmer Name <tab> Products Purchased [<tab> State]
 *  - Plain numbers, separated by new lines, commas, semicolons or spaces.
 * A header row ("Phone  Farmer Name  Products Purchased") is skipped.
 * Returns { valid, invalid, duplicatesInPaste, info } where info[phone] = { name, products, state }.
 */
function normalize(raw) {
  const valid = [];
  const invalid = [];
  const info = {};
  const seen = new Set();
  let duplicatesInPaste = 0;

  const add = (token, name, products, state) => {
    const d = clean(token);
    if (!d) {
      invalid.push(squash(token).slice(0, 40));
      return;
    }
    const nm = squash(name).slice(0, NAME_MAX);
    const pr = squash(products).slice(0, PRODUCTS_MAX);
    const st = squash(state).slice(0, STATE_MAX);
    if (seen.has(d)) {
      duplicatesInPaste++;
      const cur = info[d];
      if (cur && !cur.name && nm.length >= 2) cur.name = nm;
      if (cur && !cur.products && pr) cur.products = pr;
      if (cur && !cur.state && st.length >= 2) cur.state = st;
      return;
    }
    seen.add(d);
    valid.push(d);
    info[d] = { name: nm.length >= 2 ? nm : null, products: pr || null, state: st.length >= 2 ? st : null };
  };

  for (const line of String(raw || '').split(/\r?\n|\r/)) {
    if (!line.trim()) continue;
    if (line.includes('\t')) {
      const cells = line.split('\t');
      const first = squash(cells[0]);
      if (!first) { // a row that starts with an empty cell
        invalid.push(squash(line).slice(0, 40));
        continue;
      }
      if (!/\d/.test(first) && /^(phone|mobile|farmer|number|contact)/i.test(first)) continue; // header row
      // 4th column (when present) is the State; anything beyond is ignored
      if (cells.length >= 4) add(first, cells[1], cells[2], cells[3]);
      else add(first, cells[1], cells.slice(2).join(' '));
      continue;
    }
    // Plain numbers. Split on commas and semicolons first, so "98765 43210" or "+91 98765 43210" stay one number;
    // a piece that is not a number on its own is retried word by word (several numbers separated by spaces).
    for (const piece of line.split(/[,;]+/).map((x) => x.trim()).filter(Boolean)) {
      if (clean(piece)) add(piece);
      else for (const w of piece.split(/\s+/).filter(Boolean)) add(w);
    }
  }
  return { valid, invalid, duplicatesInPaste, info };
}

// Fresh random amount, 25..200 inclusive, every allowed value equally likely.
// step 5 gives multiples of five only (25, 30, ... 200).
function randomPrize(step = 5) {
  const n = Math.floor((PRIZE_MAX - PRIZE_MIN) / step) + 1;
  return PRIZE_MIN + crypto.randomInt(0, n) * step;
}

/**
 * Decides which numbers go to which person, and into which sheet/position.
 * state[name] = { lastSheet, lastCount }  (lastSheet 0 = person has no sheet yet)
 * mode 'auto'  : sheets of 15 are dealt to the chosen people in turn
 * mode 'manual': counts[name] numbers go to each person
 * topUp        : fill a person's short last sheet before starting new sheets
 * Returns { rows: [{name, phone, sheet_no, position}], plan, unassigned }
 */
function allocate({ pool, people, state, mode, counts, topUp }) {
  const lists = Object.fromEntries(people.map((p) => [p, []]));
  const remaining = pool.slice();
  const gapOf = (p) => {
    const s = state[p];
    return s && s.lastSheet > 0 && s.lastCount < SHEET_SIZE ? SHEET_SIZE - s.lastCount : 0;
  };

  if (mode === 'manual') {
    let total = 0;
    for (const p of people) total += counts[p] || 0;
    if (total > pool.length) throw new Error(`You asked for ${total} numbers but only ${pool.length} are available.`);
    for (const p of people) lists[p].push(...remaining.splice(0, counts[p] || 0));
  } else {
    if (topUp) for (const p of people) lists[p].push(...remaining.splice(0, gapOf(p)));
    let i = 0;
    while (remaining.length) {
      lists[people[i % people.length]].push(...remaining.splice(0, SHEET_SIZE));
      i++;
    }
  }

  const rows = [];
  const plan = {};
  for (const p of people) {
    const list = lists[p];
    plan[p] = [];
    if (!list.length) continue;
    let sheet = state[p] ? state[p].lastSheet : 0;
    let idx = 0;
    const gap = topUp ? gapOf(p) : 0;
    if (gap > 0) {
      const take = list.slice(0, Math.min(gap, list.length));
      take.forEach((phone, k) => rows.push({ name: p, phone, sheet_no: sheet, position: state[p].lastCount + 1 + k }));
      plan[p].push({ sheet, count: take.length, kind: 'top-up' });
      idx = take.length;
    }
    while (idx < list.length) {
      sheet += 1;
      const chunk = list.slice(idx, idx + SHEET_SIZE);
      chunk.forEach((phone, k) => rows.push({ name: p, phone, sheet_no: sheet, position: k + 1 }));
      plan[p].push({ sheet, count: chunk.length, kind: 'new sheet' });
      idx += chunk.length;
    }
  }
  return { rows, plan, unassigned: remaining.length };
}

module.exports = { SHEET_SIZE, PRIZE_MIN, PRIZE_MAX, NAME_MAX, PRODUCTS_MAX, STATE_MAX, normalize, randomPrize, allocate };
