/*
 * Paper Scan — ps_send.js  ("📤 Send", one Hub link via shared/link)
 * - Inside the Hub: the Hub's link ({sharedLink:'ready'} then {sharedLink:'sendFile'} postMessage,
 *   hub/hub_link.js). The PDF is already on the Hub screen, so Send goes to a connected device by name.
 * - Standalone (phone): joins the Hub with the saved code ('shared-link-join-code') or asks with
 *   SharedLinkScan (code + Scan QR, vendor/jsQR.js), then sends the PDF as app:'' → Hub viewer + toast,
 *   or to another device by name.
 */
(function () {
  'use strict';
  const PS = window.PS = window.PS || {};
  const inHub = window.parent && window.parent !== window;
  let hubHello = false, hubDevices = [];

  if (inHub) {
    window.addEventListener('message', (e) => {
      const d = e.data;
      if (e.source !== window.parent || !d || typeof d !== 'object') return;
      if (d.sharedLink === 'hello') { hubHello = true; hubDevices = d.devices || []; }
      else if (d.sharedLink === 'devices') hubDevices = d.devices || [];
    });
    window.parent.postMessage({ sharedLink: 'ready', app: 'paper-scan', types: ['x-none/'] /* sender only */ }, '*');
  }

  function choose(title, items) {
    return new Promise((res) => {
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center';
      const card = document.createElement('div');
      card.style.cssText = 'background:#1d2026;color:#eee;padding:16px;border-radius:12px;display:grid;gap:8px;min-width:260px;font:16px system-ui';
      const t = document.createElement('b'); t.textContent = title; card.append(t);
      const done = (v) => { box.remove(); res(v); };
      items.concat([{ label: 'Cancel', value: null }]).forEach((it) => {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = it.label;
        b.style.cssText = 'min-height:52px;font-size:16px;border-radius:10px;border:0;cursor:pointer';
        b.addEventListener('click', () => done(it.value));
        card.append(b);
      });
      box.addEventListener('click', (e) => { if (e.target === box) done(null); });
      box.append(card); document.body.append(box);
      card.querySelector('button').focus();
    });
  }

  function waitLinked(ms) {
    return new Promise((res) => {
      if (SharedLink.connected) return res(true);
      let f, g;
      const end = (v) => { clearTimeout(t); SharedLink.off('open', f); SharedLink.off('notfound', g); res(v); };
      const t = setTimeout(() => end(false), ms);
      f = SharedLink.on('open', () => end(true));
      g = SharedLink.on('notfound', () => end(false));
    });
  }

  async function standalone(file) {
    if (!window.SharedLink) { alert('Send needs shared/link — reload the page.'); return; }
    if (!SharedLink.connected) {
      let code = '';
      try { code = localStorage.getItem('shared-link-join-code') || ''; } catch (_) { /* blocked */ }
      if (!code || !SharedLink.everConnected(code)) code = window.SharedLinkScan ? (await SharedLinkScan.ask({ title: 'Send PDF to the Hub' })) || '' : '';
      if (!code) return;
      PS.ui.status('Connecting to Hub ' + code + '…');
      if (SharedLink.role !== 'join' || SharedLink.code !== code) await SharedLink.join({ prefix: 'jtsites-', code });
      if (!(await waitLinked(15000))) { PS.ui.status('Could not reach Hub ' + code); return; }
    }
    const me = SharedLink.id;
    const others = SharedLink.devices.filter((d) => d.online && d.id !== me && d.id !== 'host');
    let to;
    if (others.length) {
      const hub = (SharedLink.devices.find((d) => d.id === 'host') || {}).name || 'Hub';
      to = await choose('Send to', [{ label: '🖥 ' + hub, value: 'host' }].concat(others.map((d) => ({ label: '📱 ' + d.name, value: d.id }))));
      if (!to) return;
    }
    await SharedLink.sendFile(file, { app: '', to: to === 'host' ? undefined : to,
      onProgress: (d, t) => PS.ui.status('Sending… ' + Math.round(100 * (t ? d / t : 1)) + '%') });
    PS.ui.status('Sent ✓ ' + file.name);
  }

  async function viaHub(file) {
    const list = hubDevices.filter((d) => d.online && !d.legacy && !d.pad);
    if (!list.length) { alert('No device is connected to the Hub. Scan the Hub QR with a phone first.'); return; }
    const to = list.length === 1 ? list[0].id : await choose('Send to', list.map((d) => ({ label: '📱 ' + d.name, value: d.id })));
    if (!to) return;
    window.parent.postMessage({ sharedLink: 'sendFile', blob: file, name: file.name, type: file.type, app: '', to }, '*');
    PS.ui.status('Sent ✓ ' + file.name);
  }

  PS.send = (file) => (inHub && hubHello ? viaHub(file) : standalone(file)).catch((err) => PS.ui.status('Send failed: ' + err.message));
})();
