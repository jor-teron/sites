/*
 * Sound Recorder — notification cards. SRNotify({ icon, title, text, onClick, timeoutMs }) -> { close(), update(text) }
 * Inside the Hub: uses the Hub's card (window.top.HubNotify.notice) so cards look and stack like every Hub app.
 * Standalone (or Hub not reachable): a small local card, bottom-right, ✕ to close, auto-close ~5 s
 * (timeoutMs 0 = stays until closed), at most 3 stacked (oldest drops). Colours follow the app theme.
 */
const SRNotify = (() => {
  'use strict';
  const MAX = 3, MS = 5000;
  let host = null;
  const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  function local(o) {
    if (!host) { host = mk('div', 'srn-host'); host.setAttribute('aria-live', 'polite'); document.body.appendChild(host); }
    const card = mk('div', 'srn-card'), body = mk('div', 'srn-body'), x = mk('button', 'srn-x', '✕');
    card.setAttribute('role', 'status');
    if (o.icon) card.appendChild(mk('div', 'srn-icon', o.icon));
    if (o.title) body.appendChild(mk('div', 'srn-title', o.title));
    const tx = mk('div', 'srn-text', o.text || ''); if (o.text) body.appendChild(tx);
    x.type = 'button'; x.title = 'Close'; x.setAttribute('aria-label', 'Close notification');
    card.append(body, x);
    let timer = 0;
    const close = () => { clearTimeout(timer); card.remove(); };
    x.onclick = (e) => { e.stopPropagation(); close(); };
    if (typeof o.onClick === 'function') { card.classList.add('click'); card.onclick = () => { close(); o.onClick(); }; }
    host.insertBefore(card, host.firstChild);
    while (host.children.length > MAX) host.lastChild.remove();
    const ms = o.timeoutMs != null ? o.timeoutMs : MS;
    if (ms > 0) timer = setTimeout(close, ms);
    return { close, update: (t) => { tx.textContent = t; if (!tx.parentNode) body.appendChild(tx); } };
  }

  return function notify(o) {
    o = typeof o === 'string' ? { text: o } : (o || {});
    try {
      const H = window.top !== window && window.top.HubNotify;
      if (H && H.notice) {
        const c = H.notice({ icon: o.icon, title: o.title, text: o.text, onClick: o.onClick, timeoutMs: o.timeoutMs });
        return { close: () => c && c.close && c.close(), update: (t) => c && c.update && c.update(t) };
      }
    } catch (_) { /* cross-origin or no Hub: local card */ }
    return local(o);
  };
})();
