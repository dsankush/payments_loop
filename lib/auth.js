'use strict';
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

let client = null;
function db() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set');
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

const sha = (x) => crypto.createHash('sha256').update(String(x)).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error('SESSION_SECRET is not set (min 16 characters)');
  return s;
}

function sign(payload, ttlSeconds = 12 * 3600) {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function readToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expect = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  if (!safeEqual(sig, expect)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!p.exp || p.exp < Date.now() / 1000) return null;
    return p;
  } catch {
    return null;
  }
}

function send(res, status, obj) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(obj);
}

function authenticate(req, res, role) {
  const h = req.headers.authorization || '';
  const p = readToken(h.startsWith('Bearer ') ? h.slice(7) : '');
  if (!p || p.role !== role) {
    send(res, 401, { error: 'Please log in again.' });
    return null;
  }
  return p;
}

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  const ip = xf ? String(xf).split(',')[0] : (req.socket && req.socket.remoteAddress) || 'unknown';
  return ip.trim();
}

function method(req, res, m) {
  if (req.method !== m) {
    res.setHeader('Allow', m);
    send(res, 405, { error: 'Method not allowed' });
    return false;
  }
  return true;
}

function body(req) {
  return req.body && typeof req.body === 'object' ? req.body : {};
}

// Reads every row, 1000 at a time (Supabase returns at most 1000 per request).
async function fetchAll(table, columns, { filter, order } = {}) {
  const out = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    let q = db().from(table).select(columns);
    if (filter) q = filter(q);
    for (const o of order || []) q = q.order(o);
    const { data, error } = await q.range(from, from + size - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < size) break;
  }
  return out;
}

function wrap(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (e) {
      console.error(e);
      send(res, 500, { error: 'Something went wrong on the server. Please try again.' });
    }
  };
}

module.exports = { db, sign, readToken, safeEqual, send, authenticate, clientIp, method, body, fetchAll, wrap };
