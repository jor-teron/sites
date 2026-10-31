/* Agent — app/main.js (AG8: also registers agent_sw.js; AG9: boots after HR.hubKeys.load()): HR.notify (Hub cards) and boot.
   HR.notify({icon,title,text,onClick,timeoutMs}) -> {close(), update(text)}: inside the Hub uses
   window.top.HubNotify.notice; standalone / Hub unreachable -> small local card bottom-right (✕, ~5 s, max 3). Never toasts.
   AG4: HR.chats.init runs once HR.folder.init settles (so the last chat is read from the folder when it is connected). */
HR.notify = (function () {
  var host = null;
  function mk(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function local(o) {
    if (!host) { host = mk('div', 'hn-host'); host.setAttribute('aria-live', 'polite'); document.body.appendChild(host); }
    var card = mk('div', 'hn-card'), body = mk('div', 'hn-body'), x = mk('button', 'hn-x', '✕'), tx = mk('div', 'hn-text', o.text || ''), timer = 0;
    card.setAttribute('role', 'status'); if (o.icon) card.appendChild(mk('div', 'hn-icon', o.icon));
    body.appendChild(mk('div', 'hn-title', o.title || 'Agent')); if (o.text) body.appendChild(tx);
    x.type = 'button'; x.setAttribute('aria-label', 'Close notification'); card.append(body, x);
    function close() { clearTimeout(timer); card.remove(); }
    x.onclick = function (e) { e.stopPropagation(); close(); };
    if (typeof o.onClick === 'function') { card.classList.add('click'); card.onclick = function () { close(); o.onClick(); }; }
    host.insertBefore(card, host.firstChild); while (host.children.length > 3) host.lastChild.remove();
    var ms = o.timeoutMs != null ? o.timeoutMs : 5000; if (ms > 0) timer = setTimeout(close, ms);
    return { close: close, update: function (t) { tx.textContent = t; if (!tx.parentNode) body.appendChild(tx); } };
  }
  return function (o) {
    o = o || {}; o.title = o.title || 'Agent';
    try {
      var H = window.top !== window && window.top.HubNotify;
      if (H && H.notice) { var c = H.notice({ icon: o.icon, title: o.title, text: o.text, onClick: o.onClick, timeoutMs: o.timeoutMs });
        return { close: function () { c && c.close && c.close(); }, update: function (t) { c && c.update && c.update(t); } }; }
    } catch (e) { /* cross-origin top or no Hub */ }
    return local(o);
  };
})();
/* AG-F7: no version read from ?v= any more
var AGENT_VER = (function () { try { return new URL(document.currentScript.src).searchParams.get('v') || 'dev'; } catch (e) { return 'dev'; } })(); */
HR.set.applyTheme();
/* AG9: read the Hub's keys first (in-memory only; at most 1.5 s), then boot */
Promise.race([HR.hubKeys.load().catch(function () {}), new Promise(function (r) { setTimeout(r, 1500); })]).then(function () {
  HR.set.init();
  HR.set.applyDisplay();
  HR.steps.init();
  HR.chat.init();
  var folder = HR.folder.init();
  HR.helperSet.init();
  HR.provider.init();
  HR.bcard.init();
  HR.model.init();
  HR.meter.init();
  HR.usageView.init();
  HR.hubRows.init();
  Promise.resolve(folder).catch(function () {}).then(HR.chats.init);   /* AG4: chats after the folder handle is known */
  HR.chatSearch.init();
  /* AG8: Agent's own offline service worker, scope apps/lab/agent/ (agent_sw.js); AG-F7: plain link, plain 'agent-files' cache
    navigator.serviceWorker.register('agent_sw.js?v=' + AGENT_VER, { scope: './', updateViaCache: 'none' }).catch(function () {}); */
  if ('serviceWorker' in navigator && location.protocol !== 'file:')
    navigator.serviceWorker.register('agent_sw.js', { scope: './', updateViaCache: 'none' }).catch(function () {});
});
