/*! Local Ember preview review comments v1. Reviewer tool only, not part of the site design.
 * Include once per page:  <script src="/assets/review-comments.js" defer></script>
 * Optional attributes on the tag: data-site="localember/<repo>" (default: from the github.io URL).
 */
(function () {
  'use strict';
  if (window.__leReview) return; window.__leReview = true;

  // ---- config (one place). ENDPOINT is the Apps Script web app /exec URL; KEY is a spam filter, not a secret.
  var CONFIG = {
    ENDPOINT: '',
    KEY: 'le-review-7f3a'
  };
  var over = window.LE_REVIEW_CONFIG || {};
  var ENDPOINT = over.endpoint || CONFIG.ENDPOINT;
  var KEY = over.key || CONFIG.KEY;

  var me = document.currentScript;
  var SITE = (me && me.getAttribute('data-site')) || over.site ||
    (location.hostname === 'localember.github.io' ? 'localember/' + (location.pathname.split('/')[1] || '') : '');
  var PAGE = (over.pageOrigin || location.origin) + location.pathname;
  var LS = { name: 'leReviewName', pins: 'leReviewPins', pending: 'leReviewPending:' + SITE };

  var comments = [];      // from the store, this page only
  var mode = false;       // comment mode
  var pinsOn = lsGet(LS.pins) === '1';
  var hoverEl = null;
  var root, host, ui = {};

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  // ---------- selector + snippet ----------
  function cssEsc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&'); }
  function selectorFor(el) {
    if (el.id && document.querySelectorAll('#' + cssEsc(el.id)).length === 1) return '#' + cssEsc(el.id);
    var parts = [];
    var cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
      if (cur !== el && cur.id && document.querySelectorAll('#' + cssEsc(cur.id)).length === 1) { parts.unshift('#' + cssEsc(cur.id)); break; }
      var tag = cur.tagName.toLowerCase();
      var seg = tag;
      var cls = [].slice.call(cur.classList || []).filter(function (c) { return /^[A-Za-z][\w-]{0,40}$/.test(c); }).slice(0, 2);
      if (cls.length) seg += '.' + cls.map(cssEsc).join('.');
      var par = cur.parentElement;
      if (par) {
        var same = [].filter.call(par.children, function (c) { return c.tagName === cur.tagName; });
        if (same.length > 1) seg += ':nth-of-type(' + (same.indexOf(cur) + 1) + ')';
      }
      parts.unshift(seg);
      if (tag === 'body') break;
      cur = par;
    }
    var sel = parts.join(' > ');
    try { if (document.querySelector(sel) === el) return sel; } catch (e) {}
    return sel;
  }
  function snippetFor(el) {
    var t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!t) t = el.getAttribute('alt') || el.getAttribute('aria-label') || el.getAttribute('title') || ('<' + el.tagName.toLowerCase() + '>');
    return t.slice(0, 140);
  }
  function findEl(c) {
    var el = null;
    try { el = document.querySelector(c.selector); } catch (e) {}
    if (el) return el;
    if (c.snippet && c.snippet.charAt(0) !== '<') {
      var want = c.snippet.slice(0, 60);
      var all = document.body.querySelectorAll('h1,h2,h3,h4,p,li,a,button,span,figcaption,td,div');
      for (var i = 0; i < all.length; i++) {
        var t = (all[i].innerText || '').replace(/\s+/g, ' ').trim();
        if (t && t.indexOf(want) === 0) return all[i];
      }
    }
    return null;
  }
  function viewportLabel() {
    var w = window.innerWidth;
    return w + 'px ' + (w < 600 ? 'phone' : w < 1024 ? 'tablet' : 'desktop');
  }

  // ---------- store ----------
  function api(method, body) {
    if (!ENDPOINT) return Promise.reject(new Error('Comment storage is not connected yet'));
    if (method === 'GET') {
      var u = ENDPOINT + (ENDPOINT.indexOf('?') < 0 ? '?' : '&') + 'key=' + encodeURIComponent(KEY) + '&site=' + encodeURIComponent(SITE) + '&page=' + encodeURIComponent(PAGE) + '&t=' + Date.now();
      return fetch(u, { method: 'GET', redirect: 'follow' }).then(function (r) { return r.json(); });
    }
    // text/plain keeps this a "simple" CORS request (no preflight), which Apps Script needs.
    return fetch(ENDPOINT, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); });
  }
  function load() {
    return api('GET').then(function (d) {
      if (!d || !d.ok) throw new Error((d && d.error) || 'load failed');
      comments = d.comments || [];
      render();
    }).catch(function (e) { ui.status.textContent = String(e.message || e); render(); });
  }
  function pending() { try { return JSON.parse(lsGet(LS.pending) || '[]'); } catch (e) { return []; } }
  function flushPending() {
    var q = pending(); if (!q.length || !ENDPOINT) return Promise.resolve();
    var rest = [];
    return q.reduce(function (p, item) {
      return p.then(function () { return api('POST', item).then(function (d) { if (!d.ok) rest.push(item); }).catch(function () { rest.push(item); }); });
    }, Promise.resolve()).then(function () { lsSet(LS.pending, JSON.stringify(rest)); });
  }

  // ---------- UI ----------
  var CSS_TEXT = [
    ':host{all:initial}',
    '*{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}',
    '.bar{position:fixed;right:14px;bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:2147483646;display:flex;gap:6px;align-items:center;background:#111827;color:#fff;border-radius:999px;padding:5px;box-shadow:0 6px 24px rgba(0,0,0,.28);font-size:13px}',
    '.bar .tag{padding:0 8px 0 10px;font-weight:600;letter-spacing:.02em;opacity:.8;font-size:11px;text-transform:uppercase}',
    '.bar button{border:0;border-radius:999px;padding:9px 14px;font-size:13px;font-weight:600;cursor:pointer;background:#374151;color:#fff;line-height:1}',
    '.bar button.on{background:#f59e0b;color:#111827}',
    '.bar button:focus-visible{outline:2px solid #93c5fd;outline-offset:2px}',
    '.hint{position:fixed;left:50%;transform:translateX(-50%);top:calc(64px + env(safe-area-inset-top,0px));z-index:2147483646;background:#f59e0b;color:#111827;padding:8px 14px;border-radius:999px;font-size:13px;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,.2);display:none;max-width:92vw;text-align:center}',
    '.hl{position:absolute;z-index:2147483644;pointer-events:none;outline:2px solid #f59e0b;background:rgba(245,158,11,.12);border-radius:3px;display:none}',
    '.layer{position:absolute;left:0;top:0;width:0;height:0;z-index:2147483645}',
    '.pin{position:absolute;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50% 50% 50% 0;background:#dc2626;color:#fff;border:2px solid #fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.35);padding:0}',
    '.pin.res{background:#16a34a}',
    '.pin.new{background:#2563eb}',
    '.box{position:fixed;z-index:2147483647;width:320px;max-width:calc(100vw - 20px);background:#fff;color:#111827;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.3);padding:12px;font-size:14px;display:none}',
    '.box.sheet{left:0!important;right:0;bottom:0!important;top:auto!important;width:100%;max-width:100%;border-radius:14px 14px 0 0;padding-bottom:calc(12px + env(safe-area-inset-bottom,0px))}',
    '.box h4{margin:0 0 6px;font-size:13px;color:#6b7280;font-weight:600}',
    '.box .snip{font-size:12px;color:#6b7280;margin:0 0 8px;max-height:3em;overflow:hidden}',
    '.box textarea,.box input{width:100%;border:1px solid #d1d5db;border-radius:8px;padding:8px;font-size:16px;color:#111827;background:#fff}',
    '.box textarea{min-height:84px;resize:vertical}',
    '.box input{margin-top:6px;font-size:14px}',
    '.row{display:flex;gap:8px;justify-content:flex-end;margin-top:8px;align-items:center}',
    '.row .msg{margin-right:auto;font-size:12px;color:#b91c1c}',
    '.box button{border:0;border-radius:8px;padding:9px 14px;font-size:14px;font-weight:600;cursor:pointer}',
    '.save{background:#111827;color:#fff}.cancel{background:#e5e7eb;color:#111827}',
    '.save[disabled]{opacity:.5}',
    '.card p{margin:4px 0;white-space:pre-wrap;word-wrap:break-word}',
    '.meta{font-size:12px;color:#6b7280}',
    '.st{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;background:#fee2e2;color:#991b1b}',
    '.st.res{background:#dcfce7;color:#166534}',
    '.toast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(70px + env(safe-area-inset-bottom,0px));z-index:2147483647;background:#111827;color:#fff;padding:9px 14px;border-radius:8px;font-size:13px;display:none}',
    '.status{display:none}'
  ].join('\n');

  function h(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function build() {
    host = document.createElement('le-review');
    host.setAttribute('data-le-review', '');
    host.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;z-index:2147483645';
    document.body.appendChild(host);
    root = host.attachShadow({ mode: 'open' });
    var st = document.createElement('style'); st.textContent = CSS_TEXT; root.appendChild(st);

    ui.layer = h('div', 'layer'); root.appendChild(ui.layer);
    ui.hl = h('div', 'hl'); root.appendChild(ui.hl);
    ui.hint = h('div', 'hint', 'Click anything to comment on it. Links are paused.'); root.appendChild(ui.hint);
    ui.toast = h('div', 'toast'); root.appendChild(ui.toast);
    ui.status = h('div', 'status'); root.appendChild(ui.status);

    var bar = h('div', 'bar'); bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Local Ember review toolbar');
    bar.appendChild(h('span', 'tag', 'Review'));
    ui.pinsBtn = h('button', '', 'Pins'); ui.pinsBtn.type = 'button';
    ui.pinsBtn.title = 'Show or hide comment pins';
    ui.pinsBtn.onclick = function () { pinsOn = !pinsOn; lsSet(LS.pins, pinsOn ? '1' : '0'); render(); };
    ui.modeBtn = h('button', '', 'Comment'); ui.modeBtn.type = 'button';
    ui.modeBtn.title = 'Turn comment mode on or off';
    ui.modeBtn.onclick = function () { setMode(!mode); };
    bar.appendChild(ui.pinsBtn); bar.appendChild(ui.modeBtn);
    root.appendChild(bar);

    ui.box = h('div', 'box'); ui.box.setAttribute('role', 'dialog'); ui.box.setAttribute('aria-label', 'Comment');
    root.appendChild(ui.box);
  }

  function setMode(on) {
    mode = on;
    ui.modeBtn.classList.toggle('on', on);
    ui.modeBtn.textContent = on ? 'Done' : 'Comment';
    ui.hint.style.display = on ? 'block' : 'none';
    if (on) { pinsOn = true; lsSet(LS.pins, '1'); }
    if (!on) { ui.hl.style.display = 'none'; closeBox(); }
    render();
  }

  function toast(t) {
    ui.toast.textContent = t; ui.toast.style.display = 'block';
    clearTimeout(toast._t); toast._t = setTimeout(function () { ui.toast.style.display = 'none'; }, 2600);
  }

  function inUI(e) { return e.composedPath && e.composedPath().indexOf(host) >= 0; }

  function showHL(el) {
    var r = el.getBoundingClientRect(), o = host.getBoundingClientRect();
    var s = ui.hl.style;
    s.display = 'block'; s.left = (r.left - o.left) + 'px'; s.top = (r.top - o.top) + 'px'; s.width = r.width + 'px'; s.height = r.height + 'px';
  }

  function placeBox(cx, cy) {
    var b = ui.box;
    var phone = window.innerWidth < 600;
    b.classList.toggle('sheet', phone);
    b.style.display = 'block';
    if (phone) return;
    var w = b.offsetWidth, hh = b.offsetHeight;
    var left = Math.min(Math.max(10, cx + 12), window.innerWidth - w - 10);
    var top = cy + 12 + hh > window.innerHeight - 10 ? Math.max(10, cy - hh - 12) : cy + 12;
    b.style.left = left + 'px'; b.style.top = top + 'px';
  }
  function closeBox() { ui.box.style.display = 'none'; ui.box.innerHTML = ''; }

  function openNew(el, e) {
    var r = el.getBoundingClientRect();
    var draft = {
      key: KEY, site: SITE, page: PAGE, selector: selectorFor(el), snippet: snippetFor(el),
      x: Math.round(e.clientX - r.left), y: Math.round(e.clientY - r.top), viewport: viewportLabel()
    };
    var b = ui.box; b.innerHTML = '';
    b.appendChild(h('h4', '', 'Comment on this spot'));
    b.appendChild(h('p', 'snip', '"' + draft.snippet + '"'));
    var ta = h('textarea'); ta.placeholder = 'What should change here?'; ta.maxLength = 4000;
    var nm = h('input'); nm.placeholder = 'Your name (optional)'; nm.value = lsGet(LS.name) || ''; nm.maxLength = 80;
    var row = h('div', 'row'); var msg = h('span', 'msg');
    var cancel = h('button', 'cancel', 'Cancel'); cancel.type = 'button';
    var save = h('button', 'save', 'Save'); save.type = 'button';
    row.appendChild(msg); row.appendChild(cancel); row.appendChild(save);
    b.appendChild(ta); b.appendChild(nm); b.appendChild(row);
    placeBox(e.clientX, e.clientY);
    setTimeout(function () { ta.focus(); }, 30);
    cancel.onclick = function () { closeBox(); ui.hl.style.display = 'none'; };
    ta.onkeydown = function (k) { if (k.key === 'Enter' && (k.metaKey || k.ctrlKey)) save.click(); if (k.key === 'Escape') cancel.click(); };
    save.onclick = function () {
      var text = ta.value.trim(); if (!text) { msg.textContent = 'Type a comment first.'; return; }
      lsSet(LS.name, nm.value.trim());
      var body = Object.assign({}, draft, { cid: 'C' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8), author: nm.value.trim(), comment: text });
      save.disabled = true; save.textContent = 'Saving...'; msg.textContent = '';
      api('POST', body).then(function (d) {
        if (!d || !d.ok) throw new Error((d && d.error) || 'save failed');
        comments.push(Object.assign({}, body, { id: d.id, created: d.created, status: d.status || 'Open' }));
        closeBox(); ui.hl.style.display = 'none'; render(); toast('Comment saved');
      }).catch(function (err) {
        var q = pending(); q.push(body); lsSet(LS.pending, JSON.stringify(q));
        save.disabled = false; save.textContent = 'Save';
        msg.textContent = 'Not saved yet (' + (err.message || err) + '). Kept in this browser and retried next visit.';
      });
    };
  }

  function openCard(c, n, px, py) {
    var b = ui.box; b.innerHTML = '';
    var card = h('div', 'card');
    var top = h('div', 'row'); top.style.justifyContent = 'space-between'; top.style.marginTop = '0';
    top.appendChild(h('b', '', '#' + n + (c.author ? ' · ' + c.author : '')));
    var res = /^resolved/i.test(c.status || '');
    top.appendChild(h('span', 'st' + (res ? ' res' : ''), res ? 'Resolved' : (c.status || 'Open')));
    card.appendChild(top);
    card.appendChild(h('p', '', c.comment));
    card.appendChild(h('p', 'meta', [c.created, c.viewport].filter(Boolean).join(' · ')));
    if (c.resolvedNote) card.appendChild(h('p', 'meta', 'Fix: ' + c.resolvedNote + (c.resolvedCommit ? ' (' + c.resolvedCommit + ')' : '')));
    var row = h('div', 'row'); var close = h('button', 'cancel', 'Close'); close.type = 'button'; close.onclick = closeBox; row.appendChild(close);
    card.appendChild(row);
    b.appendChild(card);
    placeBox(px, py);
  }

  function render() {
    if (!ui.layer) return;
    var open = comments.filter(function (c) { return !/^resolved/i.test(c.status || ''); }).length;
    ui.pinsBtn.textContent = (pinsOn ? 'Hide pins' : 'Pins') + ' (' + open + ' open' + (comments.length > open ? ', ' + (comments.length - open) + ' done' : '') + ')';
    ui.pinsBtn.classList.toggle('on', false);
    ui.layer.innerHTML = '';
    if (!pinsOn) return;
    var o = host.getBoundingClientRect();
    comments.forEach(function (c, i) {
      var el = findEl(c);
      var x, y;
      if (el) {
        var r = el.getBoundingClientRect();
        x = r.left - o.left + Math.min(Math.max(c.x || 0, 0), r.width);
        y = r.top - o.top + Math.min(Math.max(c.y || 0, 0), r.height);
      } else { x = 30 + i * 30; y = -o.top + 80; }
      var p = h('button', 'pin' + (/^resolved/i.test(c.status || '') ? ' res' : ''), String(i + 1));
      p.type = 'button';
      p.setAttribute('aria-label', 'Comment ' + (i + 1) + ', ' + (c.status || 'Open'));
      p.title = (c.comment || '').slice(0, 120);
      p.style.left = x + 'px'; p.style.top = y + 'px';
      p.onclick = function (ev) { ev.stopPropagation(); var rr = p.getBoundingClientRect(); openCard(c, i + 1, rr.left, rr.bottom); };
      ui.layer.appendChild(p);
    });
  }

  // ---------- events ----------
  document.addEventListener('mousemove', function (e) {
    if (!mode || inUI(e) || ui.box.style.display === 'block') return;
    var el = e.target; if (!el || el === hoverEl) return;
    hoverEl = el; showHL(el);
  }, true);
  function block(e) { if (mode && !inUI(e)) { e.preventDefault(); e.stopPropagation(); } }
  ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'submit', 'dblclick'].forEach(function (t) { document.addEventListener(t, block, true); });
  document.addEventListener('click', function (e) {
    if (!mode || inUI(e)) return;
    e.preventDefault(); e.stopPropagation();
    var el = e.target; if (!el || el.nodeType !== 1) return;
    if (el === document.documentElement || el === document.body) return;
    hoverEl = el; showHL(el); openNew(el, e);
  }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && mode && ui.box.style.display !== 'block') setMode(false); });
  var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(render, 120); });
  window.addEventListener('load', function () { setTimeout(render, 300); });

  function start() {
    build(); render();
    flushPending().then(load);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
