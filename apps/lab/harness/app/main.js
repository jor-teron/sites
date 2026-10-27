/* Harness — app/main.js: HR.notify (Hub cards) and boot.
   HR.notify({icon,title,text,onClick,timeoutMs}) -> {close(), update(text)}: inside the Hub uses
   window.top.HubNotify.notice; standalone / Hub unreachable -> small local card bottom-right (✕, ~5 s, max 3). Never toasts. */
HR.notify = (function () {
  var host = null;
  function mk(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function local(o) {
    if (!host) { host = mk('div', 'hn-host'); host.setAttribute('aria-live', 'polite'); document.body.appendChild(host); }
    var card = mk('div', 'hn-card'), body = mk('div', 'hn-body'), x = mk('button', 'hn-x', '✕'), tx = mk('div', 'hn-text', o.text || ''), timer = 0;
    card.setAttribute('role', 'status'); if (o.icon) card.appendChild(mk('div', 'hn-icon', o.icon));
    body.appendChild(mk('div', 'hn-title', o.title || 'Harness')); if (o.text) body.appendChild(tx);
    x.type = 'button'; x.setAttribute('aria-label', 'Close notification'); card.append(body, x);
    function close() { clearTimeout(timer); card.remove(); }
    x.onclick = function (e) { e.stopPropagation(); close(); };
    if (typeof o.onClick === 'function') { card.classList.add('click'); card.onclick = function () { close(); o.onClick(); }; }
    host.insertBefore(card, host.firstChild); while (host.children.length > 3) host.lastChild.remove();
    var ms = o.timeoutMs != null ? o.timeoutMs : 5000; if (ms > 0) timer = setTimeout(close, ms);
    return { close: close, update: function (t) { tx.textContent = t; if (!tx.parentNode) body.appendChild(tx); } };
  }
  return function (o) {
    o = o || {}; o.title = o.title || 'Harness';
    try {
      var H = window.top !== window && window.top.HubNotify;
      if (H && H.notice) { var c = H.notice({ icon: o.icon, title: o.title, text: o.text, onClick: o.onClick, timeoutMs: o.timeoutMs });
        return { close: function () { c && c.close && c.close(); }, update: function (t) { c && c.update && c.update(t); } }; }
    } catch (e) { /* cross-origin top or no Hub */ }
    return local(o);
  };
})();
(function () {
  HR.set.applyTheme();
  HR.set.init();
  HR.steps.init();
  HR.chat.init();
  HR.folder.init();
  HR.helperSet.init();
  HR.provider.init();
  HR.model.init();
})();
