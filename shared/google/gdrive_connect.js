/*
 * Google Drive connect panel (shared/google/gdrive_connect.js + google.css) — the QR sign-in UI
 * used by the Hub's "Google Drive" drive tile (hub/hub_drives.js) and the Files app.
 * States:
 *   setup    no TV client id AND no web client id in google_config.js → "Set up Google Drive (see How-to)"
 *   idle     ☁ Google Drive + the sign-in methods (R9b), the default one (GOOGLE_CONFIG.defaultMethod,
 *            'qr' for now) first and big:
 *              "QR code (Hub files only)"       device flow below (drive.file)
 *              "Phone as a key (full Drive)"    QR to apps/tools/phonekey/ on the phone; the phone signs
 *                                               in (Google Identity Services) and sends the token over
 *                                               the Hub's SharedLink (phonekey.js, hub/hub_phonekey.js)
 *              "Sign in on this computer"       small link: Google's popup here (google_gis.js)
 *            (a code / room is only made on click: they expire and Google limits requests)
 *   renew    phone / popup sign-in ran out (~1 h, no refresh token): big "Renew from phone"
 *            (a new phone QR; an open phone page can also just tap "Send again") + the popup link
 *   phone    big QR to the phone page + "Waiting for your phone…" + Cancel (room valid 10 min)
 *   code     big QR (verification_url_complete when Google sends it, else verification_url) +
 *            the user code in big letters + "Waiting for you to approve…" + Cancel
 *   error    what went wrong (network / CORS, denied, expired) + Try again
 * Signed in → o.onDone(user) (the drive tiles redraw through GoogleAuth.onChange anyway).
 * Needs shared/vendor/qrcode.js (the QR lib the Hub's QR tiles use), google_auth.js, and for the
 * phone / popup methods phonekey.js + google_gis.js.
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

    const C = window.GOOGLE_CONFIG || {};
    const hasQr = () => !!(A && A.configured());
    const hasWeb = () => !!(A && A.webConfigured && A.webConfigured());
    function popupLink() {
      if (!hasWeb() || !window.GoogleGis) return null;
      const a = button('gdc-link', 'Sign in on this computer', popup);
      a.title = 'Google\u2019s sign-in window on this computer (full Drive, about an hour)';
      return a;
    }
    function idle() {
      if (!A || (!hasQr() && !hasWeb())) {
        const b = button('gdc-setup', 'Set up Google Drive (see How-to)', () => { if (o.onHowto) o.onHowto(); });
        show(head(), b);
        return;
      }
      if (A.expired && A.expired()) {   // phone / popup token ran out
        const u = A.user();
        show(head((u.email ? u.email + ' \u00B7 ' : '') + 'sign-in ran out'),
          button('gdc-go gdc-renew', 'Renew from phone', phone), popupLink() || el('span'));
        return;
      }
      const qr = button('gdc-go gdc-m-qr', 'QR code (Hub files only)', go);
      qr.title = 'Sign in by QR code (device flow). The Hub sees only the files it makes.';
      const ph = button('gdc-go gdc-m-phone', 'Phone as a key (full Drive)', phone);
      ph.title = 'Sign in on your phone; the Hub gets your whole Google Drive for about an hour.';
      qr.disabled = !hasQr(); ph.disabled = !hasWeb() || !window.PhoneKey;
      const phoneFirst = C.defaultMethod === 'phone' ? !ph.disabled : qr.disabled;
      (phoneFirst ? qr : ph).classList.add('gdc-alt');
      show(head('Choose how to sign in'), ...(phoneFirst ? [ph, qr] : [qr, ph]), popupLink() || el('span'));
    }
    // Phone as a key: QR to the phone page; the Hub page (hub_phonekey.js) stores the token
    let roomT = 0;
    function phone() {
      if (flow) flow.cancel();
      const r = window.PhoneKey.room();
      if (!r.url) {
        fail(new Error('The Hub\u2019s phone link isn\u2019t ready. Open the Hub on this computer (it shows the Gamepad QR), then try again.'));
        return;
      }
      const qr = qrSvg(r.url);
      clearTimeout(roomT);
      roomT = setTimeout(() => { if (!gone && root.querySelector('.gdc-phone')) fail(new Error('That QR ran out (10 minutes). Make a new one.')); }, 10 * 60 * 1000);
      const box = el('div', 'gdc-phone');
      box.append(qr || el('span'), el('div', 'gdc-hint', 'Scan with your phone, then tap \u201cSign in with Google\u201d'),
        el('p', 'gdc-status', 'Waiting for your phone\u2026 (keep the Hub open)'),
        button('gdc-cancel', 'Cancel', () => { clearTimeout(roomT); idle(); }));
      show(box);
    }
    async function popup() {
      if (flow) flow.cancel();
      show(head(), el('p', 'gdc-status', 'Google\u2019s sign-in window is open\u2026'));
      try {
        const r = await window.GoogleGis.token();
        A.setToken(r, 'popup');
      } catch (e) { fail(e); }
    }
    const offAuth = A ? A.onChange(() => {
      if (gone) return;
      if (A.signedIn()) { clearTimeout(roomT); if (root.querySelector('.gdc-phone') || !flow) { if (o.onDone) o.onDone(A.user()); } }
      else if (!flow && !root.querySelector('.gdc-phone')) idle();
    }) : () => {};
    function fail(e) {
      const net = e && e.code === 'network';
      show(head(), el('p', 'gdc-err', (net ? '\u26A0 ' : '') + (e && e.message || String(e))), button('gdc-go', 'Back', idle));
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
    return { destroy() { gone = true; clearTimeout(roomT); offAuth(); if (flow) flow.cancel(); flow = null; } };
  }
  window.GDriveConnect = { mount };
})();
