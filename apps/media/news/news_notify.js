/* News — news_notify.js: NNotify({icon,title,text,onClick,timeoutMs}) -> {close(), update(text)}.
   Inside the Hub: window.top.HubNotify.notice (Hub cards). Standalone / Hub unreachable: small local card bottom-right,
   ✕ to close, auto-close ~5 s, at most 3 stacked. Never toasts. */
var NNotify = (function () {
  var host = null;
  function mk(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function local(o) {
    if (!host) { host = mk('div', 'nn-host'); host.setAttribute('aria-live', 'polite'); document.body.appendChild(host); }
    var card = mk('div', 'nn-card'), body = mk('div', 'nn-body'), x = mk('button', 'nn-x', '✕'), tx = mk('div', 'nn-text', o.text || ''), timer = 0;
    card.setAttribute('role', 'status');
    if (o.icon) card.appendChild(mk('div', 'nn-icon', o.icon));
    body.appendChild(mk('div', 'nn-title', o.title || 'News')); if (o.text) body.appendChild(tx);
    x.type = 'button'; x.setAttribute('aria-label', 'Close notification');
    card.appendChild(body); card.appendChild(x);
    function close() { clearTimeout(timer); card.remove(); }
    x.onclick = function (e) { e.stopPropagation(); close(); };
    if (typeof o.onClick === 'function') { card.classList.add('click'); card.onclick = function () { close(); o.onClick(); }; }
    host.insertBefore(card, host.firstChild);
    while (host.children.length > 3) host.lastChild.remove();
    var ms = o.timeoutMs != null ? o.timeoutMs : 5000; if (ms > 0) timer = setTimeout(close, ms);
    return { close: close, update: function (t) { tx.textContent = t; if (!tx.parentNode) body.appendChild(tx); } };
  }
  return function (o) {
    o = o || {}; o.title = o.title || 'News';
    try {
      var H = window.top !== window && window.top.HubNotify;
      if (H && H.notice) { var c = H.notice({ icon: o.icon, title: o.title, text: o.text, onClick: o.onClick, timeoutMs: o.timeoutMs });
        return { close: function () { c && c.close && c.close(); }, update: function (t) { c && c.update && c.update(t); } }; }
    } catch (e) { /* cross-origin top or Hub missing: local card */ }
    return local(o);
  };
})();
