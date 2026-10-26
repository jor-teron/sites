/*
 * Hub — H27 side panels. Loaded after hub-controller.js, hub_link.js, hub_linkstate.js,
 * hub_remote.js and hub_chat.js. Re-arranges the 🎮 Devices popover (#ctrl-popover) into a
 * full-height side panel with sections, adds "Join with code", and keeps only one panel
 * (Devices or 🐻 Chat) open at a time. Look: hub_panels.css.
 *   This Hub   : editable device name (SharedLinkUI.mountName), code + Connect QR, New code /
 *                Disconnect row (hub_linkstate.js).
 *   Devices    : SharedLinkUI.mountDevices list (styled as roomy rows).
 *   Join       : 4-digit box + Join + 📷 (SharedLinkScan.ask) → location ?join=CODE (as
 *                hub_remote.js). Own code is rejected. A join that has not connected after
 *                20 s shows "Hub not found — check the code" (sessionStorage 'hub-join-try').
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
  function connectUrl(c) { const u = new URL(location.href); u.search = '?join=' + c; u.hash = ''; return u.href; }

  if (pop) {
    const head = pop.querySelector('.ctrl-pop-head');
    const close = document.getElementById('ctrl-close');
    if (close) close.textContent = '✕';
    const extra = pop.querySelector('.sl-extra');
    const nameBox = extra && extra.querySelector('.sl-name');
    const devs = extra && extra.querySelector('.sl-devices');
    const lsRow = pop.querySelector('.ls-row');
    if (nameBox && nameBox.firstChild && nameBox.firstChild.nodeType === 3) nameBox.firstChild.textContent = 'This device name';

    const body = el('div', 'hp-body');
    /* This Hub */
    const s1 = el('section', 'hp-sec'); s1.appendChild(el('h3', '', R ? 'This device' : 'This Hub'));
    const c1 = el('div', 'hp-card');
    if (nameBox) c1.appendChild(nameBox);
    const hub = el('div', 'hp-hub');
    const qr = el('div', 'hp-qr'); qr.title = 'Scan with a phone to connect';
    const info = el('div', 'hp-hubinfo');
    const codeLbl = el('div', 'hp-codelbl', R ? 'Joined Hub code' : 'Hub code · scan the QR or type it on a device');
    const codeEl = el('div', 'hp-code', '——');
    info.append(codeLbl, codeEl);
    if (lsRow) info.appendChild(lsRow);
    hub.append(qr, info);
    c1.appendChild(hub);
    s1.appendChild(c1);
    /* Devices */
    const s2 = el('section', 'hp-sec'); s2.appendChild(el('h3', '', 'Connected devices'));
    if (devs) s2.appendChild(devs); else s2.appendChild(el('div', 'hp-hint', 'Device list unavailable'));
    /* Join */
    const s3 = el('section', 'hp-sec'); s3.appendChild(el('h3', '', 'Join with code'));
    const form = el('form', 'hp-card hp-join'); form.autocomplete = 'off';
    const inp = el('input'); inp.type = 'text'; inp.inputMode = 'numeric'; inp.maxLength = 4; inp.placeholder = '0000'; inp.setAttribute('aria-label', 'Hub code');
    const go = el('button', 'hp-go', 'Join'); go.type = 'submit';
    const scan = el('button', 'hp-btn hp-scan', '📷'); scan.type = 'button'; scan.title = 'Scan a QR code'; scan.setAttribute('aria-label', 'Scan a QR code');
    const err = el('div', 'hp-err'); err.setAttribute('role', 'status');
    form.append(inp, go, scan, err);
    s3.append(form, el('div', 'hp-hint', 'Type the 4-digit code shown on the other Hub, or scan its QR code.'));
    body.append(s1, s2, s3);
    if (extra) extra.remove();
    pop.appendChild(body);
    if (head) pop.insertBefore(head, pop.firstChild);

    function paintHub() {
      const c = myCode();
      codeEl.textContent = c || '——';
      qr.textContent = '';
      if (!c || typeof qrcode === 'undefined') { qr.hidden = !c; return; }
      qr.hidden = false;
      try { const q = qrcode(0, 'M'); q.addData(connectUrl(c)); q.make(); qr.innerHTML = q.createSvgTag(4, 8); } catch (_) { qr.hidden = true; }
    }
    window.addEventListener('hub-ctrl-link', () => setTimeout(paintHub, 0));
    if (window.SharedLink) ['status', 'open'].forEach((ev) => SharedLink.on(ev, () => setTimeout(paintHub, 0)));

    function join(c) {
      err.textContent = '';
      c = String(c || '').replace(/\D/g, '');
      if (!/^\d{4}$/.test(c)) { err.textContent = 'Enter the 4-digit code.'; return; }
      if (c === myCode()) { err.textContent = R ? 'Already joined to this Hub.' : 'That is this Hub’s own code.'; return; }
      try { sessionStorage.setItem('hub-join-try', c); } catch (_) { /* private mode */ }
      location.replace(location.pathname + '?join=' + c);
    }
    form.addEventListener('submit', (e) => { e.preventDefault(); join(inp.value); });
    inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(0, 4); err.textContent = ''; });
    scan.addEventListener('click', () => {
      if (!window.SharedLinkScan) { err.textContent = 'Scanner not available.'; return; }
      SharedLinkScan.ask({ title: 'Join a Hub' }).then((c) => { if (c) { inp.value = c; join(c); } });
    });

    /* failed join: still not connected 20 s after a typed / scanned code */
    let tried = null;
    try { tried = sessionStorage.getItem('hub-join-try'); } catch (_) { /* none */ }
    if (tried && R && R.code === tried && window.SharedLink) {
      const t = setTimeout(() => {
        try { sessionStorage.removeItem('hub-join-try'); } catch (_) { /* none */ }
        if (SharedLink.connected) return;
        err.textContent = 'Hub not found — check the code';
        const N = window.HubNotify;
        if (N && N.notice) N.notice({ icon: '🎮', title: 'Hub ' + tried + ' not found', text: 'Check the code and try again.' });
      }, 20000);
      SharedLink.on('open', () => { clearTimeout(t); try { sessionStorage.removeItem('hub-join-try'); } catch (_) { /* none */ } });
    } else if (tried) { try { sessionStorage.removeItem('hub-join-try'); } catch (_) { /* none */ } }

    new MutationObserver(() => { if (!pop.hidden) { paintHub(); if (chat && !chat.hidden) closeChat(); } })
      .observe(pop, { attributes: true, attributeFilter: ['hidden'] });
    paintHub();
  }

  function closeChat() { const x = chat && chat.querySelector('.hp-x'); if (x) x.click(); }
  if (chat) {
    new MutationObserver(() => {
      if (!chat.hidden && pop && !pop.hidden && window.__hubController && window.__hubController.closePopover) window.__hubController.closePopover();
    }).observe(chat, { attributes: true, attributeFilter: ['hidden'] });
  }
})();
