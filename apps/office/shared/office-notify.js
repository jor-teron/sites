/*
 * apps/office/shared/office-notify.js
 * SH7 shared notification cards (was office-toast.js, SH1).
 *   OfficeNotify.show(msg, ms)                                  old toast call, still works
 *   OfficeNotify.show({ icon, title, text, onClick, timeoutMs })  full card
 *   OfficeNotify.notice(o)                                       same as show(o)
 * Returns { close(), update(text) }. OfficeToast is kept as an alias of OfficeNotify.
 * Inside the Hub: window.top.HubNotify.notice(...) (plain notice cards only).
 * Standalone: a small local card (icon, title, text, ✕), bottom-right, ~5 s, max 3 stacked.
 * Plain-text calls get an icon from the wording (⚠️ errors, ✅ done, 🗑️ delete, ℹ️ other) and the
 * app name as title. Style: office-notify.css. No dependencies.
 */
var OfficeNotify = (function () {
  var MAX = 3, MS = 5000, host = null;
  function guessIcon(t) {
    if (/fail|error|could ?n[o']t|can[' ]?no?t|invalid|not (found|supported|allowed)|too (big|large)|unable|denied/i.test(t)) return '⚠️';
    if (/delet|remov|clear/i.test(t)) return '🗑️';
    if (/saved|copied|done|exported|imported|downloaded|created|added|sent|ready|restored|reset/i.test(t)) return '✅';
    return 'ℹ️';
  }
  function appName() { var t = String(document.title || '').split(/\s+[—–|-]\s+/)[0].trim(); return t.length <= 24 ? t : ''; }
  function norm(a, ms) {
    var o = (a && typeof a === 'object') ? a : { text: a == null ? '' : String(a) };
    if (o.icon == null) o.icon = guessIcon((o.title || '') + ' ' + (o.text || ''));
    if (o.title == null) o.title = appName();
    if (o.timeoutMs == null) o.timeoutMs = Math.max(ms || 0, MS);
    return o;
  }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function local(o) {
    if (!document.body) return { close: function () {}, update: function () {} };
    if (!host || !host.isConnected) { host = el('div', 'of-notes'); host.setAttribute('aria-live', 'polite'); document.body.appendChild(host); }
    var card = el('div', 'of-note'), body = el('div', 'of-note-body'), tx = el('div', 'of-note-text', o.text || ''), x = el('button', 'of-note-x', '✕'), timer = 0;
    card.setAttribute('role', 'status');
    if (o.icon) card.appendChild(el('div', 'of-note-icon', o.icon));
    if (o.title) body.appendChild(el('div', 'of-note-title', o.title));
    if (o.text) body.appendChild(tx);
    x.type = 'button'; x.title = 'Close'; x.setAttribute('aria-label', 'Close notification');
    card.appendChild(body); card.appendChild(x);
    function close() { clearTimeout(timer); if (card.parentNode) card.parentNode.removeChild(card); }
    x.onclick = function (e) { e.stopPropagation(); close(); };
    if (typeof o.onClick === 'function') { card.className += ' click'; card.onclick = function () { close(); o.onClick(); }; }
    host.insertBefore(card, host.firstChild);
    while (host.children.length > MAX) host.removeChild(host.lastChild);
    if (o.timeoutMs > 0) timer = setTimeout(close, o.timeoutMs);
    return { close: close, update: function (t) { tx.textContent = t; if (!tx.parentNode) body.appendChild(tx); } };
  }
  function show(a, ms) {
    var o = norm(a, ms);
    try {
      var H = window.top !== window && window.top.HubNotify;
      if (H && H.notice) {
        var c = H.notice({ icon: o.icon, title: o.title, text: o.text, onClick: o.onClick, timeoutMs: o.timeoutMs });
        return { close: function () { if (c && c.close) c.close(); }, update: function (t) { if (c && c.update) c.update(t); } };
      }
    } catch (e) { /* cross-origin or no Hub: local card */ }
    return local(o);
  }
  return { show: show, notice: show };
})();
var OfficeToast = OfficeNotify; /* SH1 name, kept for old callers */
