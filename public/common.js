/* Shared helpers for both pages. No secrets live here. */
(function () {
  const KEY = 'fp_token';
  let mem = null;
  const store = {
    get() { try { return sessionStorage.getItem(KEY) || mem; } catch (e) { return mem; } },
    set(v) {
      mem = v;
      try { v ? sessionStorage.setItem(KEY, v) : sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    },
  };

  // Tiny DOM builder. Text is always inserted as text, never as HTML.
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === false || v === null || v === undefined) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

  function fmtDate(x) {
    if (!x) return '';
    return new Date(x).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
    });
  }

  function localNowInput() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  async function api(path, opts) {
    const { method = 'GET', json, raw } = opts || {};
    const headers = {};
    const t = store.get();
    if (t) headers.Authorization = 'Bearer ' + t;
    if (json) headers['Content-Type'] = 'application/json';
    const r = await fetch(path, { method, headers, body: json ? JSON.stringify(json) : undefined });
    if (raw && r.ok) return r;
    let data = null;
    try { data = await r.json(); } catch (e) { /* not json */ }
    if (!r.ok) {
      const err = new Error((data && data.error) || 'Request failed (' + r.status + ')');
      err.status = r.status;
      throw err;
    }
    return data;
  }

  async function copy(text, btn) {
    let ok = false;
    try { await navigator.clipboard.writeText(String(text)); ok = true; } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = String(text);
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
    }
    if (btn) {
      const old = btn.textContent;
      btn.textContent = ok ? 'Copied' : 'Press and hold to copy';
      btn.classList.toggle('copied', ok);
      setTimeout(() => { btn.textContent = old; btn.classList.remove('copied'); }, 1200);
    }
  }

  window.FP = { h, inr, fmtDate, localNowInput, api, copy, store };
})();
