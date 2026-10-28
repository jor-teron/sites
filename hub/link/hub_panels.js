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
 *   Devices    : SharedLinkUI.mountDevices list (styled as roomy rows).
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

    const body = el('div', 'hp-body');
    /* This Hub */
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
    /* H46: plain 'Name: X ›' → Settings › About › Device name (H29.2b: Settings › Devices › Device name) */
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
    body.append(s1, s3, s2);
    if (extra) extra.remove();
    pop.appendChild(body);
    if (head) pop.insertBefore(head, pop.firstChild);

    function paintHub() {
      const c = myCode();
      codeEl.textContent = c || '——';
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
      err.textContent = '';
      c = String(c || '').replace(/\D/g, '');
      if (!/^\d{4}$/.test(c)) { err.textContent = 'Enter the 4-digit code.'; return; }
      if (c === myCode()) {
        // H31 / H25: the same Hub while the link is down → rejoin now (the bar chip with its scan is gone)
        if (R && window.SharedLink && !SharedLink.connected && window.__hubRemoteApi) { window.__hubRemoteApi.rejoin(); err.textContent = 'Reconnecting…'; return; }
        err.textContent = R ? 'Already joined to this Hub.' : 'That is this Hub’s own code.'; return;
      }
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
