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
    'updTried', 'fromCat', 'fromLab', 'profileAt', 'profileSaved', 'profileLoaded', 'profileDrive']);
  const KEY_NAME = /key|token|secret|passw|auth|cred|cookie/i;
  const KEY_VALUE = /(sk-[A-Za-z0-9_-]{8,}|sk_(live|test)_|gsk_[A-Za-z0-9]{8,}|xai-[A-Za-z0-9]{8,}|AIza[0-9A-Za-z_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_|tvly-[A-Za-z0-9]{8,}|hf_[A-Za-z0-9]{20,}|ya29\.|Bearer\s|-----BEGIN)/;
  const OPAQUE = /^[A-Za-z0-9_\-+=]{32,}$/;   // one long token-looking word

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
      lastSave: +lget(K_SAVED) || 0, lastLoad: +lget(K_LOADED) || 0, localAt: +lget(K_AT) || 0,
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
      const body = JSON.stringify(hub);
      if (!o.force && body === lastText) return { ok: true, reason: 'unchanged' };
      const now = Date.now();
      const data = { version: 1, savedAt: new Date(now).toISOString(), device: deviceInfo(), hub };
      try {
        const dir = await profileDir(rec.handle, true);
        const fh = await dir.getFileHandle(FILE, { create: true });
        const w = await fh.createWritable();
        await w.write(JSON.stringify(data, null, 2) + '\n');
        await w.close();
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
      lastText = lastText || (JSON.stringify(collect()) === JSON.stringify(data.hub) ? JSON.stringify(data.hub) : '');
      await status(); emit();
      return { ok: true, applied: false, reason: 'not-newer', savedAt: data.savedAt };
    }
    const n = apply(data.hub);
    lset(K_AT, at || Date.now());
    lset(K_LOADED, Date.now());
    lastText = JSON.stringify(collect());
    await status();
    setState({ error: '' });
    return { ok: true, applied: true, count: n, savedAt: data.savedAt };
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
    if (applying || !key || key.indexOf(P) !== 0 || !allowedName(key.slice(P.length))) return;
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
    _start: start, _allowed: allowed,
  };
  const go = () => setTimeout(() => start().catch(() => {}), 800);
  if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
})();
