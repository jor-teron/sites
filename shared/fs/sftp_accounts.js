/*
 * SFTP drive accounts (shared/fs/sftp_accounts.js) — H119. The saved SFTP servers that
 * shared/fs/fs_drives.js lists as drives 'sftp:<n>' (opened with shared/fs/sftp_fs.js through the
 * relay hub/relay/sftp_relay.py). Same pattern as shared/fs/webdav_accounts.js (H116). No libraries.
 * Stored like the API keys: plain localStorage in this browser only,
 *   'hub-sftp-accounts' = { v: 1, next: <n>, list: [{ id, name, relay, token, host, port, user, pass, folder, added }] }.
 *   No 'sites-hub.' prefix, so hub_profile.js never puts it in hub.json / profile sync
 *   (passwords and the relay token never leave this browser).
 * Ids are 'sftp:1', 'sftp:2', ... and never reused (next only grows). Changes are announced on
 *   BroadcastChannel 'sites-fs' ({type:'drives'}) like WebDAV, so every open page redraws.
 *
 * API window.SftpAccounts:
 *   list()          → [{ id, name, relay, token, host, port, user, pass, folder }] (copies, in the order added)
 *   get(id)         → { … } | null
 *   add(fields)     → id
 *   update(id, fields) → true when found
 *   remove(id)      → true when it was there
 */
(function () {
  'use strict';
  if (window.SftpAccounts) return;
  const STORE = 'hub-sftp-accounts', CH = 'sites-fs';
  const FIELDS = ['name', 'relay', 'token', 'host', 'port', 'user', 'pass', 'folder'];

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
  const pub = (a) => {
    const o = { id: a.id };
    FIELDS.forEach((k) => { o[k] = k === 'port' ? (+a.port || 22) : (a[k] || ''); });
    return o;
  };
  const clean = (k, v) => {
    if (k === 'port') return Math.min(65535, Math.max(1, parseInt(v, 10) || 22));
    const s = String(v == null ? '' : v);
    return k === 'pass' || k === 'token' ? s : s.trim();
  };
  const label = (a) => a.name || ((a.user ? a.user + '@' : '') + (a.host || 'SFTP server'));

  window.SftpAccounts = {
    list() { return read().list.map(pub); },
    get(id) { const a = read().list.find((x) => x.id === id); return a ? pub(a) : null; },
    add(f) {
      const o = read(), a = { id: 'sftp:' + o.next, added: Date.now() };
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
