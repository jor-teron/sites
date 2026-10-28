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
 * - Apps may send through the Hub: {sharedLink:'send', msg, to?} and (release 3)
 *   {sharedLink:'sendFile', blob, name, type, app, to} (file to a device).
 * - Every received file is kept in IndexedDB 'hub-received' (last 30); no Received UI in the
 *   Gamepad popover (icon shows name + devices only). Auto-download stays on by default.
 * - 'phonekey…' messages (Google sign-in from a phone, hub_phonekey.js) are never forwarded.
 * - H29.1: neither are 'hubsync…' messages (Send profile, hub_sync.js).
 * - Popover extras: this device's name (edit) and the connected devices list.
 * - Desktop mode (wm_windows.js): every window may register as a receiver; files and
 *   "Open in…" go to the FOCUSED window (window.__hubAppFrame()); "Open in…" opens / focuses
 *   the receiver app's window (hub.js __hubOpenUrl). Device / message updates reach all
 *   registered apps.
 * - R57: only same-origin app frames are served. A message counts only when it comes from one of
 *   the Hub's own frames (frameOf) AND from the Hub's origin; replies are posted to location.origin,
 *   so a frame that navigated to another site gets nothing (not even 'hello' with the link code).
 *   file://: every file page has the opaque origin 'null' and postMessage cannot target 'null', so
 *   there the frameOf check is what counts and replies use '*' (to our own frames only).
 */
(function () {
  'use strict';
  if (!window.SharedLink) return;

  const hubFrame = document.getElementById('app-frame');
  /** Target iframe: focused window (Desktop mode) or the Hub frame. */
  const curFrame = () => (window.__hubAppFrame ? window.__hubAppFrame() : hubFrame);
  const allFrames = () => (window.__hubAppFrames ? window.__hubAppFrames() : [hubFrame].filter(Boolean));
  const frameOf = (src) => allFrames().find((f) => f.contentWindow === src) || null;
  /** Receiver registered by the target frame ({ app, types } on the iframe element). */
  const activeReg = () => { const f = curFrame(); return (f && f.__slReg) || null; };
  const AUTO_KEY = 'hub-auto-download';
  const RECV_KEY = 'hub-link-receivers';   // { app: { url, types[] } } apps seen as receivers
  const MAX_KEEP = 30;

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
      .catch(() => { /* no IndexedDB */ });
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  const IS_FILE = location.protocol === 'file:';
  /** R57: the sender is a page of the Hub's own origin ('null' for every file:// page). */
  const sameOrigin = (e) => e.origin === location.origin || (IS_FILE && e.origin === 'null');
  const TARGET = IS_FILE ? '*' : location.origin;   // R57: was '*' everywhere
  function postTo(f, m) { try { if (f && f.contentWindow) f.contentWindow.postMessage(m, TARGET); } catch (_) { /* gone */ } }
  function post(m) { postTo(curFrame(), m); }
  function postAll(m) { allFrames().forEach((f) => { if (f.__slReg) postTo(f, m); }); }

  function appOf(f) { return String(f.app || '').replace(/^.*\/([^/]+)\/?$/, '$1').toLowerCase(); }

  /* ---------- routing ---------- */
  const N = () => window.HubNotify;

  SharedLink.on('progress', (p) => {
    const active = activeReg();
    if (p.out || (active && appOf(p) && appOf(p) === active.app)) return;   // the app shows its own bar
    if (N()) { N().start('sl-' + p.id, { name: p.name, size: p.size }); N().progress('sl-' + p.id, p.done); }
  });

  SharedLink.on('file', (f) => {
    keep(f);
    const app = appOf(f);
    const active = activeReg();
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
        else if (hubFrame) hubFrame.src = receivers()[k].url;
        // Desktop mode: that app's window may already be open (and registered): deliver now
        setTimeout(() => {
          const a = activeReg();
          if (pending && a && a.app === pending.app) {
            const pf = pending.file; pending = null;
            post({ sharedLink: 'file', name: pf.name, type: pf.type, blob: pf.blob, from: pf.from });
          }
        }, 300);
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
    const frame = frameOf(e.source);
    if (!frame || !sameOrigin(e)) return;   // R57: our own frame AND our origin
    const d = e.data;
    if (!d || typeof d !== 'object' || !d.sharedLink) return;
    const post = (m) => postTo(frame, m);   // answers go back to the app that asked
    if (d.sharedLink === 'ready') {
      const app = String(d.app || '').toLowerCase();
      const active = frame.__slReg = { app: app, types: Array.isArray(d.types) ? d.types : [] };
      const r = receivers();
      let url = '';
      try { url = new URL(frame === hubFrame ? frame.src : frame.contentWindow.location.href, location.href).pathname.replace(location.pathname.replace(/[^/]*$/, ''), ''); } catch (_) { /* ignore */ }
      r[app] = { url: url || r[app] && r[app].url || '', types: active.types };
      try { localStorage.setItem(RECV_KEY, JSON.stringify(r)); } catch (_) { /* full */ }
      post({ sharedLink: 'hello', code: SharedLink.code, prefix: 'jtsites-', devices: SharedLink.devices });
      if (pending && pending.app === app) {
        const f = pending.file; pending = null;
        post({ sharedLink: 'file', name: f.name, type: f.type, blob: f.blob, from: f.from });
      }
    } else if (d.sharedLink === 'sendFile' && d.blob) {
      // Release 3: an app in the Hub sends a file to a device through the Hub's link.
      const file = new File([d.blob], String(d.name || 'file'), { type: d.type || d.blob.type || '' });
      SharedLink.sendFile(file, { app: String(d.app || ''), to: d.to || undefined }).catch((err) => console.warn('Hub sendFile', err));
    } else if (d.sharedLink === 'send' && d.msg && typeof d.msg === 'object') {
      SharedLink.send(d.msg, d.to);
    }
  });
  // Another app picked: forget the receiver until the new page says ready.
  if (hubFrame) new MutationObserver(() => { hubFrame.__slReg = null; }).observe(hubFrame, { attributes: true, attributeFilter: ['src', 'data-app'] });
  SharedLink.on('devices', (list) => postAll({ sharedLink: 'devices', devices: list }));
  // (phone-as-a-key sign-in messages carry a Google token: hub_phonekey.js only, never to app frames)
  // SharedLink.on('message', (m, from) => { if (m && /^phonekey/.test(m.type || '')) return; postAll({ sharedLink: 'message', msg: m, from: from }); });   // (before H29.1)
  // H29.1: 'hubsync…' messages (a whole Hub profile) stay in the Hub too (hub_sync.js only)
  SharedLink.on('message', (m, from) => { if (m && /^(phonekey|hubsync)/.test(m.type || '')) return; postAll({ sharedLink: 'message', msg: m, from: from }); });

  /* ---------- popover extras (name + devices only) ---------- */
  const pop = document.getElementById('ctrl-popover');
  if (pop && window.SharedLinkUI) {
    const wrap = document.createElement('div');
    wrap.className = 'sl-extra';
    SharedLinkUI.mountName(wrap);
    const devs = document.createElement('div');
    SharedLinkUI.mountDevices(devs);
    wrap.appendChild(devs);
    pop.appendChild(wrap);
  }

  window.__hubLink = { get active() { return activeReg(); }, autoDownload: autoDownload };
})();
