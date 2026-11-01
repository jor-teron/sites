/*
 * H82 Hub attention pop-up — used by hub.html and /phone.html.
 * App frame → host (window.parent, same origin, sender must be one of this page's iframes):
 *   {sharedLink:'attention', app, kind:'call', title, urgent?, from?, fav?}   ringing starts
 *   {sharedLink:'attention', app, kind:'call-end'}                           ringing stopped
 * Host → that frame (event.source):
 *   {sharedLink:'attention-reply', app, kind:'call', action:'answer' | 'decline'}
 * Answer also brings the app to the front: window.__hubAttentionFocus(win) if the page sets it (phone),
 * else HubWM.focus(HubWM.idOf(win)) (Hub desktop windows).
 * DND (window.HubDnd): no card unless urgent && fav && HubDnd.allowFavs(); instead HubNotify notice
 * "Missed call: <title>" (the Notification Centre keeps it). One card per source frame; z-index 2100 (above UiDialog 2000).
 */
(function () {
  'use strict';
  var cards = [];   // [{src, el}]
  var file = location.protocol === 'file:';
  function isFrame(src) { return Array.prototype.some.call(document.querySelectorAll('iframe'), function (f) { return f.contentWindow === src; }); }
  function dark() {
    var h = document.documentElement;
    if (h.classList.contains('dark')) return true;
    if (h.classList.contains('hub-light')) return false;
    try { var t = localStorage.getItem('sites-hub.theme'); if (t === 'dark') return true; if (t) return false; } catch (_) { /* */ }
    return !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  }
  function css() {
    if (document.getElementById('hub-att-css')) return;
    var s = document.createElement('style'); s.id = 'hub-att-css';
    s.textContent = '#hub-att{position:fixed;left:50%;top:max(12px,env(safe-area-inset-top));transform:translateX(-50%);z-index:2100;display:flex;flex-direction:column;gap:8px;width:min(92vw,380px);pointer-events:none}' +
      '.hub-att-card{pointer-events:auto;background:#fff;color:#111;border-radius:16px;padding:14px 16px;box-shadow:0 8px 30px rgba(0,0,0,.35);font:15px/1.35 system-ui,sans-serif}' +
      '.hub-att-card.dk{background:#1f2329;color:#eef}' +
      '.hub-att-t{font-weight:700;margin-bottom:10px;word-break:break-word}' +
      '.hub-att-b{display:flex;gap:10px}.hub-att-b button{flex:1;min-height:42px;border:0;border-radius:12px;font:600 15px system-ui,sans-serif;cursor:pointer;color:#fff}' +
      '.hub-att-ok{background:#16a34a}.hub-att-no{background:#dc2626}';
    document.head.appendChild(s);
  }
  function box() {
    var b = document.getElementById('hub-att');
    if (!b) { b = document.createElement('div'); b.id = 'hub-att'; b.setAttribute('role', 'alert'); document.body.appendChild(b); }
    return b;
  }
  function close(src) {
    cards = cards.filter(function (c) { if (c.src !== src) return true; c.el.remove(); return false; });
  }
  function reply(src, app, action) {
    try { src.postMessage({ sharedLink: 'attention-reply', app: app, kind: 'call', action: action }, file ? '*' : location.origin); } catch (_) { /* gone */ }
  }
  function front(src) {
    try {
      if (typeof window.__hubAttentionFocus === 'function') { window.__hubAttentionFocus(src); return; }
      var W = window.HubWM; if (W && W.idOf) { var id = W.idOf(src); if (id) W.focus(id); }
    } catch (_) { /* best effort */ }
  }
  function show(src, m) {
    close(src); css();
    var c = document.createElement('div'); c.className = 'hub-att-card' + (dark() ? ' dk' : '');
    var t = document.createElement('div'); t.className = 'hub-att-t'; t.textContent = String(m.title || (m.app || 'App') + ': incoming call');
    var bs = document.createElement('div'); bs.className = 'hub-att-b';
    var ok = document.createElement('button'); ok.type = 'button'; ok.className = 'hub-att-ok'; ok.textContent = 'Answer';
    var no = document.createElement('button'); no.type = 'button'; no.className = 'hub-att-no'; no.textContent = 'Decline';
    ok.addEventListener('click', function () { close(src); reply(src, m.app, 'answer'); front(src); });
    no.addEventListener('click', function () { close(src); reply(src, m.app, 'decline'); });
    bs.append(ok, no); c.append(t, bs); box().appendChild(c);
    cards.push({ src: src, el: c });
  }
  window.addEventListener('message', function (e) {
    var m = e.data;
    if (!m || typeof m !== 'object' || m.sharedLink !== 'attention') return;
    if (!file && e.origin !== location.origin) return;
    if (!e.source || !isFrame(e.source)) return;
    if (m.kind === 'call-end') { close(e.source); return; }
    if (m.kind !== 'call') return;
    var D = window.HubDnd;
    if (D && D.isOn() && !(m.urgent === true && m.fav === true && D.allowFavs())) {
      try { if (window.HubNotify && HubNotify.notice) HubNotify.notice({ icon: '📞', title: 'Missed call', text: String(m.title || m.app || '') }); } catch (_) { /* */ }
      return;
    }
    show(e.source, m);
  });
  /* H51: a yes / no card for the Hub itself (mesh join approval): ask({id, title, text, ok, no, timeoutMs}, cb(bool | null))
     cb(true) = ok, cb(false) = no, cb(null) = timed out / replaced. Shown even in Do Not Disturb (a device is waiting). */
  function ask(o, cb) {
    o = o || {}; var id = 'ask:' + String(o.id || Math.random());
    var fired = false;
    function fire(v) { if (fired) return; fired = true; close(id); try { cb(v); } catch (e) { console.warn('HubAttention.ask', e); } }
    var prev = cards.find(function (c) { return c.src === id; }); if (prev && prev.fire) prev.fire(null);
    css();
    var c = document.createElement('div'); c.className = 'hub-att-card' + (dark() ? ' dk' : '');
    var t = document.createElement('div'); t.className = 'hub-att-t'; t.textContent = String(o.title || 'Allow?');
    c.appendChild(t);
    if (o.text) { var x = document.createElement('div'); x.style.cssText = 'margin:-4px 0 10px;font-size:13px;opacity:.8;word-break:break-word'; x.textContent = String(o.text); c.appendChild(x); }
    var bs = document.createElement('div'); bs.className = 'hub-att-b';
    var ok = document.createElement('button'); ok.type = 'button'; ok.className = 'hub-att-ok'; ok.textContent = String(o.ok || 'Allow');
    var no = document.createElement('button'); no.type = 'button'; no.className = 'hub-att-no'; no.textContent = String(o.no || 'Deny');
    ok.addEventListener('click', function () { fire(true); });
    no.addEventListener('click', function () { fire(false); });
    bs.append(ok, no); c.appendChild(bs); box().appendChild(c);
    cards.push({ src: id, el: c, fire: fire });
    if (o.timeoutMs > 0) setTimeout(function () { fire(null); }, o.timeoutMs);
    return { close: function () { fire(null); } };
  }
  // window.HubAttention = { count: function () { return cards.length; }, closeAll: function () { cards.slice().forEach(function (c) { close(c.src); }); } };   (before H51)
  window.HubAttention = { count: function () { return cards.length; }, closeAll: function () { cards.slice().forEach(function (c) { if (c.fire) c.fire(null); else close(c.src); }); }, ask: ask };   // H51: + ask
})();
