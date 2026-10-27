/*
 * Hub profile (hub/core/hub_profile.js, H30.1) — keeps the Hub's own settings in the folder the user
 * connected in Files / Disk ("Add folder": the File System Access handle that shared/fs/fs_drives.js
 * remembers in IndexedDB 'sites-fs' / 'drives'; in the Terminal it is /drive/<folder name>/).
 * The folder name is whatever the user picked (their own folder or a host folder), nothing fixed.
 *
 * File: <connected folder>/hub/hub-profile/hub.json, plain readable JSON:
 *   { version: 1, savedAt: '2026-10-27T13:30:00.000Z', device: { name, browser, mode }, hub: { theme: 'dark', ... } }
 *   hub = every localStorage 'sites-hub.*' setting (theme, accent, wallpaper, Start pins = favorites, window
 *   settings, notification timeout, ...) without the 'sites-hub.' prefix. JSON values (favorites) are stored
 *   as JSON so the file stays readable.
 * Never in the file: sites-hub.keys (API keys, H28), sites-hub.google (sign-in tokens), phonekeyRooms,
 *   caches / per-session state (startList, lastRefresh, wmSession, lastApp, updTried, fromCat, fromLab),
 *   this module's own keys (profile*), any name that looks like a key / token / secret, and any value that
 *   looks like an API key or token. The same filter runs again when a file is loaded.
 * Which folder: localStorage 'sites-hub.profileDrive' (drive id, chosen in Settings → About → Profile folder)
 *   or else the first folder that was added. No folder connected → nothing happens.
 * Saving: about 3 s after a Hub setting changes (debounced; changes in this page via localStorage.setItem
 *   and in Settings / other tabs via the 'storage' event), and on pagehide (best effort). Unchanged
 *   settings are not written again.
 * Loading: on Hub start, when a folder is connected and access is granted, hub.json is read; when it
 *   is newer than this browser's settings ('sites-hub.profileAt' = last local change) it is applied and the
 *   Hub reloads quietly, once. When the browser wants a click first (permission 'prompt') a notification
 *   card asks 'Continue with your saved Hub?' with a Continue button. A newly added folder is picked up
 *   at once (BroadcastChannel 'sites-fs').
 * H30.2 System apps: each System app (apps/system/*) with settings of its own gets
 *   <connected folder>/hub/hub-profile/system/<app>.json = { version: 1, app, savedAt, settings: { '<localStorage key>': value } }
 *   files    'sites-files.*' (view, sort, dir)        viewer   'sites-viewer.speed'
 *   terminal 'hub-terminal.theme'
 *   (The Settings app's own choices are the 'sites-hub.*' keys in hub.json. Not saved: Terminal history / cwd / mounts,
 *   video resume points, DevBench run history; those are per-device state, not settings.) Apps write localStorage
 *   as before; HubProfile watches those keys (same debounce), writes only the files that changed and loads them
 *   back together with hub.json (only keys that belong to that app are accepted; key-like values never).
 *   More apps: HubProfile.registerApp(name, { keys: [...], prefixes: [...] }).
 * H30.3 Keys + export:
 *   'Include keys in profile' (Settings → About → Profile folder; localStorage 'sites-hub.profileKeys' = '1', off by
 *   default): when on, hub.json also holds "keys": { name: value } (the API keys of sites-hub.keys, H28), saved
 *   on change like the rest. A hub.json / export file that has "keys" brings them in on load (merged: the file's
 *   names win, other local keys stay) and turns the switch on here too. Off = keys never leave this browser.
 *   exportData() → one object { version: 1, kind: 'hub-profile', savedAt, device, hub, system: { app: settings },
 *   keys? } for a single .json file (devices without a folder); importData(obj) applies such a file (or a
 *   plain hub.json), then the Hub reloads.
 * API window.HubProfile:
 *   save({ ask, force })  → Promise<{ ok, reason? }>   ask: may ask the browser for access (call from a click)
 *   load({ ask, force })  → Promise<{ ok, applied, reason? }>   force: apply even when not newer (Load now)
 *   status()              → Promise<{ state, folder, driveId, folders, path, lastSave, lastLoad, localAt, error }>
 *                           state: 'none' | 'prompt' | 'denied' | 'ready' | 'unsupported'
 *   setFolder(id)         pick which connected folder holds the profile
 *   onChange(fn)          fn(status) after a save / load / state change; returns an unsubscribe function
 *   collect()             the settings object that would be written (for tests / Settings)
 */
(function () {
  'use strict';
  const P = 'sites-hub.';
  const DIRS = ['hub', 'hub-profile'], FILE = 'hub.json';
  const K_AT = P + 'profileAt', K_SAVED = P + 'profileSaved', K_LOADED = P + 'profileLoaded', K_DRIVE = P + 'profileDrive';
  const RELOAD_GUARD = 'sites-hub.profileReload';   // sessionStorage: the savedAt we already reloaded for
  const DEBOUNCE = 3000, MAX_VALUE = 200000;
  const EXCLUDE = new Set(['keys', 'google', 'phonekeyRooms', 'startList', 'lastRefresh', 'wmSession', 'lastApp',
    'updTried', 'fromCat', 'fromLab', 'profileAt', 'profileSaved', 'profileLoaded', 'profileDrive', 'profileKeys']);
  const K_KEYS = P + 'profileKeys', K_STORE = P + 'keys';   // H30.3
  const KEY_NAME = /key|token|secret|passw|auth|cred|cookie/i;
  const KEY_VALUE = /(sk-[A-Za-z0-9_-]{8,}|sk_(live|test)_|gsk_[A-Za-z0-9]{8,}|xai-[A-Za-z0-9]{8,}|AIza[0-9A-Za-z_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_|tvly-[A-Za-z0-9]{8,}|hf_[A-Za-z0-9]{20,}|ya29\.|Bearer\s|-----BEGIN)/;
  const OPAQUE = /^[A-Za-z0-9_\-+=]{32,}$/;   // one long token-looking word
  /* H30.2: System apps → hub/hub-profile/system/<app>.json */
  const APPS = {
    files: { keys: [], prefixes: ['sites-files.'] },
    viewer: { keys: ['sites-viewer.speed'], prefixes: [] },
    terminal: { keys: ['hub-terminal.theme'], prefixes: [] },
  };
  function appOf(k) {
    if (!k || k.indexOf(P) === 0) return '';
    for (const a in APPS) {
      const d = APPS[a];
      if (d.keys.indexOf(k) >= 0 || d.prefixes.some((x) => k.indexOf(x) === 0)) return a;
    }
    return '';
  }

  const ls = (() => { try { return window.localStorage; } catch (_) { return null; } })();
  const proto = window.Storage && Storage.prototype;
  const rawSet = proto ? proto.setItem : null, rawRemove = proto ? proto.removeItem : null;
  const lget = (k) => { try { return ls ? ls.getItem(k) : null; } catch (_) { return null; } };
  const lset = (k, v) => { try { rawSet.call(ls, k, String(v)); } catch (_) { /* full / blocked */ } };
  const ldel = (k) => { try { rawRemove.call(ls, k); } catch (_) { /* blocked */ } };

  /** true when a 'sites-hub.<name>' setting may go into the profile */
  function allowedName(name) { return !!name && !EXCLUDE.has(name) && !KEY_NAME.test(name); }
  function keyLike(v) {
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    return KEY_VALUE.test(s) || OPAQUE.test(s.trim());
  }
  function allowed(name, v) {
    if (!allowedName(name) || v == null) return false;
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    return s.length <= MAX_VALUE && !keyLike(s);
  }

  /** this browser's Hub settings → { name: value } (sorted, filtered; JSON objects / arrays parsed) */
  function collect() {
    const out = {};
    if (!ls) return out;
    const names = [];
    for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && k.indexOf(P) === 0) names.push(k.slice(P.length)); }
    names.sort().forEach((n) => {
      const v = lget(P + n);
      if (!allowed(n, v)) return;
      let val = v;
      if (/^\s*[[{]/.test(v)) { try { val = JSON.parse(v); } catch (_) { val = v; } }
      out[n] = val;
    });
    return out;
  }
  /** one System app's settings → { '<localStorage key>': value } (filtered like hub.json) */
  function collectApp(app) {
    const out = {};
    if (!ls || !APPS[app]) return out;
    const names = [];
    for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && appOf(k) === app) names.push(k); }
    names.sort().forEach((k) => {
      const v = lget(k);
      if (v == null || KEY_NAME.test(k) || v.length > MAX_VALUE || keyLike(v)) return;
      let val = v;
      if (/^\s*[[{]/.test(v)) { try { val = JSON.parse(v); } catch (_) { val = v; } }
      out[k] = val;
    });
    return out;
  }
  /* H30.3: API keys, only when the switch is on */
  const includeKeys = () => lget(K_KEYS) === '1';
  function readKeys() {
    try { const o = JSON.parse(lget(K_STORE) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (_) { return {}; }
  }
  /** merge a file's keys into this browser's key store (file names win) */
  function importKeys(k) {
    if (!k || typeof k !== 'object' || Array.isArray(k)) return 0;
    const cur = readKeys();
    let n = 0;
    Object.keys(k).forEach((name) => {
      if (/^[\w.-]{1,60}$/.test(name) && typeof k[name] === 'string' && k[name] && k[name].length < 4096) { cur[name] = k[name]; n++; }
    });
    if (!n) return 0;
    applying = true;
    try { lset(K_STORE, JSON.stringify(cur)); lset(K_KEYS, '1'); } finally { applying = false; }
    return n;
  }
  function deviceInfo() {
    const ua = navigator.userAgent || '';
    const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome'
      : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
    const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS'
      : /Mac OS X/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : '';
    let name = '';
    try { name = localStorage.getItem('shared-link-device-name') || ''; } catch (_) { /* blocked */ }
    const mode = window.HubMode && window.HubMode.isDesktop ? (window.HubMode.isDesktop() ? 'desktop' : 'phone') : '';
    return { name: name || [browser, os].filter(Boolean).join(' on '), browser: [browser, os].filter(Boolean).join(' / '), mode };
  }

  /* ---------- the connected folders (same IndexedDB record fs_drives.js writes) ---------- */
  let dbP = null;
  function db() {
    if (!dbP) {
      dbP = new Promise((res, rej) => {
        if (!window.indexedDB) { rej(new Error('no IndexedDB')); return; }
        const r = indexedDB.open('sites-fs', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('drives', { keyPath: 'id' });
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      dbP.catch(() => { dbP = null; });
    }
    return dbP;
  }
  function folders() {
    return db().then((d) => new Promise((res) => {
      const t = d.transaction('drives', 'readonly');
      const q = t.objectStore('drives').getAll();
      q.onsuccess = () => res((q.result || []).filter((f) => f && f.handle && f.handle.kind === 'directory')
        .sort((a, b) => (a.added || 0) - (b.added || 0)));
      q.onerror = () => res([]);
    })).catch(() => []);
  }
  async function pick() {
    const all = await folders();
    const want = lget(K_DRIVE);
    return { all, rec: all.find((f) => f.id === want) || all[0] || null };
  }
  async function perm(h, ask) {
    let p = 'granted';
    try { if (h.queryPermission) p = await h.queryPermission({ mode: 'readwrite' }); } catch (_) { p = 'prompt'; }
    if (p !== 'granted' && ask && h.requestPermission) {
      try { p = await h.requestPermission({ mode: 'readwrite' }); } catch (_) { /* no gesture */ }
    }
    return p;
  }
  async function profileDir(root, create) {
    let d = root;
    for (const n of DIRS) d = await d.getDirectoryHandle(n, { create });
    return d;
  }

  /* ---------- state + change hooks ---------- */
  const fns = [];
  let last = { state: 'none', folder: '', driveId: '', folders: [], path: '', lastSave: 0, lastLoad: 0, localAt: 0, error: '' };
  function emit() { const s = Object.assign({}, last); fns.slice().forEach((f) => { try { f(s); } catch (_) { /* ignore */ } }); }
  function setState(o) { Object.assign(last, o); emit(); }

  async function status() {
    const { all, rec } = await pick();
    const st = {
      folders: all.map((f) => ({ id: f.id, name: f.name })),
      lastSave: +lget(K_SAVED) || 0, includeKeys: includeKeys(), lastLoad: +lget(K_LOADED) || 0, localAt: +lget(K_AT) || 0,
    };
    if (!rec) Object.assign(st, { state: window.indexedDB ? 'none' : 'unsupported', folder: '', driveId: '', path: '' });
    else {
      const p = await perm(rec.handle, false);
      Object.assign(st, { state: p === 'granted' ? 'ready' : p === 'denied' ? 'denied' : 'prompt', folder: rec.name, driveId: rec.id,
        path: '/drive/' + rec.name + '/' + DIRS.join('/') + '/' + FILE });
    }
    Object.assign(last, st);
    return Object.assign({}, last);
  }

  let lastText = '';   // what this page wrote last (skip identical writes)
  const appText = {};  // H30.2: same per System app
  async function writeJson(dir, name, data) {
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(data, null, 2) + '\n');
    await w.close();
  }
  let saving = null;
  async function save(o) {
    o = o || {};
    clearTimeout(timer); timer = 0;
    if (saving) { await saving.catch(() => {}); }
    const run = (async () => {
      const { rec } = await pick();
      if (!rec) return { ok: false, reason: 'no-folder' };
      if (await perm(rec.handle, !!o.ask) !== 'granted') { await status(); emit(); return { ok: false, reason: 'permission' }; }
      const hub = collect();
      const keys = includeKeys() ? readKeys() : null;
      const body = JSON.stringify([hub, keys]);
      const apps = {};
      Object.keys(APPS).forEach((a) => {
        const set = collectApp(a), t = JSON.stringify(set);
        if (o.force ? Object.keys(set).length || appText[a] != null : t !== (appText[a] == null ? '{}' : appText[a])) apps[a] = { set, t };
      });
      if (!o.force && body === lastText && !Object.keys(apps).length) return { ok: true, reason: 'unchanged' };
      const now = Date.now();
      const savedAt = new Date(now).toISOString();
      const data = { version: 1, savedAt, device: deviceInfo(), hub };
      if (keys) data.keys = keys;   // H30.3: only with 'Include keys in profile' on
      try {
        const dir = await profileDir(rec.handle, true);
        await writeJson(dir, FILE, data);
        if (Object.keys(apps).length) {
          const sys = await dir.getDirectoryHandle('system', { create: true });
          for (const a of Object.keys(apps)) {
            await writeJson(sys, a + '.json', { version: 1, app: a, savedAt, settings: apps[a].set });
            appText[a] = apps[a].t;
          }
        }
      } catch (e) {
        setState({ error: 'Could not save: ' + (e && e.message || e) });
        return { ok: false, reason: 'error', error: String(e && e.message || e) };
      }
      lastText = body;
      lset(K_SAVED, now);
      if (!(+lget(K_AT))) lset(K_AT, now);
      await status();
      setState({ error: '' });
      return { ok: true, savedAt: data.savedAt };
    })();
    saving = run;
    try { return await run; } finally { if (saving === run) saving = null; }
  }

  async function readFile(rec) {
    try {
      const dir = await profileDir(rec.handle, false);
      const f = await (await dir.getFileHandle(FILE)).getFile();
      return JSON.parse(await f.text());
    } catch (e) {
      if (e && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError')) return null;
      throw e;
    }
  }

  let applying = false;
  /** write a profile's hub settings into localStorage (filtered again; keys never imported) */
  function apply(hub) {
    applying = true;
    try {
      const want = {};
      Object.keys(hub || {}).forEach((n) => {
        const v = hub[n];
        const s = typeof v === 'string' ? v : JSON.stringify(v);
        if (typeof s === 'string' && allowed(n, s)) want[n] = s;
      });
      // settings this browser has but the profile does not → back to default
      const have = [];
      for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && k.indexOf(P) === 0) have.push(k.slice(P.length)); }
      have.forEach((n) => { if (allowedName(n) && !(n in want) && !keyLike(lget(P + n) || '')) ldel(P + n); });
      Object.keys(want).forEach((n) => lset(P + n, want[n]));
      return Object.keys(want).length;
    } finally { applying = false; }
  }

  async function load(o) {
    o = o || {};
    const { rec } = await pick();
    if (!rec) return { ok: false, applied: false, reason: 'no-folder' };
    if (await perm(rec.handle, !!o.ask) !== 'granted') { await status(); emit(); return { ok: false, applied: false, reason: 'permission' }; }
    let data;
    try { data = await readFile(rec); } catch (e) {
      setState({ error: 'Could not read hub.json: ' + (e && e.message || e) });
      return { ok: false, applied: false, reason: 'error' };
    }
    if (!data) { await status(); emit(); return { ok: true, applied: false, reason: 'no-file' }; }
    if (!data || data.version !== 1 || !data.hub || typeof data.hub !== 'object') {
      setState({ error: 'hub.json is not a Hub profile (version 1)' });
      return { ok: false, applied: false, reason: 'bad-file' };
    }
    const at = Date.parse(data.savedAt) || 0;
    const localAt = +lget(K_AT) || 0;
    if (!o.force && at <= localAt) {
      lastText = '';
      await status(); emit();
      return { ok: true, applied: false, reason: 'not-newer', savedAt: data.savedAt };
    }
    const n = apply(data.hub);
    const appsLoaded = await loadApps(rec);
    const nKeys = data.keys ? importKeys(data.keys) : 0;
    lset(K_AT, at || Date.now());
    lset(K_LOADED, Date.now());
    lastText = JSON.stringify([collect(), includeKeys() ? readKeys() : null]);
    await status();
    setState({ error: '' });
    return { ok: true, applied: true, count: n, apps: appsLoaded, keys: nKeys, savedAt: data.savedAt };
  }

  /** H30.2: system/<app>.json → localStorage (only that app's own keys) */
  async function loadApps(rec) {
    const done = [];
    let sys = null;
    try { sys = await (await profileDir(rec.handle, false)).getDirectoryHandle('system'); } catch (_) { return done; }
    for (const a of Object.keys(APPS)) {
      let d = null;
      try { d = JSON.parse(await (await (await sys.getFileHandle(a + '.json')).getFile()).text()); } catch (_) { continue; }
      if (!d || d.version !== 1 || !d.settings || typeof d.settings !== 'object') continue;
      applyApp(a, d.settings);
      done.push(a);
    }
    return done;
  }
  function applyApp(a, settings) {
    applying = true;
    try {
      const want = {};
      Object.keys(settings).forEach((k) => {
        const v = settings[k], s = typeof v === 'string' ? v : JSON.stringify(v);
        if (appOf(k) === a && !KEY_NAME.test(k) && typeof s === 'string' && s.length <= MAX_VALUE && !keyLike(s)) want[k] = s;
      });
      const have = [];
      for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && appOf(k) === a) have.push(k); }
      have.forEach((k) => { if (!(k in want)) ldel(k); });
      Object.keys(want).forEach((k) => lset(k, want[k]));
    } finally { applying = false; }
    appText[a] = JSON.stringify(collectApp(a));
  }

  /* H30.3: one .json file for devices without a folder */
  function exportData() {
    const system = {};
    Object.keys(APPS).forEach((a) => { const st = collectApp(a); if (Object.keys(st).length) system[a] = st; });
    const out = { version: 1, kind: 'hub-profile', savedAt: new Date().toISOString(), device: deviceInfo(), hub: collect(), system };
    if (includeKeys()) out.keys = readKeys();
    return out;
  }
  async function importData(obj) {
    if (typeof obj === 'string') { try { obj = JSON.parse(obj); } catch (_) { return { ok: false, reason: 'bad-file' }; } }
    if (!obj || obj.version !== 1 || !obj.hub || typeof obj.hub !== 'object') return { ok: false, reason: 'bad-file' };
    const n = apply(obj.hub);
    const apps = [];
    if (obj.system && typeof obj.system === 'object') {
      Object.keys(obj.system).forEach((a) => { if (APPS[a] && obj.system[a] && typeof obj.system[a] === 'object') { applyApp(a, obj.system[a]); apps.push(a); } });
    }
    const nKeys = obj.keys ? importKeys(obj.keys) : 0;
    lset(K_AT, Date.now());
    lset(K_LOADED, Date.now());
    lastText = '';
    const st = await status();
    if (st.state === 'ready') await save({ force: true });   // the folder gets the imported settings too
    emit();
    return { ok: true, count: n, apps, keys: nKeys };
  }

  /** reload the Hub once for a given profile (never loops) */
  function reloadOnce(savedAt) {
    let done = '';
    try { done = sessionStorage.getItem(RELOAD_GUARD) || ''; } catch (_) { /* blocked */ }
    if (done === String(savedAt)) return false;
    try { sessionStorage.setItem(RELOAD_GUARD, String(savedAt)); } catch (_) { /* blocked */ }
    if (window.HubProfile && window.HubProfile.noReload) return false;   // tests
    setTimeout(() => location.reload(), 50);
    return true;
  }

  /* ---------- changes → debounced save ---------- */
  let timer = 0;
  function touched(key) {
    if (applying || !key) return;
    const keysOn = key === K_STORE && includeKeys();   // H30.3
    if (!keysOn && (key.indexOf(P) === 0 ? !allowedName(key.slice(P.length)) : !appOf(key))) return;
    lset(K_AT, Date.now());
    if (last.state === 'none' && !last.driveId) { /* re-check cheaply on the timer */ }
    clearTimeout(timer);
    timer = setTimeout(() => { timer = 0; save().catch(() => {}); }, DEBOUNCE);
  }
  if (proto && ls) {
    // only a real change counts (the Hub re-writes some settings with the same value on start)
    proto.setItem = function (k, v) {
      const mine = this === ls, old = mine ? this.getItem(k) : null;
      const r = rawSet.call(this, k, v);
      if (mine && old !== String(v)) touched(String(k));
      return r;
    };
    proto.removeItem = function (k) {
      const mine = this === ls, old = mine ? this.getItem(k) : null;
      const r = rawRemove.call(this, k);
      if (mine && old !== null) touched(String(k));
      return r;
    };
  }
  window.addEventListener('storage', (e) => { if (e.storageArea === ls && e.key && e.oldValue !== e.newValue) touched(e.key); });
  window.addEventListener('pagehide', () => { if (timer) { clearTimeout(timer); timer = 0; save().catch(() => {}); } });

  /* ---------- start ---------- */
  let card = null;
  function askCard(rec) {
    const N = window.HubNotify;
    if (!N || !N.notice || card) return;
    card = N.notice({
      icon: '\uD83D\uDCC1', title: 'Continue with your saved Hub?',
      text: 'Allow access to your folder \u201C' + rec.name + '\u201D to load and save your Hub settings.',
      timeoutMs: 0,
      onClick: () => { card = null; continueNow(); },
    });
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'hp-continue'; btn.textContent = 'Continue';
    btn.style.cssText = 'margin-top:8px;padding:5px 14px;border:0;border-radius:8px;font:600 12.5px system-ui,sans-serif;' +
      'background:var(--accent,#6ea8fe);color:#0b1220;cursor:pointer';
    const body = card.node && card.node.querySelector('.hn-body');
    if (body) body.appendChild(btn);
  }
  async function continueNow() {
    const r = await load({ ask: true });
    if (r.applied) { reloadOnce(r.savedAt); return; }
    if (r.ok) await save();
  }
  async function start() {
    const { rec } = await pick();
    if (!rec) { await status(); emit(); return; }   // no folder connected: nothing to do
    const p = await perm(rec.handle, false);
    if (p === 'granted') {
      const r = await load({});
      if (r.applied) { reloadOnce(r.savedAt); return; }
      if (r.ok) await save();   // no file yet, or this browser is newer
    } else if (p === 'prompt') {
      await status(); emit();
      askCard(rec);
    } else { await status(); emit(); }
  }
  try {
    const bc = new BroadcastChannel('sites-fs');
    bc.onmessage = (e) => { if (e.data && e.data.type === 'drives') { if (card) { card.close(); card = null; } start().catch(() => {}); } };
  } catch (_) { /* old browser */ }

  window.HubProfile = {
    save, load, status, collect,
    setFolder(id) { if (id) lset(K_DRIVE, id); else ldel(K_DRIVE); lastText = ''; return start(); },
    onChange(fn) { fns.push(fn); return () => { const i = fns.indexOf(fn); if (i >= 0) fns.splice(i, 1); }; },
    get state() { return Object.assign({}, last); },
    PATH: DIRS.join('/') + '/' + FILE,
    apps: () => Object.keys(APPS),
    exportData, importData,
    includeKeys,
    setIncludeKeys(on) {   // H30.3: off by default; changing it rewrites hub.json (keys added / removed)
      if (on) lset(K_KEYS, '1'); else ldel(K_KEYS);
      lastText = '';
      emit();
      return save({ force: true }).catch(() => ({ ok: false }));
    },
    collectApp,
    registerApp(name, def) {   // H30.2: more System apps
      if (!/^[a-z0-9-]+$/.test(name || '') || !def) return false;
      const ok = (k) => typeof k === 'string' && k && k.indexOf(P) !== 0 && !KEY_NAME.test(k);
      APPS[name] = { keys: (def.keys || []).filter(ok), prefixes: (def.prefixes || []).filter(ok) };
      return true;
    },
    _start: start, _allowed: allowed,
  };
  const go = () => setTimeout(() => start().catch(() => {}), 800);
  if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
})();
