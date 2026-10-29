/*
 * Hub — H27 side panels. Loaded after hub-controller.js, hub_link.js, hub_linkstate.js,
 * hub_remote.js and hub_chat.js. Re-arranges the 🎮 Devices popover (#ctrl-popover) into a
 * full-height side panel with sections, adds "Join with code", and keeps only one panel
 * (Devices or 🐻 Chat) open at a time. Look: hub_panels.css.
 *   H27.1 order, top to bottom (no QR here: the desktop home screen shows the Connect QR):
 *   This Hub   : big code + New code / Disconnect button (hub_linkstate.js; its repeated
 *                "Code … · N devices" text hidden), then a small plain 'Name: X ›' line (H46).
 *   H46: the editable device name moved to Settings › About › Device name (#about/device,
 *                apps/system/settings/sec_about.js). The pop-up only shows the name as text; a tap
 *                closes the pop-up and opens Settings there (__hubOpenApp, hash 'about/device').
 *   H29.2b: that card is now in Settings › Devices (sec_devices.js), so the tap opens hash 'devices/device'
 *                (the old #about/device still redirects there in settings.js).
 *                The text repaints on 'hub-device-name' (sent by Settings), the 'storage' event for
 *                'shared-link-device-name' (another tab / Settings opened on its own: it also re-sends
 *                the name to the link) and on SharedLink 'devices' / pop-up open.
 *                The SharedLinkUI.mountName box (hub_link.js) is still made, but removed here unused.
 *   Join       : 4-digit box + Join + 📷 (SharedLinkScan.ask) → location ?join=CODE (as
 *                hub_remote.js). Own code is rejected (H31: on a phone whose link is down it rejoins now). A join that has not connected after
 *                20 s shows "Hub not found — check the code" (sessionStorage 'hub-join-try').
 *                H55: 0000 is the public mesh, not a Hub: on a joined phone it disconnects (back to 0000),
 *                elsewhere it turns Settings › Devices › Join public mesh on (HubMeshLink.setPublic).
 *   Devices    : SharedLinkUI.mountDevices list (styled as roomy rows).
 *   H59 (2026-10-29): the pop-up is minimal again, three rows only (no headings, cards, hints, Name
 *                line or Devices list; those live in Settings › Devices):
 *                  1. the Gamepad QR (hub/controller/controller.html#code=CODE, drawn with qrcode.js);
 *                  2. the code in big digits + a small ↻ (host: hub_linkstate.js New code) or ⏏ (joined phone:
 *                     Disconnect) button;
 *                  3. Join row: code box ('Join code') + 📷 + Join, Enter joins; a failure is a small red
 *                     line under the row for 4 s.
 *                📷 no longer calls SharedLinkScan.ask (that opened a 2nd code dialog): it opens its OWN
 *                camera modal (#hp-cam, centred on the desktop, dimmed backdrop, Cancel; Phone mode near full
 *                width) and never touches the pop-up's layout. Same scanner as the Gamepad controller
 *                (controller_logic.js openScanner): lazy-loaded hub/controller/vendor/jsQR.js, back camera,
 *                frames scaled to 480 px every 120 ms. A scan stops the camera, closes the modal, fills the
 *                box and joins. Cancel / Esc / backdrop stop every camera track.
 *   One-tap switch: with Devices open, a tap on 🐻 (under #ctrl-backdrop) closes Devices and
 *                opens Chat; 🎮 with Chat open already works (chat closes on outside pointerdown).
 */
(function () {
  'use strict';
  const pop = document.getElementById('ctrl-popover');
  const chat = document.getElementById('chat-panel');
  const R = window.__hubRemote;

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function myCode() {
    if (R) return R.code;
    const hc = window.__hubController;
    return (hc && hc.code) || (window.SharedLink && SharedLink.code) || '';
  }

  if (pop) {
    const head = pop.querySelector('.ctrl-pop-head');
    const close = document.getElementById('ctrl-close');
    if (close) close.textContent = '✕';
    const extra = pop.querySelector('.sl-extra');
    const nameBox = extra && extra.querySelector('.sl-name');
    const devs = extra && extra.querySelector('.sl-devices');
    const lsRow = pop.querySelector('.ls-row');
    /* H46 legacy (H27): the editable name box sat at the top of the This Hub card.
    if (nameBox && nameBox.firstChild && nameBox.firstChild.nodeType === 3) nameBox.firstChild.textContent = 'This device name';
    */
    if (nameBox) nameBox.remove();   // H46: not used here any more (no duplicate name inputs); edit in Settings › Devices (H29.2b; was About)

    /* H59 legacy (H27 … H46): sectioned pop-up (This Hub card + Name line, Join card + hint, Connected devices).
    const body = el('div', 'hp-body');
    /* This Hub *\/
    const s1 = el('section', 'hp-sec'); s1.appendChild(el('h3', '', R ? 'This device' : 'This Hub'));
    const c1 = el('div', 'hp-card');
    // if (nameBox) c1.appendChild(nameBox);   // H46 legacy (H27): replaced by the Name line below
    const hub = el('div', 'hp-hub');
    const info = el('div', 'hp-hubinfo');
    const codeLbl = el('div', 'hp-codelbl', R ? 'Joined Hub code' : 'Hub code');
    const codeEl = el('div', 'hp-code', '——');
    info.append(codeLbl, codeEl);
    hub.appendChild(info);
    if (lsRow) { lsRow.classList.add(R ? 'hp-ls-remote' : 'hp-ls-host'); hub.appendChild(lsRow); }
    c1.appendChild(hub);
    /* H46: plain 'Name: X ›' → Settings › About › Device name (H29.2b: Settings › Devices › Device name) *\/
    const nameLink = el('button', 'hp-name');
    nameLink.type = 'button'; nameLink.id = 'hp-name';
    nameLink.title = 'Change the device name in Settings';
    const nameVal = el('span', 'hp-name-v', '');
    nameLink.append(el('span', 'hp-name-k', 'Name:'), nameVal, el('span', 'hp-name-go', '\u203A'));
    nameLink.addEventListener('click', () => {
      const x = document.getElementById('ctrl-close');
      if (x && !pop.hidden) x.click();
      // if (window.__hubOpenApp) window.__hubOpenApp('apps/system/settings/', { hash: 'about/device' });   // (before H29.2b)
      if (window.__hubOpenApp) window.__hubOpenApp('apps/system/settings/', { hash: 'devices/device' });   // H29.2b
    });
    c1.appendChild(nameLink);
    s1.appendChild(c1);
    /* Devices *\/
    const s2 = el('section', 'hp-sec'); s2.appendChild(el('h3', '', 'Connected devices'));
    if (devs) s2.appendChild(devs); else s2.appendChild(el('div', 'hp-hint', 'Device list unavailable'));
    /* Join *\/
    const s3 = el('section', 'hp-sec'); s3.appendChild(el('h3', '', 'Join with code'));
    const form = el('form', 'hp-card hp-join'); form.autocomplete = 'off';
    const inp = el('input'); inp.type = 'text'; inp.inputMode = 'numeric'; inp.maxLength = 4; inp.placeholder = '0000'; inp.setAttribute('aria-label', 'Hub code');
    const go = el('button', 'hp-go', 'Join'); go.type = 'submit';
    const scan = el('button', 'hp-btn hp-scan', '📷'); scan.type = 'button'; scan.title = 'Scan a QR code'; scan.setAttribute('aria-label', 'Scan a QR code');
    const err = el('div', 'hp-err'); err.setAttribute('role', 'status');
    form.append(inp, go, scan, err);
    s3.append(form, el('div', 'hp-hint', 'Type the 4-digit code shown on the other Hub, or scan its QR code.'));
    body.append(s1, s3, s2);
    if (extra) extra.remove();
    pop.appendChild(body);
    if (head) pop.insertBefore(head, pop.firstChild);

    */
    /* H59: three rows, nothing else */
    const body = el('div', 'hp-body hp-min');
    const qrBox = el('div', 'hp-qr'); qrBox.id = 'hp-qr';
    qrBox.setAttribute('role', 'img'); qrBox.setAttribute('aria-label', 'Gamepad QR code');
    const codeRow = el('div', 'hp-coderow');
    const codeEl = el('div', 'hp-code', '——'); codeEl.id = 'hp-code';
    codeRow.appendChild(codeEl);
    if (lsRow) {   // hub_linkstate.js: host ↻ New code (with its confirm) / joined phone ⏏ Disconnect
      lsRow.classList.add(R ? 'hp-ls-remote' : 'hp-ls-host');
      const act = lsRow.querySelector('.ls-btn');
      if (act) {
        act.classList.add('hp-mini');
        act.textContent = R ? '\u23CF' : '\u21BB';
        act.title = R ? 'Disconnect from Hub' : 'New code';
        act.setAttribute('aria-label', act.title);
      }
      codeRow.appendChild(lsRow);
    }
    const form = el('form', 'hp-join'); form.autocomplete = 'off';
    const inp = el('input'); inp.type = 'text'; inp.inputMode = 'numeric'; inp.maxLength = 4; inp.placeholder = 'Join code'; inp.setAttribute('aria-label', 'Join code');
    const scan = el('button', 'hp-btn hp-scan', '📷'); scan.type = 'button'; scan.title = 'Scan a QR code'; scan.setAttribute('aria-label', 'Scan a QR code');
    const go = el('button', 'hp-go', 'Join'); go.type = 'submit';
    form.append(inp, scan, go);
    const err = el('div', 'hp-err'); err.setAttribute('role', 'status');
    const joinWrap = el('div', 'hp-joinwrap');
    joinWrap.append(form, err);
    body.append(qrBox, codeRow, joinWrap);
    if (extra) extra.remove();   // name box + devices list (hub_link.js): Settings › Devices has them
    pop.appendChild(body);
    if (head) { head.classList.add('hp-head-min'); pop.insertBefore(head, pop.firstChild); }
    const nameVal = { textContent: '' }, nameLink = { setAttribute() {} };   // H59: no Name line; paintName stays harmless

    let errT = 0;
    function flash(msg) {   // H59: a short red line under the join row
      clearTimeout(errT);
      err.textContent = msg || '';
      if (msg) errT = setTimeout(() => { err.textContent = ''; }, 4000);
    }
    function gamepadUrl(c) {
      const u = new URL('hub/controller/controller.html', location.href);
      u.search = ''; u.hash = 'code=' + c;
      return u.href;
    }
    let qrFor = null;
    function paintQr(c) {
      if (c === qrFor) return;
      qrFor = c; qrBox.innerHTML = '';
      if (!c || typeof qrcode !== 'function') return;
      try {
        const q = qrcode(0, 'M'); q.addData(gamepadUrl(c)); q.make();
        qrBox.innerHTML = q.createSvgTag(4, 16);
        const svg = qrBox.querySelector('svg');
        if (svg) { svg.setAttribute('width', '196'); svg.setAttribute('height', '196'); svg.style.display = 'block'; svg.style.background = '#fff'; }
      } catch (e) { console.warn('hub_panels QR', e); }
    }

    function paintHub() {
      const c = myCode();
      codeEl.textContent = c || '——';
      paintQr(c);   // H59
      paintName();
    }
    function paintName() {   // H46
      const n = window.SharedLinkDevices ? SharedLinkDevices.name() : (function () { try { return localStorage.getItem('shared-link-device-name') || ''; } catch (_) { return ''; } })();
      nameVal.textContent = n || 'Device';
      nameLink.setAttribute('aria-label', 'Device name ' + (n || 'Device') + '. Change in Settings');
    }
    window.addEventListener('hub-device-name', paintName);   // H46: Settings › Devices (H29.2b; was About) saved a new name
    window.addEventListener('storage', (e) => {               // H46: another tab, or Settings opened on its own
      if (e.key !== 'shared-link-device-name' && e.key !== null) return;
      paintName();
      // tell the link too (Settings on its own has no SharedLink); same value → no new storage event
      if (e.key && window.SharedLink && window.SharedLinkDevices) { try { SharedLinkDevices.setName(e.newValue || ''); } catch (_) { /* link not ready */ } }
    });
    if (window.SharedLink) SharedLink.on('devices', () => setTimeout(paintName, 0));
    window.addEventListener('hub-ctrl-link', () => setTimeout(paintHub, 0));
    if (window.SharedLink) ['status', 'open'].forEach((ev) => SharedLink.on(ev, () => setTimeout(paintHub, 0)));

    function join(c) {
      flash('');
      c = String(c || '').replace(/\D/g, '');
      if (!/^\d{4}$/.test(c)) { flash('Enter the 4-digit code.'); return; }
      if (c === '0000') {   // H55: 0000 = the public mesh: leave a private Hub (joined: Disconnect) and turn public on
        if (R && window.__hubRemoteApi) { try { localStorage.removeItem('sites-hub.meshPublic'); } catch (_) { /* blocked */ } window.__hubRemoteApi.disconnect(); return; }
        if (window.HubMeshLink) window.HubMeshLink.setPublic(true);
        flash(window.HubMeshLink && window.HubMeshLink.isPrivate() ? 'Public mesh 0000 is on; this Hub joins it when it leaves its private mesh.' : 'Joined the public mesh 0000 (Settings \u203A Devices).');
        return;
      }
      if (c === myCode()) {
        // H31 / H25: the same Hub while the link is down → rejoin now (the bar chip with its scan is gone)
        if (R && window.SharedLink && !SharedLink.connected && window.__hubRemoteApi) { window.__hubRemoteApi.rejoin(); flash('Reconnecting…'); return; }
        flash(R ? 'Already joined to this Hub.' : 'That is this Hub’s own code.'); return;
      }
      try { sessionStorage.setItem('hub-join-try', c); } catch (_) { /* private mode */ }
      location.replace(location.pathname + '?join=' + c);
    }
    form.addEventListener('submit', (e) => { e.preventDefault(); join(inp.value); });
    inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(0, 4); flash(''); });
    /* H59 legacy: SharedLinkScan.ask opened a second "Join a Hub" code dialog instead of the camera.
    scan.addEventListener('click', () => {
      if (!window.SharedLinkScan) { err.textContent = 'Scanner not available.'; return; }
      SharedLinkScan.ask({ title: 'Join a Hub' }).then((c) => { if (c) { inp.value = c; join(c); } });
    });
    */
    scan.addEventListener('click', (e) => {   // H59: own camera modal, the pop-up stays as it is
      e.stopPropagation();
      openCam((c) => { inp.value = c; join(c); });
    });

    /* failed join: still not connected 20 s after a typed / scanned code */
    let tried = null;
    try { tried = sessionStorage.getItem('hub-join-try'); } catch (_) { /* none */ }
    if (tried && R && R.code === tried && window.SharedLink) {
      const t = setTimeout(() => {
        try { sessionStorage.removeItem('hub-join-try'); } catch (_) { /* none */ }
        if (SharedLink.connected) return;
        flash('Hub not found — check the code');
        const N = window.HubNotify;
        if (N && N.notice) N.notice({ icon: '🎮', title: 'Hub ' + tried + ' not found', text: 'Check the code and try again.' });
      }, 20000);
      SharedLink.on('open', () => { clearTimeout(t); try { sessionStorage.removeItem('hub-join-try'); } catch (_) { /* none */ } });
    } else if (tried) { try { sessionStorage.removeItem('hub-join-try'); } catch (_) { /* none */ } }

    new MutationObserver(() => { if (!pop.hidden) { paintHub(); if (chat && !chat.hidden) closeChat(); } })
      .observe(pop, { attributes: true, attributeFilter: ['hidden'] });
    paintHub();
  }

  /* ---------- H59: camera QR scanner in its own modal (the Gamepad controller's scanner) ---------- */
  const QS = { facingMode: 'environment', idealWidth: 1280, scanWidth: 480, scanEveryMs: 120, inversionAttempts: 'attemptBoth' };   // = controller_config.js qrScanner
  const JSQR_SRC = 'hub/controller/vendor/jsQR.js';   // hub.html does not load it; the SW precaches it (H59)
  let jsqrP = null;
  function loadJsQR() {
    if (typeof window.jsQR === 'function') return Promise.resolve(true);
    if (!jsqrP) {
      jsqrP = new Promise((resolve) => {
        const sc = document.createElement('script');
        sc.src = JSQR_SRC; sc.async = true;
        sc.onload = () => resolve(typeof window.jsQR === 'function');
        sc.onerror = () => { jsqrP = null; sc.remove(); resolve(false); };
        document.head.appendChild(sc);
      });
    }
    return jsqrP;
  }
  /** Code out of a scanned text: a Gamepad QR (#code=1234), a Connect QR (?join=1234) or a bare code. */
  function codeFromScan(text) {
    const t = String(text || '').trim();
    let c = '';
    if (/^\d{4}$/.test(t)) c = t;
    else {
      try {
        const u = new URL(t);
        const hp = new URLSearchParams(u.hash.replace(/^#/, ''));
        c = hp.get('code') || u.searchParams.get('join') || u.searchParams.get('code') || u.searchParams.get('hub') || '';
      } catch (_) { c = window.SharedLinkScan ? SharedLinkScan.parse(t) : ''; }
    }
    c = String(c).replace(/\D/g, '');
    return /^\d{4}$/.test(c) ? c : '';
  }
  let cam = null;   // the open modal (one at a time)
  function openCam(onCode) {
    if (cam) return;
    const st = { stream: null, timer: 0, live: true };
    const back = el('div', 'hp-cam'); back.id = 'hp-cam';
    back.setAttribute('role', 'dialog'); back.setAttribute('aria-modal', 'true'); back.setAttribute('aria-label', 'Scan a QR code');
    const card = el('div', 'hp-cam-card');
    const view = el('div', 'hp-cam-view');
    const video = el('video'); video.muted = true; video.playsInline = true; video.setAttribute('playsinline', ''); video.autoplay = true;
    view.appendChild(video);
    const msg = el('div', 'hp-cam-msg', 'Starting camera…'); msg.setAttribute('role', 'status');
    const cancel = el('button', 'hp-btn hp-cam-cancel', 'Cancel'); cancel.type = 'button';
    card.append(view, msg, cancel);
    back.appendChild(card);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    function setMsg(t, bad) { msg.textContent = t || ''; msg.classList.toggle('bad', !!bad); }
    function stop() {
      st.live = false;
      clearTimeout(st.timer);
      if (st.stream) st.stream.getTracks().forEach((t) => { try { t.stop(); } catch (_) { /* gone */ } });
      st.stream = null;
      try { video.pause(); } catch (_) { /* ignore */ }
      video.srcObject = null;
    }
    function close() {
      if (!cam) return;
      stop();
      window.removeEventListener('keydown', onKey, true);
      back.remove();
      cam = null;
      scanFocus();
    }
    function onKey(e) {
      if (e.key !== 'Escape') return;
      e.preventDefault(); e.stopImmediatePropagation();   // Esc closes the camera only, not the pop-up under it
      close();
    }
    function frame() {
      if (!st.live) return;
      const vw = video.videoWidth, vh = video.videoHeight;
      if (video.readyState >= 2 && vw && vh) {
        const w = Math.min(QS.scanWidth, vw), h = Math.round(vh * w / vw);
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
        ctx.drawImage(video, 0, 0, w, h);
        const r = window.jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: QS.inversionAttempts });
        if (r) {
          const c = codeFromScan(r.data);
          if (c) { close(); onCode(c); return; }
          setMsg('That QR is not a Hub code', true);
        }
      }
      st.timer = setTimeout(frame, QS.scanEveryMs);
    }
    // keep clicks inside the modal from reaching the Hub (outside-click closers)
    back.addEventListener('pointerdown', (e) => e.stopPropagation());
    back.addEventListener('click', (e) => { e.stopPropagation(); if (e.target === back) close(); });
    cancel.addEventListener('click', close);
    window.addEventListener('keydown', onKey, true);
    document.body.appendChild(back);
    cam = { close: close, state: st, el: back };
    window.__hubScanCam = cam;   // tests / debugging
    setTimeout(() => { if (cam) cancel.focus(); }, 0);

    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { setMsg('Camera needs a secure (https) page', true); return; }
    loadJsQR().then((ok) => {
      if (!st.live) return;
      if (!ok) { setMsg('QR reader missing — type the code', true); return; }
      return navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: QS.facingMode }, width: { ideal: QS.idealWidth } }, audio: false })
        .then((stream) => {
          if (!st.live) { stream.getTracks().forEach((t) => t.stop()); return; }   // cancelled while the prompt was open
          st.stream = stream;
          video.srcObject = stream;
          const p = video.play(); if (p && p.catch) p.catch(() => { /* autoplay covers it */ });
          setMsg('Point at the Hub QR code');
          st.timer = setTimeout(frame, QS.scanEveryMs);
        })
        .catch((e) => {
          if (!st.live) return;
          const n = e && e.name;
          if (n === 'NotAllowedError' || n === 'SecurityError') setMsg('Camera blocked — allow it or type the code', true);
          else if (n === 'NotFoundError' || n === 'OverconstrainedError' || n === 'DevicesNotFoundError') setMsg('No camera found — type the code', true);
          else setMsg('Camera error — type the code', true);
        });
    });
  }
  function scanFocus() { const b = pop && pop.querySelector('.hp-scan'); if (b && !pop.hidden) { try { b.focus(); } catch (_) { /* gone */ } } }
  if (pop) new MutationObserver(() => { if (pop.hidden && cam) cam.close(); }).observe(pop, { attributes: true, attributeFilter: ['hidden'] });

  function closeChat() { const x = chat && chat.querySelector('.hp-x'); if (x) x.click(); }
  /* H27.1 one-tap switch: #ctrl-backdrop covers the bar, so a tap on 🐻 used to only close Devices. */
  const backdrop = document.getElementById('ctrl-backdrop');
  const chatBtn = document.getElementById('chat-btn');
  if (backdrop && chatBtn) {
    backdrop.addEventListener('click', (e) => {
      const under = document.elementsFromPoint ? document.elementsFromPoint(e.clientX, e.clientY) : [];
      if (under.some((n) => n !== backdrop && chatBtn.contains(n))) setTimeout(() => { if (chat && chat.hidden) chatBtn.click(); }, 0);
    });
  }
  if (chat) {
    new MutationObserver(() => {
      if (!chat.hidden && pop && !pop.hidden && window.__hubController && window.__hubController.closePopover) window.__hubController.closePopover();
    }).observe(chat, { attributes: true, attributeFilter: ['hidden'] });
  }
})();
