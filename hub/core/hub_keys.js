/** H138a: HubKeys public API, backed only by HubCredentials (load it first).
 * Same named-key CRUD, Settings opener, change and profile-sync undo contracts.
 * Credentials and explicit sync undo live in the single sites-hub.credentials record.
 * No old-store reads, migration or standalone credential fallback.
 */
(function () {
  'use strict';
  if (window.HubKeys) return;
  const C = window.HubCredentials;
  if (!C) throw new Error('HubKeys requires hub_credentials.js.');
  const STORE = C.STORE;
  const NAME_RE = /^[a-z0-9][a-z0-9_.-]{0,39}$/;
  const KNOWN = [
    { name: 'tavily', label: 'Tavily', kind: 'key', url: 'https://app.tavily.com', hint: 'Web search and page reading. Free: 1,000 credits a month, no card (a basic search is 1 credit).' },
    { name: 'gemini', label: 'Google Gemini', kind: 'key', url: 'https://aistudio.google.com/apikey', hint: 'Gemini models. Free tier with per-model limits.' },
    { name: 'ollama_url', label: 'Ollama URL', kind: 'url', url: 'https://ollama.com/download', hint: 'Local models, e.g. http://localhost:11434 (no key). Free: runs on your own computer.' },
    { name: 'gvision', label: 'Google Cloud Vision', kind: 'key', url: 'https://console.cloud.google.com/apis/credentials', hint: 'Image labels and text (OCR). Needs a billing account; first 1,000 units a month free.' },
  ];
  // H134e: no hidden provider-key definitions or fallbacks. Old provider keys
  // are ignored: users re-enter them as visible HubProviders records.
  const USED_BY = { tavily: ['Agent'], gemini: ['Agent'], ollama_url: ['Agent'], gvision: ['OCR', 'Vision'] };
  KNOWN.forEach((d) => { d.usedBy = USED_BY[d.name] || []; });
  const listeners = new Set();
  let restoring = false;

  function read() { return C.read().keys; }
  function write(keys) { return C.update((o) => { o.keys = keys; }); }
  const norm = (name) => String(name == null ? '' : name).trim().toLowerCase();
  function emit(name, present) {
    listeners.forEach((fn) => { try { fn({ name, present }); } catch (_) { /* do not log listener errors */ } });
  }

  function get(name) {
    const v = read()[norm(name)];
    return Promise.resolve(typeof v === 'string' && v !== '' ? v : null);
  }
  function has(name) { const v = read()[norm(name)]; return typeof v === 'string' && v !== ''; }
  function list() { const o = read(); return Object.keys(o).filter((k) => typeof o[k] === 'string' && o[k] !== '').sort(); }
  function set(name, value) {
    const n = norm(name);
    if (!NAME_RE.test(n)) throw new Error('HubKeys: bad key name "' + name + '"');
    const v = value == null ? '' : String(value).trim();
    if (!v) return has(n) ? remove(n) : true;
    const o = read();
    if (o[n] === v) return true;
    o[n] = v;
    const ok = write(o);
    return ok;
  }
  function remove(name) {
    const n = norm(name), o = read();
    if (!(n in o)) return false;
    delete o[n];
    const ok = write(o);
    return ok;
  }
  function onChange(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  /* H29.3: backup of the keys a profile sync changes (values never leave this file) */
  const UNDO = STORE; // compatibility: backup is a section, not a separate storage entry
  function readUndo() {
    const o = C.read().undo;
    return o && o.v === 1 && o.prev && typeof o.prev === 'object' && !Array.isArray(o.prev) ? o : null;
  }
  function clearBackup() { return C.update((o) => { o.undo = null; }); }
  function backupKeys(names) {
    const cur = read(), prev = {};
    (Array.isArray(names) ? names : []).map(norm).filter((n) => NAME_RE.test(n)).forEach((n) => {
      prev[n] = typeof cur[n] === 'string' ? cur[n] : null;
    });
    const count = Object.keys(prev).length;
    if (!count) { clearBackup(); return 0; }
    if (!C.update((o) => { o.undo = { v: 1, at: Date.now(), prev }; })) return -1;   // -1 = no room
    return count;
  }
  function backupInfo() {
    const b = readUndo();
    if (!b) return null;
    const names = Object.keys(b.prev).filter((n) => NAME_RE.test(n)).sort();
    return names.length ? { count: names.length, names, at: +b.at || 0 } : null;
  }
  function restoreBackup() {
    const b = readUndo();
    if (!b) return 0;
    const o = read();
    let n = 0;
    Object.keys(b.prev).forEach((k) => {
      if (!NAME_RE.test(k)) return;
      const v = b.prev[k];
      if (typeof v === 'string' && v) o[k] = v; else delete o[k];   // exact old value (no trim), or gone again
      n++;
    });
    restoring = true;
    const ok = C.update((rec) => { rec.keys = o; rec.undo = null; });
    restoring = false;
    if (ok && n) emit('', null); // preserve the bulk-restore notification contract
    return ok ? n : 0;
  }

  // H138b: preserve the public opener and legacy SETTINGS_URL constant, but target the new app.
  const SELF = (document.currentScript && document.currentScript.src) || location.href;
  const SETTINGS_URL = new URL('../../apps/system/settings/', SELF).href;
  const API_KEYS_URL = new URL('../../apps/system/api-keys/', SELF).href;
  function open(name) {
    const n = norm(name);
    const hash = 'keys' + (n ? '/' + encodeURIComponent(n) : '');
    // Already in the editor: update its row, never open another copy or route to Settings.
    const here = new URL(location.href);
    const app = new URL(API_KEYS_URL);
    if (here.origin === app.origin && (here.pathname === app.pathname || here.pathname === app.pathname + 'index.html')) {
      location.hash = hash;
      return true;
    }
    try {
      const host = window.top || window;
      if (host.__hubOpenApp && host.__hubOpenApp('apps/system/api-keys/', { hash })) return true;
    } catch (_) { /* cross-origin host: keep standalone behavior */ }
    window.open(API_KEYS_URL + '#' + hash, '_blank', 'noopener');
    return true;
  }

  // Other tabs / frames changed the store: report the names whose value changed
  let last = JSON.stringify(read());
  C.onChange(() => {
    const prev = JSON.parse(last);
    const now = read();
    last = JSON.stringify(now);
    const changed = Array.from(new Set(Object.keys(prev).concat(Object.keys(now)))).filter((k) => prev[k] !== now[k]);
    if (restoring) return;
    if (changed.length === 1) emit(changed[0], typeof now[changed[0]] === 'string' && now[changed[0]] !== '');
    else if (changed.length > 1) emit('', null);
  });
  listeners.add(() => { last = JSON.stringify(read()); });   // keep the diff base fresh after our own writes

  // window.HubKeys = { get, set, remove, has, list, open, onChange, KNOWN, STORE, SETTINGS_URL };   // (before H29.3)
  window.HubKeys = { get, set, remove, has, list, open, onChange, KNOWN, STORE, SETTINGS_URL, API_KEYS_URL,
    backupKeys, backupInfo, restoreBackup, clearBackup, UNDO };   // H29.3
})();
