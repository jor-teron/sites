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
 * H30.5 Where: Settings → About → Profile → 'Save profile to' ticks any of Google Drive and every connected
 *   host folder (localStorage 'sites-hub.profileTargets' = JSON list of ids, 'gdrive' = Google Drive; not set =
 *   the H30.1 choice 'sites-hub.profileDrive' or else the first folder). Every ticked place gets the same files.
 *   Google Drive uses the Hub's own Google sign-in (sites-hub.google via shared/google/google_auth.js
 *   GoogleAuth.fetchApi; the 'drives' batch of hub_loader.js is loaded when Drive is ticked) and keeps
 *   <Drive "hub" folder (GDriveFs.hubRoot)>/hub-profile/hub.json + <category>/<app>.json. No duplicate folders:
 *   the folder's Drive id is kept in 'sites-hub.profileGdrive' and in hub.json ("driveFolderId"), the folder
 *   carries appProperties { hubProfile: '1' }; lookup = by id, then by that tag, and only then create. Several
 *   tagged folders → the one with the newest hub.json is used and a notification card names the others.
 *   Not signed in → the Drive row says 'Sign in to Google Drive' and Drive is skipped.
 * H30.6 When: 'Save every' 30 s / 1 min (default) / 5 min / 15 min / Manual only ('sites-hub.profileEvery' =
 *   30 | 60 | 300 | 900 | 0 seconds; a normal Hub setting, so it travels with the profile). A change marks the
 *   profile dirty; the save runs that long after the first unsaved change and only writes when something
 *   changed (changes in this page via localStorage.setItem and in Settings / other tabs via the 'storage'
 *   event). Also on pagehide when dirty (best effort) and with Save now. Unchanged settings are not written again.
 * Loading: on Hub start every ticked place that can be read without a click is read; the copy with the newest
 *   savedAt wins. When it is newer than this browser's settings ('sites-hub.profileAt' = last local change /
 *   last save) it is applied and the Hub reloads quietly, once; places that are older are then brought up to date. When the browser wants a click first (permission 'prompt') a notification
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
 *   More apps: HubProfile.registerApp(name, { category, keys: [...], prefixes: [...] }).
 * H30.7 Media, Connectivity, Tools, Office: the same for those apps, one file per app in a folder per category:
 *   hub-profile/<category>/<app>.json (category = media | connectivity | tools | office; the files carry
 *   "category" too). The list (APP_LIST below) lives here on the Hub side; the apps are not changed. Only small
 *   settings / preferences; never saved: caches, history, playback / last URL, documents and autosaves, pairing
 *   and join codes, device ids, saved hosts / known_hosts, tokens and API keys (see the comments in APP_LIST).
 *   Export files: "system": { app: settings } as before + "apps": { category: { app: settings } }.
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
 *   status()              → Promise<{ state, folder, driveId, folders, targets, every, path, lastSave, lastLoad, localAt, error }>
 *                           state: 'none' | 'prompt' | 'denied' | 'ready' | 'unsupported'
 *                           targets: [{ id, kind: 'gdrive' | 'folder', name, ticked, state, path, error }]
 *                           (target state adds 'signin' = Google Drive not signed in)
 *   setTargets(ids)       H30.5: the ticked places (ids from targets; 'gdrive' = Google Drive)
 *   setFolder(id)         (H30.1) save to just this connected folder
 *   every() / setEvery(s) H30.6: seconds between saves (0 = Manual only)
 *   onChange(fn)          fn(status) after a save / load / state change; returns an unsubscribe function
 *   collect()             the settings object that would be written (for tests / Settings)
 */
(function () {
  'use strict';
  const P = 'sites-hub.';
  const DIRS = ['hub', 'hub-profile'], FILE = 'hub.json';
  const K_AT = P + 'profileAt', K_SAVED = P + 'profileSaved', K_LOADED = P + 'profileLoaded', K_DRIVE = P + 'profileDrive';
  const RELOAD_GUARD = 'sites-hub.profileReload';   // sessionStorage: the savedAt we already reloaded for
  const MAX_VALUE = 200000;
  const K_TARGETS = P + 'profileTargets', K_GFOLDER = P + 'profileGdrive', K_EVERY = P + 'profileEvery';   // H30.5 / H30.6
  const GID = 'gdrive', EVERY = [30, 60, 300, 900, 0], EVERY_DEFAULT = 60;
  const EXCLUDE = new Set(['keys', 'google', 'phonekeyRooms', 'startList', 'lastRefresh', 'wmSession', 'lastApp',
    'updTried', 'fromCat', 'fromLab', 'profileAt', 'profileSaved', 'profileLoaded', 'profileDrive', 'profileKeys',
    'profileTargets', 'profileGdrive']);   // H30.5: per-device places + Drive folder id
  const K_KEYS = P + 'profileKeys', K_STORE = P + 'keys';   // H30.3
  const KEY_NAME = /key|token|secret|passw|auth|cred|cookie/i;
  const KEY_VALUE = /(sk-[A-Za-z0-9_-]{8,}|sk_(live|test)_|gsk_[A-Za-z0-9]{8,}|xai-[A-Za-z0-9]{8,}|AIza[0-9A-Za-z_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_|tvly-[A-Za-z0-9]{8,}|hf_[A-Za-z0-9]{20,}|ya29\.|Bearer\s|-----BEGIN)/;
  const OPAQUE = /^[A-Za-z0-9_\-+=]{32,}$/;   // one long token-looking word
  /* H30.2 / H30.7: app settings → hub/hub-profile/<category>/<app>.json. [category, app, keys, prefixes] */
  const CATS = ['system', 'media', 'connectivity', 'tools', 'office'];
  const APP_LIST = [
    ['system', 'files', [], ['sites-files.']],
    ['system', 'viewer', ['sites-viewer.speed']],
    ['system', 'terminal', ['hub-terminal.theme']],
    // H30.7 Media. Not saved: draw-autosave(-meta) (drawing), paint-image (picture), mv_alpha_last_url (3D viewer last
    // URL), sound-recorder-state-v1 (screen / current take), news.saved / seen / tab / cache, shared-link-join-code
    ['media', 'camera', ['camera-settings-v1']],
    ['media', 'webcam', ['sites-webcam-theme']],
    ['media', 'sound-recorder', ['sound-recorder-settings-v1']],
    ['media', 'news', ['news.set', 'news.places']],
    // Connectivity. Not saved: ssh-hosts-v1, ssh-known-hosts-v1, SSH login keys, p2pchat_profile_v1 (WebRTC chat
    // device id), shared-link-join-code, the pairing data in sessionStorage
    ['connectivity', 'filedrop', ['shared-link-auto-download']],
    ['connectivity', 'ssh', ['ssh-settings-v1']],
    // Tools. Not saved: calc_history, calendar / stopwatch / unitconv state, cfn_gemini_api_key_v01, cfn_rpd_utc_v1,
    // cfn_hour_* logs, myday.todo / schedule, speedtest.hist, gemini_transcribe_api_key, webdesk_auth / webdesk_ts
    ['tools', 'calculator', ['calc_angle']],
    ['tools', 'calendar', ['calendar-settings-v1']],
    ['tools', 'caption-for-nei', ['cfn_abc_mode_v1', 'cfn_mic_gain_v1']],
    ['tools', 'dashboard', ['myday.theme', 'myday.timefmt', 'myday.layout']],
    ['tools', 'msword_diff', ['msword_diff_pt', 'msword_diff_map', 'msword_diff_counts']],
    ['tools', 'speedtest', ['speedtest.unit', 'speedtest.dur']],
    ['tools', 'stopwatch', ['stopwatch-settings-v1']],
    ['tools', 'unit-converter', ['unitconv-settings-v1']],
    ['tools', 'vDesktop', ['webdesk_theme', 'webdesk_wall']],
    // Office. Not saved: documents (sheet-v2(-page), sheet-v1, spreadsheet-name, draftly-backup, draftly_last_name,
    // notely-text, notepad-text), draftly_merge_settings (data file + row), notely-imported, ocr_vision_api_key,
    // jtocr-* / jtprint-* codes and links, jtprint-history / jtprint-sent, paper-scan-order, basic-mail-token
    ['office', 'base', ['base_settings', 'base_theme', 'base-ribbon-tab', 'base_totals']],
    ['office', 'draftly', ['draftly_settings', 'draftly_theme', 'draftly_nonprinting', 'draftly_orientation',
      'draftly_paper_size', 'draftly_margin_preset', 'draftly_margin_custom', 'draftly_page_numbers', 'draftly_page_number_pos',
      'draftly_ruler', 'draftly_status_bar', 'draftly_zoom', 'draftly-ribbon-tab', 'draftly.lastTextColour', 'draftly.lastHiliteColour']],
    ['office', 'mail', ['basic-mail-theme']],
    ['office', 'notely', ['notely-theme', 'notely-font']],
    ['office', 'ocr', ['ocr_engine']],
    ['office', 'paper-scan', ['paper-scan-quality']],
    ['office', 'pdf-tools', ['pdf-tools-settings-v1']],
    ['office', 'print', ['jtprint-inpage-size']],
    ['office', 'spreadsheet', ['spreadsheet_settings', 'spreadsheet_theme', 'spreadsheet-ribbon-tab'], ['spreadsheet.last-']],
  ];
  /* id = '<category>/<app>' → { cat, name, keys, prefixes } */
  const APPS = {};
  const keyOk = (k) => typeof k === 'string' && !!k && k.indexOf(P) !== 0 && !KEY_NAME.test(k);
  function addApp(cat, name, keys, prefixes) {
    if (CATS.indexOf(cat) < 0 || !/^[A-Za-z0-9_-]{1,60}$/.test(name || '')) return '';
    const id = cat + '/' + name;
    APPS[id] = { cat, name, keys: (keys || []).filter(keyOk), prefixes: (prefixes || []).filter(keyOk) };
    return id;
  }
  APP_LIST.forEach((a) => addApp(a[0], a[1], a[2], a[3]));
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
  const notFound = (e) => e && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError');
  async function writeJson(dir, name, data) {
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(data, null, 2) + '\n');
    await w.close();
  }

  /** a connected host folder as a save place */
  function folderTarget(rec) {
    return {
      id: rec.id, kind: 'folder', name: rec.name, rec,
      path: '/drive/' + rec.name + '/' + DIRS.join('/') + '/' + FILE,
      async state(ask) { const p = await perm(rec.handle, ask); return p === 'granted' ? 'ready' : p === 'denied' ? 'denied' : 'prompt'; },
      async read() {
        try { return JSON.parse(await (await (await (await profileDir(rec.handle, false)).getFileHandle(FILE)).getFile()).text()); }
        catch (e) { if (notFound(e)) return null; throw e; }
      },
      async listApps() {   // H30.7: { category: Set(file names) } of what is there
        const out = {};
        let dir;
        try { dir = await profileDir(rec.handle, false); } catch (_) { return out; }
        for (const c of CATS) {
          try {
            const d = await dir.getDirectoryHandle(c), names = new Set();
            for await (const [n, h] of d.entries()) if (h.kind === 'file' && /\.json$/.test(n)) names.add(n);
            out[c] = names;
          } catch (_) { /* no such category folder */ }
        }
        return out;
      },
      async readApp(id) {
        const d = APPS[id];
        if (!d) return null;
        try {
          const cd = await (await profileDir(rec.handle, false)).getDirectoryHandle(d.cat);
          return JSON.parse(await (await (await cd.getFileHandle(d.name + '.json')).getFile()).text());
        } catch (_) { return null; }
      },
      async write(data, apps) {
        const dir = await profileDir(rec.handle, true);
        await writeJson(dir, FILE, data);
        const cds = {};
        for (const x of apps) {
          const c = APPS[x.app].cat;
          if (!cds[c]) cds[c] = await dir.getDirectoryHandle(c, { create: true });
          await writeJson(cds[c], APPS[x.app].name + '.json', x.data);
        }
      },
    };
  }

  /* ---------- H30.5: Google Drive (Drive v3 REST through the Hub's sign-in) ---------- */
  const DAPI = 'https://www.googleapis.com/drive/v3/', DUP = 'https://www.googleapis.com/upload/drive/v3/files';
  const GFOLDER = 'application/vnd.google-apps.folder';
  const TAG_Q = "appProperties has { key='hubProfile' and value='1' } and mimeType = '" + GFOLDER + "' and trashed = false";
  const dq = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  const jbody = (method, o) => ({ method, headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify(o) });
  /** GoogleAuth, loading the Hub's 'drives' batch (google_auth.js + gdrive_fs.js) when asked */
  async function gauth(wait) {
    if (!window.GoogleAuth && wait && window.HubLoader && window.HubLoader.load) { try { await window.HubLoader.load('drives'); } catch (_) { /* below */ } }
    return window.GoogleAuth || null;
  }
  async function dj(url, opts) {
    const r = await window.GoogleAuth.fetchApi(url.indexOf('https:') === 0 ? url : DAPI + url, opts);
    if (!r.ok) {
      let m = 'HTTP ' + r.status;
      try { const j = await r.json(); if (j.error) m = (j.error.message || j.error) + ' (HTTP ' + r.status + ')'; } catch (_) { /* not json */ }
      const e = new Error('Google Drive: ' + m); e.status = r.status; throw e;
    }
    return r.status === 204 ? {} : r.json();
  }
  let gFolder = null, gFor = '', dupShown = false;
  const gIds = {};   // parentId/name → file id (cache)
  const gCats = {};   // H30.7: category → Drive folder id
  function gReset() { gFolder = null; [gIds, gCats].forEach((o) => Object.keys(o).forEach((k) => delete o[k])); }
  async function gFind(parent, name, folder) {
    const p = new URLSearchParams({
      q: dq(parent) + ' in parents and name = ' + dq(name) + ' and trashed = false' + (folder ? " and mimeType = '" + GFOLDER + "'" : ''),
      fields: 'files(id,name,modifiedTime)', pageSize: '10',
    });
    const j = await dj('files?' + p);
    return (j.files || [])[0] || null;
  }
  /** the 'hub-profile' folder: by id, then by tag, then (create) a new one */
  async function gResolve(create) {
    const u = window.GoogleAuth.user() || {}, who = (u.email || '') + '|' + (u.method || '');
    if (gFolder && gFor === who) return gFolder;
    gReset(); gFor = who;
    const id = lget(K_GFOLDER);
    if (id) {
      try {
        const f = await dj('files/' + encodeURIComponent(id) + '?fields=id,name,trashed,modifiedTime,appProperties');
        if (f && f.id && !f.trashed) { gFolder = f; return f; }
      } catch (e) { if (e.status !== 404 && e.status !== 403) throw e; }
    }
    const j = await dj('files?' + new URLSearchParams({ q: TAG_Q, fields: 'files(id,name,createdTime,modifiedTime)', pageSize: '20' }));
    let list = j.files || [];
    if (list.length > 1) list = await gNewest(list);
    if (list.length) {
      gFolder = list[0];
      lset(K_GFOLDER, gFolder.id);
      if (list.length > 1) dupCard(list);
      return gFolder;
    }
    if (!create) return null;
    let parent = 'root';
    if (window.GDriveFs && window.GDriveFs.hubRoot) parent = (await window.GDriveFs.hubRoot()).id;
    gFolder = await dj('files?fields=id,name,createdTime,modifiedTime',
      jbody('POST', { name: 'hub-profile', mimeType: GFOLDER, parents: [parent], appProperties: { hubProfile: '1' } }));
    lset(K_GFOLDER, gFolder.id);
    return gFolder;
  }
  /** several tagged folders → newest hub.json first */
  async function gNewest(list) {
    for (const f of list) {
      let h = null;
      try { h = await gFind(f.id, FILE, false); } catch (_) { /* keep folder dates */ }
      f._at = Date.parse(h && h.modifiedTime || '') || 0;
      f._t = f._at || Date.parse(f.modifiedTime || f.createdTime || '') || 0;
    }
    return list.slice().sort((a, b) => b._t - a._t);
  }
  function dupCard(list) {
    if (dupShown) return;
    dupShown = true;
    const N = window.HubNotify;
    if (!N || !N.notice) return;
    const when = (f) => f._t ? new Date(f._t).toLocaleString() : 'no hub.json';
    const others = list.slice(1).map((f) => f.id.slice(0, 8) + '\u2026 (' + when(f) + ')').join(', ');
    N.notice({
      icon: '\u2601\uFE0F', title: list.length + ' Hub profile folders in Google Drive',
      text: 'Using the newest (' + when(list[0]) + '). Other "hub-profile" folders: ' + others + '. You can delete the extra ones in Drive.',
      timeoutMs: 0,
    });
  }
  async function gFileId(parent, name) {
    const k = parent + '/' + name;
    if (gIds[k]) return gIds[k];
    const f = await gFind(parent, name, false);
    if (f) gIds[k] = f.id;
    return f ? f.id : '';
  }
  async function gWrite(parent, name, data) {
    const text = JSON.stringify(data, null, 2) + '\n';
    for (let tries = 0; tries < 2; tries++) {
      let id = await gFileId(parent, name);
      if (!id) {
        id = (await dj('files?fields=id', jbody('POST', { name, parents: [parent], mimeType: 'application/json' }))).id;
        gIds[parent + '/' + name] = id;
      }
      try {
        await dj(DUP + '/' + encodeURIComponent(id) + '?uploadType=media&fields=id',
          { method: 'PATCH', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: text });
        return;
      } catch (e) { if (e.status !== 404 || tries) throw e; delete gIds[parent + '/' + name]; }   // file gone: make it again
    }
  }
  async function gRead(parent, name) {
    const id = await gFileId(parent, name);
    if (!id) return null;
    const r = await window.GoogleAuth.fetchApi(DAPI + 'files/' + encodeURIComponent(id) + '?alt=media');
    if (r.status === 404) { delete gIds[parent + '/' + name]; return null; }
    if (!r.ok) throw new Error('Google Drive: HTTP ' + r.status);
    return JSON.parse(await r.text());
  }
  /** the '<category>' folder inside hub-profile (H30.2 'system', H30.7 the others) */
  async function gCat(cat, create) {
    if (gCats[cat]) return gCats[cat];
    const f = await gFind(gFolder.id, cat, true);
    if (f) { gCats[cat] = f.id; return f.id; }
    if (!create) return '';
    gCats[cat] = (await dj('files?fields=id', jbody('POST', { name: cat, mimeType: GFOLDER, parents: [gFolder.id] }))).id;
    return gCats[cat];
  }
  async function gChildren(parent, folder) {   // [{ id, name }] (one page of up to 1000)
    const p = new URLSearchParams({
      q: dq(parent) + ' in parents and trashed = false' + (folder ? " and mimeType = '" + GFOLDER + "'" : " and mimeType != '" + GFOLDER + "'"),
      fields: 'files(id,name)', pageSize: '1000',
    });
    return (await dj('files?' + p)).files || [];
  }
  const driveTarget = {
    id: GID, kind: 'gdrive', name: 'Google Drive', path: 'Google Drive \u203A hub \u203A hub-profile \u203A ' + FILE,
    async state(ask) {
      const G = await gauth(true);
      if (!G) return 'signin';
      return G.signedIn() ? 'ready' : 'signin';
    },
    async read() { if (!await gResolve(false)) return null; return gRead(gFolder.id, FILE); },
    async listApps() {   // H30.7: a few list calls instead of one lookup per app
      const out = {};
      if (!await gResolve(false)) return out;
      for (const f of await gChildren(gFolder.id, true)) if (CATS.indexOf(f.name) >= 0 && !gCats[f.name]) gCats[f.name] = f.id;
      for (const c of CATS) {
        if (!gCats[c]) continue;
        const names = new Set();
        for (const f of await gChildren(gCats[c], false)) { names.add(f.name); if (!gIds[gCats[c] + '/' + f.name]) gIds[gCats[c] + '/' + f.name] = f.id; }
        out[c] = names;
      }
      return out;
    },
    async readApp(id) {
      const d = APPS[id];
      try { if (!d || !await gResolve(false)) return null; const s = await gCat(d.cat, false); return s ? await gRead(s, d.name + '.json') : null; } catch (_) { return null; }
    },
    async write(data, apps) {
      await gResolve(true);
      await gWrite(gFolder.id, FILE, data);
      for (const x of apps) await gWrite(await gCat(APPS[x.app].cat, true), APPS[x.app].name + '.json', x.data);
    },
  };

  /* ---------- the save places ---------- */
  function tickedIds(all) {
    const raw = lget(K_TARGETS);
    if (raw != null) { try { const a = JSON.parse(raw); if (Array.isArray(a)) return a.map(String); } catch (_) { /* default */ } }
    const want = lget(K_DRIVE);
    const rec = all.find((f) => f.id === want) || all[0];
    return rec ? [rec.id] : [];   // before H30.5: one folder
  }
  async function places() {
    const all = await folders();
    const ids = tickedIds(all);
    const avail = [driveTarget].concat(all.map(folderTarget));
    return { all, avail, ids, list: avail.filter((t) => ids.indexOf(t.id) >= 0) };
  }

  /* ---------- state + change hooks ---------- */
  const fns = [];
  let last = { state: 'none', folder: '', driveId: '', folders: [], targets: [], path: '', lastSave: 0, lastLoad: 0, localAt: 0, error: '' };
  const tErr = {};   // target id → last error text
  function emit() { const s = Object.assign({}, last); fns.slice().forEach((f) => { try { f(s); } catch (_) { /* ignore */ } }); }
  function setState(o) { Object.assign(last, o); emit(); }

  async function status() {
    const pl = await places();
    const targets = [];
    for (const t of pl.avail) {
      const ticked = pl.ids.indexOf(t.id) >= 0;
      let st = 'ready';
      try { st = await t.state(false); } catch (_) { st = 'error'; }
      const row = { id: t.id, kind: t.kind, name: t.name, ticked, state: st, path: t.path, error: tErr[t.id] || '' };
      if (t.kind === 'gdrive' && window.GoogleAuth) { const u = window.GoogleAuth.user() || {}; if (u.email && st === 'ready') row.account = u.email; }
      targets.push(row);
    }
    const on = targets.filter((t) => t.ticked);
    const first = on.find((t) => t.state === 'ready') || on[0];
    const fol = on.find((t) => t.kind === 'folder');
    Object.assign(last, {
      folders: pl.all.map((f) => ({ id: f.id, name: f.name })), targets, every: every(),
      lastSave: +lget(K_SAVED) || 0, includeKeys: includeKeys(), lastLoad: +lget(K_LOADED) || 0, localAt: +lget(K_AT) || 0,
      state: !window.indexedDB ? 'unsupported' : !first ? 'none' : first.state === 'signin' ? 'prompt' : first.state === 'error' ? 'denied' : first.state,
      folder: fol ? fol.name : '', driveId: fol ? fol.id : '', path: first ? first.path : '',
    });
    return Object.assign({}, last);
  }

  let lastText = '';   // what this page wrote last (skip identical writes)
  const appText = {};  // H30.2: same per System app
  const synced = new Set();   // H30.5: places that hold what this page has (written or read back equal)
  function bodyNow() { return JSON.stringify([collect(), includeKeys() ? readKeys() : null]); }
  let saving = null;
  async function save(o) {
    o = o || {};
    clearTimeout(timer); timer = 0; dirty = false;
    if (saving) { await saving.catch(() => {}); }
    const run = (async () => {
      const pl = await places();
      if (!pl.list.length) { await status(); emit(); return { ok: false, reason: 'no-folder' }; }
      const ready = [];
      for (const t of pl.list) { let st; try { st = await t.state(!!o.ask); } catch (_) { st = 'error'; } if (st === 'ready') ready.push(t); }
      if (!ready.length) { await status(); emit(); return { ok: false, reason: 'permission' }; }
      const fresh = ready.some((t) => !synced.has(t.id));   // a place this page has not written yet gets everything
      const force = o.force || fresh;
      const hub = collect();
      const keys = includeKeys() ? readKeys() : null;
      const body = JSON.stringify([hub, keys]);
      const apps = [];
      Object.keys(APPS).forEach((a) => {
        const set = collectApp(a), t = JSON.stringify(set);
        if (force ? Object.keys(set).length || appText[a] != null : t !== (appText[a] == null ? '{}' : appText[a])) apps.push({ app: a, set, t });
      });
      if (!force && body === lastText && !apps.length) return { ok: true, reason: 'unchanged' };
      // the Drive folder first, so hub.json can carry its id ("driveFolderId", H30.5)
      if (ready.indexOf(driveTarget) >= 0 && !gFolder) {
        try { await gResolve(true); } catch (e) { tErr[GID] = String(e && e.message || e); }
      }
      const now = Date.now();
      const savedAt = new Date(now).toISOString();
      const data = { version: 1, savedAt, device: deviceInfo(), hub };
      if (keys) data.keys = keys;   // H30.3: only with 'Include keys in profile' on
      const gfid = lget(K_GFOLDER);
      if (gfid) data.driveFolderId = gfid;
      const appFiles = apps.map((x) => ({ app: x.app, data: { version: 1, app: APPS[x.app].name, category: APPS[x.app].cat, savedAt, settings: x.set } }));
      let okN = 0;
      const errs = [];
      for (const t of ready) {
        try { await t.write(data, appFiles); okN++; synced.add(t.id); delete tErr[t.id]; }
        catch (e) { const m = String(e && e.message || e); tErr[t.id] = m; errs.push(t.name + ': ' + m); synced.delete(t.id); }
      }
      if (!okN) {
        setState({ error: 'Could not save: ' + errs.join('; ') });
        await status(); emit();
        return { ok: false, reason: 'error', error: errs.join('; ') };
      }
      lastText = body;
      apps.forEach((x) => { appText[x.app] = x.t; });
      lset(K_SAVED, now);
      lset(K_AT, now);   // this browser's settings are in step with what was just written
      await status();
      setState({ error: errs.length ? 'Could not save to ' + errs.join('; ') : '' });
      return { ok: true, savedAt, places: okN, errors: errs };
    })();
    saving = run;
    try { return await run; } finally { if (saving === run) saving = null; }
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

  /** H30.5: read every ticked place; the newest savedAt wins */
  async function load(o) {
    o = o || {};
    const pl = await places();
    if (!pl.list.length) return { ok: false, applied: false, reason: 'no-folder' };
    const found = [], errs = [];
    let readyN = 0;
    for (const t of pl.list) {
      let st;
      try { st = await t.state(!!o.ask); } catch (_) { st = 'error'; }
      if (st !== 'ready') continue;
      readyN++;
      let data = null;
      try { data = await t.read(); delete tErr[t.id]; } catch (e) { const m = String(e && e.message || e); tErr[t.id] = m; errs.push(t.name + ': ' + m); continue; }
      if (!data) { found.push({ t, at: -1 }); continue; }
      if (data.version !== 1 || !data.hub || typeof data.hub !== 'object') { errs.push(t.name + ': hub.json is not a Hub profile (version 1)'); found.push({ t, at: -1 }); continue; }
      found.push({ t, data, at: Date.parse(data.savedAt) || 0 });
    }
    if (!readyN) { await status(); emit(); return { ok: false, applied: false, reason: 'permission' }; }
    const good = found.filter((f) => f.data);
    good.forEach((f) => { if (f.data.driveFolderId && !lget(K_GFOLDER) && /^[\w-]{10,200}$/.test(f.data.driveFolderId)) lset(K_GFOLDER, f.data.driveFolderId); });
    if (!good.length) {
      if (errs.length && !found.length) { setState({ error: 'Could not read hub.json: ' + errs.join('; ') }); return { ok: false, applied: false, reason: 'error' }; }
      lastText = ''; synced.clear();
      await status(); setState({ error: errs.join('; ') });
      return { ok: true, applied: false, reason: errs.length ? 'bad-file' : 'no-file' };
    }
    const best = good.reduce((a, b) => (b.at > a.at ? b : a));
    const localAt = +lget(K_AT) || 0;
    if (!o.force && best.at <= localAt) {
      // places already holding exactly this browser's state need no write
      const newest = Math.max(best.at, localAt);
      synced.clear();
      found.forEach((f) => { if (f.at >= newest) synced.add(f.t.id); });
      if (synced.size === found.length && best.at === localAt) {
        lastText = bodyNow();
        Object.keys(APPS).forEach((a) => { appText[a] = JSON.stringify(collectApp(a)); });
      } else lastText = '';
      await status(); setState({ error: errs.join('; ') });
      return { ok: true, applied: false, reason: 'not-newer', savedAt: best.data.savedAt, from: best.t.id };
    }
    const n = apply(best.data.hub);
    const appsLoaded = await loadApps(best.t);
    const nKeys = best.data.keys ? importKeys(best.data.keys) : 0;
    lset(K_AT, best.at || Date.now());
    lset(K_LOADED, Date.now());
    lastText = bodyNow();
    synced.clear();
    found.forEach((f) => { if (f.at === best.at) synced.add(f.t.id); });
    await status();
    setState({ error: errs.join('; ') });
    return { ok: true, applied: true, count: n, apps: appsLoaded, keys: nKeys, savedAt: best.data.savedAt, from: best.t.id };
  }

  /** H30.2 / H30.7: <category>/<app>.json → localStorage (only that app's own keys) */
  async function loadApps(t) {
    const done = [];
    let have = null;
    if (t.listApps) { try { have = await t.listApps(); } catch (_) { have = null; } }
    for (const a of Object.keys(APPS)) {
      const ad = APPS[a];
      if (have && !(have[ad.cat] && have[ad.cat].has(ad.name + '.json'))) continue;   // no file for this app
      const d = await t.readApp(a);
      if (!d || d.version !== 1 || !d.settings || typeof d.settings !== 'object' || Array.isArray(d.settings)) continue;
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
    const system = {}, apps = {};
    Object.keys(APPS).forEach((a) => {
      const st = collectApp(a), d = APPS[a];
      if (!Object.keys(st).length) return;
      if (d.cat === 'system') system[d.name] = st;
      else (apps[d.cat] = apps[d.cat] || {})[d.name] = st;   // H30.7
    });
    const out = { version: 1, kind: 'hub-profile', savedAt: new Date().toISOString(), device: deviceInfo(), hub: collect(), system, apps };
    if (includeKeys()) out.keys = readKeys();
    return out;
  }
  async function importData(obj) {
    if (typeof obj === 'string') { try { obj = JSON.parse(obj); } catch (_) { return { ok: false, reason: 'bad-file' }; } }
    if (!obj || obj.version !== 1 || !obj.hub || typeof obj.hub !== 'object') return { ok: false, reason: 'bad-file' };
    const n = apply(obj.hub);
    const apps = [];
    const take = (cat, o) => {
      if (!o || typeof o !== 'object' || Array.isArray(o)) return;
      Object.keys(o).forEach((n) => { const id = cat + '/' + n; if (APPS[id] && o[n] && typeof o[n] === 'object' && !Array.isArray(o[n])) { applyApp(id, o[n]); apps.push(id); } });
    };
    take('system', obj.system);
    if (obj.apps && typeof obj.apps === 'object') CATS.forEach((c) => { if (c !== 'system') take(c, obj.apps[c]); });   // H30.7
    const nKeys = obj.keys ? importKeys(obj.keys) : 0;
    lset(K_AT, Date.now());
    lset(K_LOADED, Date.now());
    lastText = '';
    synced.clear();
    const st = await status();
    if (st.state === 'ready') await save({ force: true });   // the save places get the imported settings too
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

  /* ---------- H30.6: changes → save every N seconds (only when something changed) ---------- */
  let timer = 0, dirty = false;
  function every() {
    const v = lget(K_EVERY);
    if (v == null || v === '') return EVERY_DEFAULT;
    const n = +v;
    return EVERY.indexOf(n) >= 0 ? n : EVERY_DEFAULT;
  }
  function schedule() {
    if (timer || !dirty) return;
    const s = every();
    if (!s) return;   // Manual only
    timer = setTimeout(flush, s * 1000);
  }
  function flush() {
    timer = 0;
    if (!dirty) return;
    save().then((r) => { if (r && !r.ok && r.reason === 'error') { dirty = true; schedule(); } }).catch(() => {});
  }
  function touched(key) {
    if (applying || !key) return;
    const keysOn = key === K_STORE && includeKeys();   // H30.3
    if (!keysOn && (key.indexOf(P) === 0 ? !allowedName(key.slice(P.length)) : !appOf(key))) return;
    lset(K_AT, Date.now());
    dirty = true;
    if (key === K_EVERY) { clearTimeout(timer); timer = 0; }   // new interval from now
    schedule();
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
  window.addEventListener('pagehide', () => { if (dirty) { clearTimeout(timer); timer = 0; save().catch(() => {}); } });

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
    const pl = await places();
    if (!pl.list.length) { await status(); emit(); return; }   // nowhere to save: nothing to do
    const r = await load({});
    if (r.applied) { reloadOnce(r.savedAt); return; }
    if (r.ok) await save();   // no file yet, or some place is older than this browser
    // a folder the browser wants a click for → ask once
    for (const t of pl.list) {
      if (t.kind !== 'folder') continue;
      let st = 'ready';
      try { st = await t.state(false); } catch (_) { /* skip */ }
      if (st === 'prompt') { askCard(t.rec); break; }
    }
    await status(); emit();
  }
  try {
    const bc = new BroadcastChannel('sites-fs');
    bc.onmessage = (e) => { if (e.data && e.data.type === 'drives') { if (card) { card.close(); card = null; } start().catch(() => {}); } };
  } catch (_) { /* old browser */ }
  let gWatch = false;
  function watchGoogle() {   // signing in / out of Google re-checks the Drive place
    if (gWatch || !window.GoogleAuth || !window.GoogleAuth.onChange) return;
    gWatch = true;
    window.GoogleAuth.onChange(() => { gReset(); synced.delete(GID); status().then(emit).catch(() => {}); });
  }

  window.HubProfile = {
    save, load, collect,
    status() { watchGoogle(); return status().then((s) => { watchGoogle(); return s; }); },
    setTargets(ids) {   // H30.5
      const ok = (Array.isArray(ids) ? ids : []).map(String).filter((x, i, a) => x && a.indexOf(x) === i);
      lset(K_TARGETS, JSON.stringify(ok));
      synced.clear(); lastText = '';
      return start();
    },
    setFolder(id) { return this.setTargets(id ? [id] : []); },
    every,
    setEvery(sec) {   // H30.6 (a normal Hub setting: it is saved with the profile)
      sec = +sec;
      if (EVERY.indexOf(sec) < 0) sec = EVERY_DEFAULT;
      try { localStorage.setItem(K_EVERY, String(sec)); } catch (_) { /* blocked */ }
      clearTimeout(timer); timer = 0; schedule();
      emit();
      return sec;
    },
    get dirty() { return dirty; },
    onChange(fn) { fns.push(fn); return () => { const i = fns.indexOf(fn); if (i >= 0) fns.splice(i, 1); }; },
    get state() { return Object.assign({}, last); },
    PATH: DIRS.join('/') + '/' + FILE,
    apps: () => Object.keys(APPS).filter((a) => APPS[a].cat === 'system').map((a) => APPS[a].name),   // H30.2 (System only)
    appsBy() {   // H30.7: { category: [app names] }
      const o = {};
      CATS.forEach((c) => { o[c] = []; });
      Object.keys(APPS).forEach((a) => o[APPS[a].cat].push(APPS[a].name));
      return o;
    },
    categories: CATS.slice(),
    exportData, importData,
    includeKeys,
    setIncludeKeys(on) {   // H30.3: off by default; changing it rewrites hub.json (keys added / removed)
      if (on) lset(K_KEYS, '1'); else ldel(K_KEYS);
      lastText = '';
      emit();
      return save({ force: true }).catch(() => ({ ok: false }));
    },
    collectApp(app) { return collectApp(APPS[app] ? app : 'system/' + app); },   // '<category>/<app>' or a System app name
    registerApp(name, def) {   // H30.2 / H30.7: def = { category: 'system' (default) | 'media' | 'connectivity' | 'tools' | 'office', keys, prefixes }
      if (!def) return false;
      return !!addApp(def.category || 'system', name, def.keys, def.prefixes);
    },
    _start: start, _allowed: allowed, _drive: { resolve: gResolve, reset: () => { gReset(); gFor = ''; dupShown = false; } },
  };
  const go = () => setTimeout(() => { watchGoogle(); start().catch(() => {}); }, 800);
  if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
})();
