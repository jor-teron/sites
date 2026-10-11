/**
 * Hub — SharedLink glue (shared/link). Loaded after hub-controller.js.
 * - Routes every incoming SharedLink file by meta.app:
 *   the open app in #app-frame that registered as a receiver
 *   (iframe posts {sharedLink:'ready', app:'print', types:['image/','application/pdf']})
 *   gets {sharedLink:'file', name, type, blob, from}; otherwise the file goes to the Hub
 *   viewer + toast (hub_notify.js). Either way, when 'hub-auto-download' is on (default), it downloads.
 *   Toast "Open in…" lists apps that registered for that type before (remembered).
 * - The Hub answers {sharedLink:'ready'} with {sharedLink:'hello', code, prefix, devices} so an
 *   app can show a QR for the Hub's own code (no own peer in the Hub).
 * - Apps may send through the Hub: {sharedLink:'send', msg, to?}.
 * - Every received file is kept in IndexedDB 'hub-received' (last 30) → Received list.
 * - Popover extras: device list, this device's name, Auto-download toggle, Received list.
 */
(function () {
  'use strict';
  if (!window.SharedLink) return;

  const frame = document.getElementById('app-frame');
  const AUTO_KEY = 'hub-auto-download';
  const RECV_KEY = 'hub-link-receivers';   // { app: { url, types[] } } apps seen as receivers
  const MAX_KEEP = 30;
  let active = null;                       // { app, types } registered by the open iframe

  const autoDownload = () => { try { return localStorage.getItem(AUTO_KEY) !== '0'; } catch (_) { return true; } };
  const receivers = () => { try { return JSON.parse(localStorage.getItem(RECV_KEY) || '{}') || {}; } catch (_) { return {}; } };

  function typeOk(types, type) {
    if (!Array.isArray(types) || !types.length) return true;
    return types.some((t) => String(type || '').indexOf(t) === 0);
  }

  /* ---------- IndexedDB 'Received' store ---------- */
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('hub-received', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('files', { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then((d) => new Promise((res, rej) => {
      const t = d.transaction('files', mode);
      const out = fn(t.objectStore('files'));
      t.oncomplete = () => res(out && out.result);
      t.onerror = () => rej(t.error);
    }));
  }
  function keep(f) {
    return tx('readwrite', (s) => s.put({ id: Date.now() + '-' + f.id, name: f.name, type: f.type, size: f.size, blob: f.blob, app: f.app, ts: Date.now() }))
      .then(() => tx('readonly', (s) => s.getAllKeys()))
      .then((keys) => { keys = (keys || []).sort(); const old = keys.slice(0, Math.max(0, keys.length - MAX_KEEP)); if (old.length) return tx('readwrite', (s) => old.forEach((k) => s.delete(k))); })
      .then(paintReceived).catch(() => { /* no IndexedDB */ });
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function post(m) { try { if (frame && frame.contentWindow) frame.contentWindow.postMessage(m, '*'); } catch (_) { /* gone */ } }

  function appOf(f) { return String(f.app || '').replace(/^.*\/([^/]+)\/?$/, '$1').toLowerCase(); }

  /* ---------- routing ---------- */
  const N = () => window.HubNotify;

  SharedLink.on('progress', (p) => {
    if (p.out || (active && appOf(p) && appOf(p) === active.app)) return;   // the app shows its own bar
    if (N()) { N().start('sl-' + p.id, { name: p.name, size: p.size }); N().progress('sl-' + p.id, p.done); }
  });

  SharedLink.on('file', (f) => {
    keep(f);
    const app = appOf(f);
    if (active && app && active.app === app && typeOk(active.types, f.type)) {
      post({ sharedLink: 'file', name: f.name, type: f.type, blob: f.blob, from: f.from });
      if (autoDownload()) download(f.blob, f.name);   // release 3: also for files that go into an app
      return;
    }
    if (autoDownload()) download(f.blob, f.name);
    const url = URL.createObjectURL(f.blob);
    if (N()) N().done('sl-' + f.id, { url: url, blob: f.blob, name: f.name, type: f.type, size: f.size });
    else if (window.HubViewer) HubViewer.open(url, f.name, f.type);
    offerOpenIn(f);
  });

  /* "Open in…": a small toast listing known receiver apps for this type. */
  function offerOpenIn(f) {
    const list = Object.keys(receivers()).filter((k) => typeOk(receivers()[k].types, f.type));
    if (!list.length) return;
    const box = document.createElement('div');
    box.className = 'sl-openin';
    box.textContent = 'Open in… ';
    list.forEach((k) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = k;
      b.addEventListener('click', () => {
        box.remove();
        pending = { app: k, file: f };
        if (typeof window.__hubOpenUrl === 'function') window.__hubOpenUrl(receivers()[k].url);
        else if (frame) frame.src = receivers()[k].url;
      });
      box.appendChild(b);
    });
    const x = document.createElement('button');
    x.type = 'button'; x.textContent = '×';
    x.addEventListener('click', () => box.remove());
    box.appendChild(x);
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 15000);
  }
  let pending = null;   // file waiting for its app to load

  /* ---------- iframe contract ---------- */
  window.addEventListener('message', (e) => {
    if (!frame || e.source !== frame.contentWindow) return;
    const d = e.data;
    if (!d || typeof d !== 'object' || !d.sharedLink) return;
    if (d.sharedLink === 'ready') {
      const app = String(d.app || '').toLowerCase();
      active = { app: app, types: Array.isArray(d.types) ? d.types : [] };
      const r = receivers();
      let url = '';
      try { url = new URL(frame.src, location.href).pathname.replace(location.pathname.replace(/[^/]*$/, ''), ''); } catch (_) { /* ignore */ }
      r[app] = { url: url || r[app] && r[app].url || '', types: active.types };
      try { localStorage.setItem(RECV_KEY, JSON.stringify(r)); } catch (_) { /* full */ }
      post({ sharedLink: 'hello', code: SharedLink.code, prefix: 'jtsites-', devices: SharedLink.devices });
      if (pending && pending.app === app) {
        const f = pending.file; pending = null;
        post({ sharedLink: 'file', name: f.name, type: f.type, blob: f.blob, from: f.from });
      }
    } else if (d.sharedLink === 'send' && d.msg && typeof d.msg === 'object') {
      SharedLink.send(d.msg, d.to);
    }
  });
  // Another app picked: forget the receiver until the new page says ready.
  if (frame) new MutationObserver(() => { active = null; }).observe(frame, { attributes: true, attributeFilter: ['src', 'data-app'] });
  SharedLink.on('devices', (list) => post({ sharedLink: 'devices', devices: list }));
  SharedLink.on('message', (m, from) => post({ sharedLink: 'message', msg: m, from: from }));

  /* ---------- popover extras ---------- */
  let recvBox = null;
  function paintReceived() {
    if (!recvBox) return;
    tx('readonly', (s) => s.getAll()).then((rows) => {
      recvBox.textContent = '';
      (rows || []).sort((a, b) => b.ts - a.ts).forEach((r) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = r.name + ' · ' + (N() ? N().fmtSize(r.size) : r.size + ' B');
        b.addEventListener('click', () => {
          const url = URL.createObjectURL(r.blob);
          if (window.HubViewer) HubViewer.open(url, r.name, r.type); else download(r.blob, r.name);
        });
        recvBox.appendChild(b);
      });
      if (!recvBox.childNodes.length) recvBox.textContent = 'Nothing received yet';
    }).catch(() => { recvBox.textContent = 'Storage unavailable'; });
  }

  const pop = document.getElementById('ctrl-popover');
  if (pop && window.SharedLinkUI) {
    const wrap = document.createElement('div');
    wrap.className = 'sl-extra';
    const devs = document.createElement('div');
    SharedLinkUI.mountDevices(devs);
    wrap.appendChild(devs);
    SharedLinkUI.mountName(wrap);
    const row = document.createElement('label');
    row.className = 'sl-row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = autoDownload();
    cb.addEventListener('change', () => { try { localStorage.setItem(AUTO_KEY, cb.checked ? '1' : '0'); } catch (_) { /* blocked */ } });
    row.append(cb, document.createTextNode(' Auto-download received files'));
    wrap.appendChild(row);
    const det = document.createElement('details');
    const sum = document.createElement('summary');
    sum.textContent = 'Received';
    recvBox = document.createElement('div');
    recvBox.className = 'sl-received';
    det.append(sum, recvBox);
    det.addEventListener('toggle', () => { if (det.open) paintReceived(); });
    wrap.appendChild(det);
    const actions = pop.querySelector('.ctrl-actions');
    pop.insertBefore(wrap, actions || null);
  }

  window.__hubLink = { get active() { return active; }, autoDownload: autoDownload };
})();
