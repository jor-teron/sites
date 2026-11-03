/*
 * Network drive accounts (shared/fs/webdav_accounts.js) — H116. The saved WebDAV servers that
 * shared/fs/fs_drives.js lists as drives 'webdav:<n>' (opened with shared/fs/webdav_fs.js). No libraries.
 * Stored like the API keys (hub/core/hub_keys.js): plain localStorage in this browser only,
 *   'hub-webdav-accounts' = { v: 1, next: <n>, list: [{ id, name, url, user, pass, added }] }.
 *   The name has no 'sites-hub.' prefix, so hub_profile.js never puts it in hub.json / profile sync
 *   (the passwords never leave this browser).
 * Ids are 'webdav:1', 'webdav:2', ... and never reused (next only grows), so a removed server's id
 *   can't point at a new one. Changes are announced on BroadcastChannel 'sites-fs' ({type:'drives'}),
 *   the same one fs_drives.js listens on, so every open page redraws; other tabs also see 'storage'.
 *
 * API window.WebDavAccounts:
 *   list()               → [{ id, name, url, user, pass }] (copies, in the order added)
 *   get(id)              → { id, name, url, user, pass } | null
 *   add({name,url,user,pass}) → id
 *   update(id, fields)   → true when found (name / url / user / pass)
 *   remove(id)           → true when it was there
 */
(function () {
  'use strict';
  if (window.WebDavAccounts) return;
  const STORE = 'hub-webdav-accounts', CH = 'sites-fs';
  const FIELDS = ['name', 'url', 'user', 'pass'];

  function read() {
    try {
      const o = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (o && Array.isArray(o.list)) return { v: 1, next: +o.next || 1, list: o.list };
    } catch (_) { /* bad JSON */ }
    return { v: 1, next: 1, list: [] };
  }
  function write(o) {
    try { localStorage.setItem(STORE, JSON.stringify(o)); } catch (_) { return false; }
    try { const bc = new BroadcastChannel(CH); bc.postMessage({ type: 'drives' }); bc.close(); } catch (_) { /* old browser */ }
    return true;
  }
  const pub = (a) => ({ id: a.id, name: a.name || '', url: a.url || '', user: a.user || '', pass: a.pass || '' });
  const clean = (k, v) => String(v == null ? '' : v)[k === 'pass' ? 'toString' : 'trim']();
  const label = (a) => a.name || (() => { try { return new URL(a.url).host; } catch (_) { return 'Network drive'; } })();

  window.WebDavAccounts = {
    list() { return read().list.map(pub); },
    get(id) { const a = read().list.find((x) => x.id === id); return a ? pub(a) : null; },
    add(f) {
      const o = read(), a = { id: 'webdav:' + o.next, added: Date.now() };
      FIELDS.forEach((k) => { a[k] = clean(k, f && f[k]); });
      a.name = label(a);
      o.next += 1; o.list.push(a);
      write(o);
      return a.id;
    },
    update(id, f) {
      const o = read(), a = o.list.find((x) => x.id === id);
      if (!a) return false;
      FIELDS.forEach((k) => { if (f && k in f) a[k] = clean(k, f[k]); });
      a.name = label(a);
      return write(o);
    },
    remove(id) {
      const o = read(), n = o.list.length;
      o.list = o.list.filter((x) => x.id !== id);
      return o.list.length !== n && write(o);
    }
  };
})();
