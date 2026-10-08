'use strict';
const { db, sign, safeEqual, send, method, body, clientIp, wrap } = require('../lib/auth');

module.exports = wrap(async (req, res) => {
  if (!method(req, res, 'POST')) return;
  const { name, code } = body(req);
  if (typeof name !== 'string' || typeof code !== 'string' || !name.trim() || !code.trim() || name.length > 40 || code.length > 64) {
    return send(res, 400, { error: 'Enter your name and access code.' });
  }

  const supa = db();
  const ip = clientIp(req);
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count, error: cErr } = await supa
    .from('login_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .gte('created_at', since);
  if (cErr) throw cErr;
  if ((count || 0) >= 10) return send(res, 429, { error: 'Too many wrong attempts. Please try again in 15 minutes.' });

  const fail = async () => {
    await supa.from('login_attempts').insert({ ip, name: name.trim().slice(0, 40) });
    return send(res, 401, { error: 'Name or access code is not correct.' });
  };

  if (name.trim().toLowerCase() === 'admin') {
    const adminCode = process.env.ADMIN_CODE;
    if (!adminCode || !safeEqual(code.trim(), adminCode)) return fail();
    return send(res, 200, { token: sign({ role: 'admin' }), role: 'admin', name: 'Admin' });
  }

  const { data: pid, error } = await supa.rpc('verify_access', {
    p_name: name.trim(),
    p_code: code.trim().toUpperCase(),
  });
  if (error) throw error;
  if (!pid) return fail();

  const { data: person, error: pErr } = await supa.from('people').select('name').eq('id', pid).single();
  if (pErr) throw pErr;
  return send(res, 200, { token: sign({ role: 'person', pid, name: person.name }), role: 'person', name: person.name });
});
