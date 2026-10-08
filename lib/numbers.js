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

function normalize(raw) {
  // Split on new lines, commas and semicolons first, so "98765 43210" or "+91 98765 43210" stay one number.
  // A line that is not a number on its own is retried piece by piece (several numbers separated by spaces).
  const items = [];
  for (const line of String(raw || '').split(/[\n\r,;]+/).map((s) => s.trim()).filter(Boolean)) {
    if (clean(line)) items.push(line);
    else items.push(...line.split(/\s+/).filter(Boolean));
  }
  const valid = [];
  const invalid = [];
  const seen = new Set();
  let duplicatesInPaste = 0;
  for (const t of items) {
    const d = clean(t);
    if (!d) {
      invalid.push(t);
      continue;
    }
    if (seen.has(d)) {
      duplicatesInPaste++;
      continue;
    }
    seen.add(d);
    valid.push(d);
  }
  return { valid, invalid, duplicatesInPaste };
}

// Fresh random whole-rupee amount, 25..200 inclusive, every value equally likely.
function randomPrize() {
  return crypto.randomInt(PRIZE_MIN, PRIZE_MAX + 1);
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

module.exports = { SHEET_SIZE, PRIZE_MIN, PRIZE_MAX, normalize, randomPrize, allocate };
