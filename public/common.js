/* Shared helpers for both pages. No secrets live here. */
(function () {
  const KEY = 'fp_token';
  const NS = 'http://www.w3.org/2000/svg';
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
  const groupPhone = (p) => String(p).slice(0, 5) + ' ' + String(p).slice(5);

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
      const lbl = btn.querySelector('.lbl') || btn;
      const old = lbl.textContent;
      lbl.textContent = ok ? 'Copied' : 'Press and hold to copy';
      btn.classList.toggle('copied', ok);
      setTimeout(() => { lbl.textContent = old; btn.classList.remove('copied'); }, 1300);
    }
    return ok;
  }

  // Small line icons. Static strings only.
  const ICONS = {
    check: '<path d="M5.5 12.5l4.2 4.2L18.8 7.5"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7.8V12l2.8 1.8"/>',
    alert: '<path d="M12 6.5v7"/><path d="M12 17.4v.1"/>',
    copy: '<rect x="9" y="9" width="10.5" height="10.5" rx="2.5"/><path d="M15 9V7.5A2.5 2.5 0 0 0 12.5 5h-5A2.5 2.5 0 0 0 5 7.5v5A2.5 2.5 0 0 0 7.5 15H9"/>',
    lock: '<rect x="5.5" y="10.5" width="13" height="9" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    chevron: '<path d="M7 10l5 5 5-5"/>',
    out: '<path d="M14 5h3.5A1.5 1.5 0 0 1 19 6.5v11a1.5 1.5 0 0 1-1.5 1.5H14"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h9"/>',
  };
  function icon(name, size) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size || 20);
    svg.setAttribute('height', size || 20);
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = ICONS[name] || '';
    return svg;
  }

  /**
   * Tally marks: one mark per farmer, grouped in fives (the fifth mark is the diagonal).
   * statuses: array of 'paid' | 'failed' | 'pending'
   */
  function tally(statuses, opts) {
    const o = opts || {};
    const height = o.height || 44;
    const gw = 46, gap = 14;
    const groups = Math.max(1, Math.ceil(statuses.length / 5));
    const w = groups * gw + (groups - 1) * gap;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + w + ' 40');
    svg.setAttribute('class', 'tally' + (o.animate ? ' draw' : ''));
    svg.setAttribute('aria-hidden', 'true');
    svg.style.height = height + 'px';
    svg.style.width = Math.round((w * height) / 40) + 'px';
    statuses.forEach((s, i) => {
      const g = Math.floor(i / 5), k = i % 5, x0 = g * (gw + gap);
      const line = document.createElementNS(NS, 'line');
      if (k < 4) {
        const x = x0 + 5 + k * 12;
        line.setAttribute('x1', x); line.setAttribute('x2', x);
        line.setAttribute('y1', 4); line.setAttribute('y2', 36);
      } else {
        line.setAttribute('x1', x0 - 1); line.setAttribute('y1', 31);
        line.setAttribute('x2', x0 + gw + 1); line.setAttribute('y2', 9);
      }
      line.setAttribute('pathLength', '1');
      line.setAttribute('class', 't-' + s);
      line.style.setProperty('--i', i);
      svg.appendChild(line);
    });
    return svg;
  }

  let toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
      document.body.append(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
  }

  // Confirmation sheet. Resolves true or false.
  function confirmDialog(o) {
    const opts = Object.assign({ confirmText: 'Confirm', cancelText: 'Go back', danger: false, body: [] }, o);
    const lines = [].concat(opts.body);
    return new Promise((resolve) => {
      if (typeof HTMLDialogElement === 'undefined' || typeof HTMLDialogElement.prototype.showModal !== 'function') {
        resolve(window.confirm([opts.title].concat(lines).join('\n')));
        return;
      }
      const dlg = document.createElement('dialog');
      dlg.className = 'sheet-dialog';
      const ok = h('button', { class: 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary'), type: 'button' }, opts.confirmText);
      const no = h('button', { class: 'btn btn-quiet', type: 'button' }, opts.cancelText);
      dlg.append(h('h2', {}, opts.title), ...lines.map((t) => h('p', {}, t)), h('div', { class: 'dialog-actions' }, ok, no));
      let result = false;
      ok.addEventListener('click', () => { result = true; dlg.close(); });
      no.addEventListener('click', () => dlg.close());
      dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
      dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
      document.body.append(dlg);
      dlg.showModal();
      no.focus();
    });
  }

  window.FP = { h, inr, groupPhone, fmtDate, localNowInput, api, copy, store, icon, tally, toast, confirmDialog };
})();
