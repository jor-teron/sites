/*
 * Photo Editor v2 — send (pe_send.js, release 3). "Send 📤" in the Save menu renders the CURRENT
 * edits (PE.io.save('jpeg')) and sends that image over the one Hub link (shared/link):
 * - Inside the Hub: the Hub's link. Pick a connected device by name; the Hub sends it
 *   ({sharedLink:'sendFile'} postMessage contract, hub/hub_link.js).
 * - Standalone (e.g. phone): joins the Hub with the shared saved code
 *   ('shared-link-join-code', same as Gamepad / File Drop) or asks for it, then sends to the
 *   Hub as app:''. Release 4: no saved code → SharedLinkScan dialog (code + Scan QR, vendor/jsQR.js).
 *   (Hub routes it to the open app or its viewer), or to another device by name.
 */
(function (PE) {
  'use strict';
  const inHub = window.parent && window.parent !== window;
  let hubHello = false, hubDevices = [];

  if (inHub) {
    window.addEventListener('message', (e) => {
      const d = e.data;
      if (e.source !== window.parent || !d || typeof d !== 'object') return;
      if (d.sharedLink === 'hello') { hubHello = true; hubDevices = d.devices || []; }
      else if (d.sharedLink === 'devices') hubDevices = d.devices || [];
    });
    window.parent.postMessage({ sharedLink: 'ready', app: 'photo-editor-v2', types: ['x-none/']   /* sender only: never offered in "Open in…" */ }, '*');
  }

  /* Small big-button chooser. items [{label, value}] → Promise(value | null). */
  function choose(title, items) {
    return new Promise((res) => {
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center';
      const card = document.createElement('div');
      card.style.cssText = 'background:#1d2026;color:#eee;padding:16px;border-radius:12px;display:grid;gap:8px;min-width:240px;font:16px system-ui';
      const h = document.createElement('b'); h.textContent = title; card.append(h);
      const done = (v) => { box.remove(); res(v); };
      items.concat([{ label: 'Cancel', value: null }]).forEach((it) => {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = it.label;
        b.style.cssText = 'min-height:48px;font-size:16px;border-radius:8px;border:0;cursor:pointer';
        b.addEventListener('click', () => done(it.value));
        card.append(b);
      });
      box.addEventListener('click', (e) => { if (e.target === box) done(null); });
      box.append(card); document.body.append(box);
    });
  }

  function fileName() {
    const n = (PE.state && PE.state.photo && PE.state.photo.name) || 'photo';
    return n.replace(/\.[^.]+$/, '') + '-edited.jpg';
  }

  function waitLinked(ms) {
    return new Promise((res) => {
      if (SharedLink.connected) return res(true);
      const end = (v) => { clearTimeout(t); SharedLink.off('open', f); SharedLink.off('notfound', g); res(v); };
      const t = setTimeout(() => end(false), ms);
      const f = SharedLink.on('open', () => end(true));
      const g = SharedLink.on('notfound', () => end(false));   // banner with Retry is shown by link_core
    });
  }

  async function sendStandalone(file) {
    if (!window.SharedLink) { alert('Send needs shared/link.'); return; }
    if (!SharedLink.connected) {
      let code = '';
      try { code = localStorage.getItem('shared-link-join-code') || ''; } catch (_) { /* blocked */ }
      if (!code || !SharedLink.everConnected(code)) code = window.SharedLinkScan ? (await SharedLinkScan.ask({ title: 'Send to the Hub' })) || '' : '';   // release 4: code entry + Scan QR
      if (!code) return;
      if (SharedLink.role !== 'join' || SharedLink.code !== code) await SharedLink.join({ prefix: 'jtsites-', code: code });
      if (!(await waitLinked(15000))) { if (SharedLink.status.indexOf('not found') < 0) alert('Could not reach Hub ' + code + '.'); return; }
    }
    const me = SharedLink.id;
    const others = SharedLink.devices.filter((d) => d.online && d.id !== me && d.id !== 'host');
    let to;
    if (others.length) {
      const hub = (SharedLink.devices.find((d) => d.id === 'host') || {}).name || 'Hub';
      to = await choose('Send to', [{ label: '🖥 ' + hub, value: 'host' }].concat(others.map((d) => ({ label: '📱 ' + d.name, value: d.id }))));
      if (!to) return;
    }
    await SharedLink.sendFile(file, { app: '', to: to === 'host' ? undefined : to });
    alert('Sent ✓');
  }

  async function sendInHub(file) {
    const list = hubDevices.filter((d) => d.online && !d.legacy);
    if (!list.length) { alert('No device is connected to the Hub. Scan the Hub QR with a phone first.'); return; }
    const to = list.length === 1 ? list[0].id : await choose('Send to', list.map((d) => ({ label: '📱 ' + d.name, value: d.id })));
    if (!to) return;
    window.parent.postMessage({ sharedLink: 'sendFile', blob: file, name: file.name, type: file.type, app: '', to: to }, '*');
  }

  PE.send = () => PE.io.save('jpeg', (blob) => {
    const file = new File([blob], fileName(), { type: 'image/jpeg' });
    (inHub && hubHello ? sendInHub(file) : sendStandalone(file)).catch((err) => alert('Send failed: ' + err.message));
  });
})(window.PE);
