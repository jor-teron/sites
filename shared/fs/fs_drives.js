/*
 * Drives (shared/fs/fs_drives.js) — the list of "drives" shared by the Hub desktop
 * (hub/hub_drives.js) and the Files app (apps/tools/files/). No libraries.
 *
 * Two kinds, both a FileSystemDirectoryHandle, so one set of file operations (fs_ops.js) works on both:
 *   local   "Local": the browser's private storage for this site (OPFS,
 *           navigator.storage.getDirectory()). Always there when supported; the first use asks
 *           the browser once to keep it (navigator.storage.persist()).
 *   folder  a real folder the user picked with "Add folder" (showDirectoryPicker, Chrome / Edge
 *           on a computer). The handle is remembered in IndexedDB ('sites-fs' / 'drives'); after a
 *           reload the browser wants a click on "Allow access" (requestPermission) again.
 *           Removing a folder only forgets it here; no files are touched.
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
    (await folders()).sort((a, b) => (a.added || 0) - (b.added || 0))
      .forEach((f) => out.push({ id: f.id, name: f.name, kind: 'folder' }));
    return out;
  }
  async function rec(id) { return (await folders()).find((f) => f.id === id) || null; }
  async function handle(id) {
    if (id === 'local') {
      if (!hasLocal) return null;
      persistOnce();
      return navigator.storage.getDirectory();
    }
    const r = await rec(id);
    return r ? r.handle : null;
  }
  async function access(id) {
    if (id === 'local') return hasLocal ? 'granted' : 'denied';
    const h = await handle(id);
    if (!h) return 'denied';
    try { return h.queryPermission ? await h.queryPermission({ mode: 'readwrite' }) : 'granted'; } catch (_) { return 'prompt'; }
  }
  async function allow(id) {
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
    if (id === 'local') return;
    await tx('readwrite', (s) => s.delete(id));
    changed();
  }
  window.FsDrives = { hasLocal, canAddFolder, list, handle, access, allow, addFolder, remove, onChange: (f) => fns.push(f) };
})();
