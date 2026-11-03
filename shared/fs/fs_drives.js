/*
 * Drives (shared/fs/fs_drives.js) — the list of "drives" shared by the Hub desktop
 * (hub/drives/hub_drives.js) and the Files app (apps/system/files/). No libraries.
 *
 * Two kinds, both a FileSystemDirectoryHandle, so one set of file operations (fs_ops.js) works on both:
 *   local   "Local": the browser's private storage for this site (OPFS,
 *           navigator.storage.getDirectory()). Always there when supported; the first use asks
 *           the browser once to keep it (navigator.storage.persist()).
 *   folder  a real folder the user picked with "Add folder" (showDirectoryPicker, Chrome / Edge
 *           on a computer). The handle is remembered in IndexedDB ('sites-fs' / 'drives'); after a
 *           reload the browser wants a click on "Allow access" (requestPermission) again.
 *           Removing a folder only forgets it here; no files are touched.
 *   gdrive  "Google Drive" (R9a): only when shared/google/gdrive_fs.js + google_auth.js are loaded.
 *           handle('gdrive') = GDriveFs.root() (a directory-handle look-alike); access() is
 *           'granted' when signed in, else 'prompt'; allow() can't sign in by itself (the QR
 *           panel, shared/google/gdrive_connect.js, does that). gdriveState() → 'setup' (no client
 *           id in google_config.js) | 'connect' | 'renew' (phone / popup sign-in ran out) | 'ok'.
 *           R9b: the handle is the "hub" folder in My Drive (GDriveFs.hubRoot()). Sign-in changes redraw like drive changes.
 *   webdav  "Network drive" (H116): each saved WebDAV server (shared/fs/webdav_accounts.js), only when
 *           webdav_fs.js + webdav_accounts.js are loaded. Ids 'webdav:<n>', listed after Google Drive;
 *           handle(id) = WebDavFs.root(account); access() 'granted' (a bad password shows up as an error
 *           when the folder is opened); allow() → true; remove(id) deletes the saved account (no files touched).
 *   sftp    "SFTP server" (H119): each saved SFTP server (shared/fs/sftp_accounts.js), only when sftp_fs.js +
 *           sftp_accounts.js are loaded. Ids 'sftp:<n>', listed right after the WebDAV drives; handle(id) =
 *           SftpFs.root(account) (through the relay hub/relay/sftp_relay.py); access / allow / remove like webdav.
 *   H125: a page that loads only fs_drives.js (the Viewer, any app opened on a FsRef hash) still opens
 *           'webdav:<n>' / 'sftp:<n>': handle / access / allow / remove load webdav_fs.js + webdav_accounts.js
 *           (or sftp_fs.js + sftp_accounts.js) from this folder on first use (same origin, so the saved
 *           accounts in localStorage are there). list() still shows them only when the page loaded them itself
 *           (so Disk / Terminal / System monitor see the same drives as before).
 * Changes are announced on BroadcastChannel 'sites-fs' ({type:'drives'}) so every open page redraws.
 *
 * API window.FsDrives:
 *   hasLocal, canAddFolder            feature flags
 *   list()                            → Promise<[{ id, name, kind }]> ('local' first)
 *   handle(id)                        → Promise<FileSystemDirectoryHandle | null>
 *   access(id)                        → Promise<'granted' | 'prompt' | 'denied'>
 *   allow(id)                         → Promise<boolean> (call from a click: asks the browser)
 *   addFolder()                       → Promise<{id, name} | null> (call from a click)
 *   remove(id)                        → Promise (forget a folder)
 *   onChange(fn)                      redraw hook (this page + other pages)
 */
(function () {
  'use strict';
  const DB = 'sites-fs', STORE = 'drives', CH = 'sites-fs';
  const hasLocal = !!(navigator.storage && navigator.storage.getDirectory);
  const canAddFolder = typeof window.showDirectoryPicker === 'function' && window.isSecureContext;
  const fns = [];
  let bc = null;
  try { bc = new BroadcastChannel(CH); bc.onmessage = (e) => { if (e.data && e.data.type === 'drives') fns.forEach((f) => f()); }; } catch (_) { /* old browser */ }
  const changed = () => { fns.forEach((f) => f()); try { if (bc) bc.postMessage({ type: 'drives' }); } catch (_) { /* closed */ } };

  let dbP = null;
  function db() {
    if (!dbP) {
      dbP = new Promise((res, rej) => {
        if (!window.indexedDB) { rej(new Error('no IndexedDB')); return; }
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      dbP.catch(() => { dbP = null; });
    }
    return dbP;
  }
  function tx(mode, fn) {
    return db().then((d) => new Promise((res, rej) => {
      const t = d.transaction(STORE, mode);
      const out = fn(t.objectStore(STORE));
      t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
      t.onerror = () => rej(t.error);
    }));
  }
  const folders = () => tx('readonly', (s) => s.getAll()).then((r) => r || []).catch(() => []);

  let asked = false;
  function persistOnce() {
    if (asked) return;
    asked = true;
    try {
      if (localStorage.getItem('sites-fs.persistAsked')) return;
      localStorage.setItem('sites-fs.persistAsked', '1');
    } catch (_) { /* blocked */ }
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }

  async function list() {
    const out = hasLocal ? [{ id: 'local', name: 'Local', kind: 'local' }] : [];
    if (hasG()) out.push({ id: 'gdrive', name: 'Google Drive', kind: 'gdrive' });
    (await folders()).sort((a, b) => (a.added || 0) - (b.added || 0))
      .forEach((f) => out.push({ id: f.id, name: f.name, kind: 'folder' }));
    if (hasW()) {
      const at = out.findIndex((d) => d.kind === 'folder');
      const w = window.WebDavAccounts.list().map((a) => ({ id: a.id, name: a.name || 'Network drive', kind: 'webdav' }));
      out.splice(at < 0 ? out.length : at, 0, ...w);   // right after Google Drive
    }
    if (hasS()) {   // H119: SFTP servers right after the WebDAV drives
      const at = out.findIndex((d) => d.kind === 'folder');
      const s = window.SftpAccounts.list().map((a) => ({ id: a.id, name: a.name || 'SFTP server', kind: 'sftp' }));
      out.splice(at < 0 ? out.length : at, 0, ...s);
    }
    return out;
  }
  /* H125: network drive scripts on demand (they were only loaded by Files, so the Viewer said
     "That drive is not here any more" for a WebDAV / SFTP picture). */
  const BASE = (() => { try { return new URL('./', document.currentScript.src).href; } catch (_) { return ''; } })();
  const NET = { webdav: ['webdav_fs.js', 'webdav_accounts.js'], sftp: ['sftp_fs.js', 'sftp_accounts.js'] };
  const netP = {};
  function addScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = false;
      s.onload = () => res(); s.onerror = () => rej(new Error('could not load ' + src));
      (document.head || document.documentElement).appendChild(s);
    });
  }
  function needNet(id) {
    const kind = isW(id) ? 'webdav' : isS(id) ? 'sftp' : '';
    if (!kind) return Promise.resolve(true);
    const has = kind === 'webdav' ? hasW : hasS;
    if (has() || !BASE) return Promise.resolve(has());
    if (!netP[kind]) {
      netP[kind] = NET[kind].reduce((p, f) => p.then(() => addScript(BASE + f)), Promise.resolve())
        .then(() => has(), () => { netP[kind] = null; return has(); });
    }
    return netP[kind];
  }
  async function rec(id) { return (await folders()).find((f) => f.id === id) || null; }
  async function handle(id) {
    await needNet(id);   // H125
    if (isW(id)) { const a = hasW() && window.WebDavAccounts.get(id); return a ? window.WebDavFs.root(a) : null; }
    if (isS(id)) { const a = hasS() && window.SftpAccounts.get(id); return a ? window.SftpFs.root(a) : null; }   // H119
    if (id === 'gdrive') return hasG() && gdriveState() === 'ok' ? window.GDriveFs.hubRoot() : null;   // the "hub" folder
    if (id === 'local') {
      if (!hasLocal) return null;
      persistOnce();
      return navigator.storage.getDirectory();
    }
    const r = await rec(id);
    return r ? r.handle : null;
  }
  async function access(id) {
    await needNet(id);   // H125
    if (isW(id)) return hasW() && window.WebDavAccounts.get(id) ? 'granted' : 'denied';
    if (isS(id)) return hasS() && window.SftpAccounts.get(id) ? 'granted' : 'denied';   // H119
    if (id === 'gdrive') return gdriveState() === 'ok' ? 'granted' : 'prompt';
    if (id === 'local') return hasLocal ? 'granted' : 'denied';
    const h = await handle(id);
    if (!h) return 'denied';
    try { return h.queryPermission ? await h.queryPermission({ mode: 'readwrite' }) : 'granted'; } catch (_) { return 'prompt'; }
  }
  async function allow(id) {
    await needNet(id);   // H125
    if (isW(id)) return !!(hasW() && window.WebDavAccounts.get(id));
    if (isS(id)) return !!(hasS() && window.SftpAccounts.get(id));   // H119
    if (id === 'gdrive') return gdriveState() === 'ok';
    const h = await handle(id);
    if (!h) return false;
    try { return (h.requestPermission ? await h.requestPermission({ mode: 'readwrite' }) : 'granted') === 'granted'; } catch (_) { return false; }
  }
  async function addFolder() {
    if (!canAddFolder) return null;
    let h;
    try { h = await window.showDirectoryPicker({ mode: 'readwrite' }); } catch (_) { return null; }   // cancelled
    // the same folder again → keep the old entry
    for (const f of await folders()) {
      try { if (f.handle && await f.handle.isSameEntry(h)) return { id: f.id, name: f.name }; } catch (_) { /* ignore */ }
    }
    const item = { id: 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: h.name, handle: h, added: Date.now() };
    await tx('readwrite', (s) => s.put(item));
    changed();
    return { id: item.id, name: item.name };
  }
  async function remove(id) {
    if (id === 'local' || id === 'gdrive') return;
    await needNet(id);   // H125
    if (isW(id)) { if (hasW()) window.WebDavAccounts.remove(id); changed(); return; }
    if (isS(id)) {   // H119: forget the account and log out of its relay session
      if (hasS()) { const a = window.SftpAccounts.get(id); if (a) window.SftpFs.close(a); window.SftpAccounts.remove(id); }
      changed(); return;
    }
    await tx('readwrite', (s) => s.delete(id));
    changed();
  }
  function hasW() { return !!(window.WebDavFs && window.WebDavAccounts); }
  const isW = (id) => /^webdav:/.test(String(id));
  function hasS() { return !!(window.SftpFs && window.SftpAccounts); }   // H119
  const isS = (id) => /^sftp:/.test(String(id));
  function hasG() { return !!(window.GDriveFs && window.GoogleAuth); }
  function gdriveState() {
    if (!hasG()) return '';
    const A = window.GoogleAuth;
    if (A.signedIn()) return 'ok';
    if (A.expired()) return 'renew';   // phone / popup sign-in ran out (no refresh token)
    if (!A.configured() && !(A.webConfigured && A.webConfigured())) return 'setup';
    return 'connect';
  }
  if (hasG()) window.GoogleAuth.onChange(() => fns.slice().forEach((f) => { try { f(); } catch (_) { /* ignore */ } }));
  window.FsDrives = { hasLocal, canAddFolder, list, handle, access, allow, addFolder, remove, gdriveState, onChange: (f) => fns.push(f) };
})();
