/*
 * Google Drive connect panel (shared/google/gdrive_connect.js + google.css) — the QR sign-in UI
 * used by the Hub's "Google Drive" drive tile (hub/hub_drives.js) and the Files app.
 * States:
 *   setup    no TV client id in google_config.js → "Set up Google Drive (see How-to)"
 *   idle     ☁ Google Drive + a big "Connect" button (a code is only asked for on Connect:
 *            codes expire and Google limits how many we may request)
 *   code     big QR (verification_url_complete when Google sends it, else verification_url) +
 *            the user code in big letters + "Waiting for you to approve…" + Cancel
 *   error    what went wrong (network / CORS, denied, expired) + Try again
 * Signed in → o.onDone(user) (the drive tiles redraw through GoogleAuth.onChange anyway).
 * Needs shared/vendor/qrcode.js (the QR lib the Hub's QR tiles use) and google_auth.js.
 * API window.GDriveConnect.mount(host, { compact, onDone, onHowto }) → { destroy() }.
 */
(function () {
  'use strict';
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function button(cls, text, fn) {
    const b = el('button', 'gdc-btn ' + cls, text);
    b.type = 'button';
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(e); });
    return b;
  }
  function qrSvg(text) {
    if (typeof window.qrcode !== 'function') return null;
    const q = window.qrcode(0, 'M');
    q.addData(text);
    q.make();
    const box = el('div', 'gdc-qr');
    box.innerHTML = q.createSvgTag(4, 12);
    const svg = box.querySelector('svg');
    if (svg) { svg.removeAttribute('width'); svg.removeAttribute('height'); svg.setAttribute('aria-label', 'QR code: ' + text); }
    return box;
  }

  function mount(host, o) {
    o = o || {};
    const A = window.GoogleAuth;
    let flow = null, gone = false;
    const root = el('div', 'gdc' + (o.compact ? ' gdc-compact' : ''));
    host.replaceChildren(root);
    const show = (...kids) => { if (!gone) root.replaceChildren(...kids); };
    const head = (sub) => {
      const h = el('div', 'gdc-head');
      h.append(el('span', 'gdc-ico', '\u2601\uFE0F'), el('b', 'gdc-name', 'Google Drive'));
      if (sub) h.appendChild(el('span', 'gdc-sub', sub));
      return h;
    };

    function idle() {
      if (!A || !A.configured()) {
        const b = button('gdc-setup', 'Set up Google Drive (see How-to)', () => { if (o.onHowto) o.onHowto(); });
        show(head(), b);
        return;
      }
      show(head('Sign in with your phone'), button('gdc-go', 'Connect', go));
    }
    function fail(e) {
      const net = e && e.code === 'network';
      show(head(), el('p', 'gdc-err', (net ? '\u26A0 ' : '') + (e && e.message || String(e))), button('gdc-go', 'Try again', go));
    }
    function go() {
      if (flow) flow.cancel();
      show(head(), el('p', 'gdc-status', 'Asking Google for a code\u2026'));
      const status = el('p', 'gdc-status', 'Scan the QR or open the address on your phone, then enter the code.');
      flow = A.connect({
        onCode(dev) {
          const url = dev.verification_url_complete || dev.verification_url || 'https://www.google.com/device';
          const qr = qrSvg(url);
          const code = el('div', 'gdc-code', dev.user_code);
          code.title = 'Your code';
          const link = el('a', 'gdc-url', url.replace(/^https?:\/\//, ''));
          link.href = url; link.target = '_blank'; link.rel = 'noopener';
          link.addEventListener('click', (e) => e.stopPropagation());
          show(qr || el('span'), el('div', 'gdc-hint', dev.verification_url_complete ? 'Scan to approve' : 'Scan, then type this code:'),
            code, link, status, button('gdc-cancel', 'Cancel', () => { if (flow) flow.cancel(); flow = null; idle(); }));
        },
        onStatus(t) { status.textContent = t; }
      });
      flow.done.then((u) => { flow = null; if (o.onDone) o.onDone(u); }, (e) => { flow = null; if (e && e.code === 'cancelled') return; fail(e); });
    }
    idle();
    return { destroy() { gone = true; if (flow) flow.cancel(); flow = null; } };
  }
  window.GDriveConnect = { mount };
})();
