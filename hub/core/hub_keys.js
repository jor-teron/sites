/**
 * Hub — one key store for API keys (H28). Every app gets keys automatically: no per-app prompt,
 * no access list. Keys stay only in this browser (localStorage 'sites-hub.keys', JSON {name: value});
 * (before H29.2b:) nothing is synced to a joined phone and nothing is sent anywhere by the Hub itself.
 * H29.2b: nothing is synced to a joined phone and nothing is sent anywhere by the Hub itself, except when the
 *   profile sync 'Include API keys' tick (Settings › Devices › Send profile, H29.2) is used: then the keys go only
 *   to the one picked device over the existing Connect Code link, masked in its preview, applied only as chosen there.
 * Loaded by hub.html (window.HubKeys) and by the Settings app (Settings → API Keys, its own copy
 * when Settings is opened on its own). Apps are same-origin iframes, so they call window.top.HubKeys:
 *   HubKeys.get(name)          → Promise<string|null>
 *   HubKeys.set(name, value)   → true when saved (empty value = remove)
 *   HubKeys.remove(name)       → true when it was there
 *   HubKeys.has(name)          → boolean
 *   HubKeys.list()             → ['gemini', 'tavily', …] names only, never values
 *   HubKeys.open(name)         opens Settings → API Keys at that row (#keys/<name>)
 *   HubKeys.onChange(fn)       fn({name, present}) on every change (this page or another tab /
 *                              frame, via the 'storage' event); name '' = several changed. Returns unsubscribe().
 *   HubKeys.KNOWN              [{name, label, kind, url, hint}] the keys Settings shows a row for
 * H29.3 Undo last sync (profile sync backup, Settings › Devices › Undo last sync). The key store has no protected or
 *   encrypted space (H28: plain localStorage), so the backup of the keys a sync is about to change is kept in its
 *   OWN entry next to it, localStorage 'sites-hub.keysUndo' = { v: 1, at, prev: { name: old value | null } }
 *   (null = the key did not exist, so Undo removes it). Only this file reads or writes that entry, and its API
 *   gives names and counts only, never a value. It is never in the profile (hub_profile.js EXCLUDE, and 'keys' in
 *   the name). Only the last backup is kept (a new one replaces it).
 *   HubKeys.backupKeys(names)  → count   snapshot of those names (replaces the last backup; [] = clear)
 *   HubKeys.backupInfo()       → null | { count, names, at }   (names only)
 *   HubKeys.restoreBackup()    → count   puts the exact old values back (removes the ones that were new), clears
 *                                        the backup, fires onChange('', null) so Settings › API Keys repaints
 *   HubKeys.clearBackup()
 * Names: lowercase letters, digits, '_', '-', '.' (1–40). Known: tavily, gemini, openai_base,
 * openai_key, ollama_url, groq, openrouter, deepseek, xai (H28.1), gvision (H28.2); anything else is a custom key. Standalone app fallback:
 *   const k = window.top?.HubKeys ? await window.top.HubKeys.get('tavily') : localKey;
 * Readme: hub/keys.readme.md.
 */
(function () {
  'use strict';
  if (window.HubKeys) return;
  const STORE = 'sites-hub.keys';
  const NAME_RE = /^[a-z0-9][a-z0-9_.-]{0,39}$/;
  const KNOWN = [
    { name: 'tavily', label: 'Tavily', kind: 'key', url: 'https://app.tavily.com', hint: 'Web search for Agent / News. Free: 1,000 credits a month.' },
    { name: 'gemini', label: 'Google Gemini', kind: 'key', url: 'https://aistudio.google.com/apikey', hint: 'Gemini models. Free tier with per-model limits.' },
    { name: 'openai_base', label: 'OpenAI-compatible base URL', kind: 'url', url: 'https://platform.openai.com/docs/api-reference', hint: 'e.g. https://api.openai.com/v1, https://api.groq.com/openai/v1, https://openrouter.ai/api/v1' },
    { name: 'openai_key', label: 'OpenAI-compatible key', kind: 'key', url: 'https://platform.openai.com/api-keys', hint: 'The key for the base URL above.' },
    { name: 'ollama_url', label: 'Ollama URL', kind: 'url', url: 'https://ollama.com/download', hint: 'Local models, e.g. http://localhost:11434 (no key).' },
    // H28.1
    { name: 'groq', label: 'Groq', kind: 'key', url: 'https://console.groq.com/keys', hint: 'Fast open models (Llama, Qwen, gpt-oss). Free plan with per-model limits.' },
    { name: 'openrouter', label: 'OpenRouter', kind: 'key', url: 'https://openrouter.ai/settings/keys', hint: 'Hundreds of models behind one key; some :free models.' },
    { name: 'deepseek', label: 'DeepSeek', kind: 'key', url: 'https://platform.deepseek.com/api_keys', hint: 'DeepSeek models. Paid (prepaid balance).' },
    { name: 'xai', label: 'Grok API (xAI)', kind: 'key', url: 'https://console.x.ai', hint: 'Grok models from xAI. Paid per token.' },
    // H28.2
    { name: 'gvision', label: 'Google Cloud Vision', kind: 'key', url: 'https://console.cloud.google.com/apis/credentials', hint: 'Image labels and text (OCR). Needs a billing account; first 1,000 units a month free.' },
  ];
  const listeners = new Set();

  function read() {
    try {
      const o = JSON.parse(localStorage.getItem(STORE) || '{}');
      return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    } catch (_) { return {}; }
  }
  function write(o) {
    try {
      if (Object.keys(o).length) localStorage.setItem(STORE, JSON.stringify(o));
      else localStorage.removeItem(STORE);
      return true;
    } catch (_) { return false; }
  }
  const norm = (name) => String(name == null ? '' : name).trim().toLowerCase();
  function emit(name, present) {
    listeners.forEach((fn) => { try { fn({ name, present }); } catch (e) { console.warn('HubKeys listener', e); } });
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
    if (!v) return remove(n), true;
    const o = read();
    if (o[n] === v) return true;
    o[n] = v;
    const ok = write(o);
    if (ok) emit(n, true);
    return ok;
  }
  function remove(name) {
    const n = norm(name), o = read();
    if (!(n in o)) return false;
    delete o[n];
    const ok = write(o);
    if (ok) emit(n, false);
    return ok;
  }
  function onChange(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  /* H29.3: backup of the keys a profile sync changes (values never leave this file) */
  const UNDO = 'sites-hub.keysUndo';
  function readUndo() {
    try {
      const o = JSON.parse(localStorage.getItem(UNDO) || 'null');
      return o && o.v === 1 && o.prev && typeof o.prev === 'object' && !Array.isArray(o.prev) ? o : null;
    } catch (_) { return null; }
  }
  function clearBackup() { try { localStorage.removeItem(UNDO); } catch (_) { /* blocked */ } }
  function backupKeys(names) {
    const cur = read(), prev = {};
    (Array.isArray(names) ? names : []).map(norm).filter((n) => NAME_RE.test(n)).forEach((n) => {
      prev[n] = typeof cur[n] === 'string' ? cur[n] : null;
    });
    const count = Object.keys(prev).length;
    if (!count) { clearBackup(); return 0; }
    try { localStorage.setItem(UNDO, JSON.stringify({ v: 1, at: Date.now(), prev })); } catch (_) { return -1; }   // -1 = no room
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
    const ok = write(o);
    clearBackup();
    if (ok && n) emit('', null);   // several may have changed: every listener re-reads (Settings › API Keys rows)
    return ok ? n : 0;
  }

  // Settings app url, relative to this script (hub/core/hub_keys.js → apps/system/settings/)
  const SELF = (document.currentScript && document.currentScript.src) || location.href;
  const SETTINGS_URL = new URL('../../apps/system/settings/', SELF).href;
  function open(name) {
    const n = norm(name);
    const hash = 'keys' + (n ? '/' + encodeURIComponent(n) : '');
    // Inside the Hub: the normal Hub way (window in Desktop mode, the frame in Phone mode)
    if (window.__hubOpenApp && window.__hubOpenApp('apps/system/settings/', { hash })) return true;
    // This page is Settings itself (opened on its own): just move to the row
    if (location.href.split('#')[0].indexOf(SETTINGS_URL) === 0) { location.hash = hash; return true; }
    window.open(SETTINGS_URL + '#' + hash, '_blank', 'noopener');
    return true;
  }

  // Other tabs / frames changed the store: report the names whose value changed
  let last = JSON.stringify(read());
  window.addEventListener('storage', (e) => {
    if (e.key !== null && e.key !== STORE) return;
    const prev = (() => { try { return JSON.parse(last) || {}; } catch (_) { return {}; } })();
    const now = read();
    last = JSON.stringify(now);
    const changed = Array.from(new Set(Object.keys(prev).concat(Object.keys(now)))).filter((k) => prev[k] !== now[k]);
    if (changed.length === 1) emit(changed[0], typeof now[changed[0]] === 'string');
    else if (changed.length > 1 || e.key === null) emit('', null);
  });
  listeners.add(() => { last = JSON.stringify(read()); });   // keep the diff base fresh after our own writes

  // window.HubKeys = { get, set, remove, has, list, open, onChange, KNOWN, STORE, SETTINGS_URL };   // (before H29.3)
  window.HubKeys = { get, set, remove, has, list, open, onChange, KNOWN, STORE, SETTINGS_URL,
    backupKeys, backupInfo, restoreBackup, clearBackup, UNDO };   // H29.3
})();
