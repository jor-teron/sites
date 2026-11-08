/**
 * H134c: custom AI providers ("services") the user adds in Settings > API Keys, without code edits.
 * Stored only in this browser: HubCredentials providers section (single sites-hub.credentials record), list of
 *   { id: 'svc_<base36 time><random>', label, type: 'openai' | 'gemini', key, endpoint, created }
 * Four user fields only (Label, Provider type, API key, API endpoint). No model: apps pick models.
 * id is generated once at creation and never changes; label is display text only (rename never breaks callers).
 * Never in the profile file or a profile sync (hub_profile.js EXCLUDE 'providers', H134c).
 * Loaded by the Hub (hub_core.js 'link' part, before hub_api.js) and by Settings opened on its own.
 * Apps are same-origin iframes: window.top.HubProviders.
 *   HubProviders.list()            -> [{ id, label, type }]  (never key or endpoint)
 *   HubProviders.has(id)           -> boolean
 *   HubProviders.info(id)          -> { id, label, type, endpoint, hasKey } | null   (Settings rows; no key)
 *   HubProviders.add({label, type, key, endpoint})   -> id   (throws a plain Error on bad input; message has no key)
 *   HubProviders.update(id, {label?, type?, key?, endpoint?}) -> true   (key '' / undefined = keep the saved key;
 *                                                                        key null = remove it)
 *   HubProviders.remove(id)        -> true when it was there
 *   HubProviders.secret(id)        -> Promise<{ type, endpoint, key } | null>   HubAPI / Settings Test only
 *   HubProviders.onChange(fn)      fn({ id }) on every change here or in another tab ('' = several). Returns unsubscribe.
 *   HubProviders.open(id)          opens Settings > API Keys at that service row (#keys/<id>)
 *   HubProviders.TYPES             [{ type: 'openai', label: 'OpenAI-compatible' }, { type: 'gemini', label: 'Gemini' }]
 *   HubProviders.GEMINI_DEFAULT    'https://generativelanguage.googleapis.com/v1beta' (Gemini endpoint when left empty)
 * Readme: hub/hubapi.readme.md (Custom services).
 */
(function () {
  'use strict';
  if (window.HubProviders) return;
  const C = window.HubCredentials;
  if (!C) throw new Error('HubProviders requires hub_credentials.js.');
  const STORE = C.STORE;
  const ID_RE = /^svc_[a-z0-9]{6,40}$/;
  const TYPES = [{ type: 'openai', label: 'OpenAI-compatible' }, { type: 'gemini', label: 'Gemini' }];
  const GEMINI_DEFAULT = 'https://generativelanguage.googleapis.com/v1beta';
  const listeners = new Set();

  function clean(r) {
    if (!r || typeof r !== 'object' || !ID_RE.test(r.id) || !TYPES.some((t) => t.type === r.type)) return null;
    return { id: r.id, label: String(r.label || r.id).slice(0, 60), type: r.type,
      key: typeof r.key === 'string' ? r.key : '', endpoint: typeof r.endpoint === 'string' ? r.endpoint : '', created: +r.created || 0 };
  }
  function read() { return C.read().providers.map(clean).filter(Boolean); }
  function write(providers) { return C.update((o) => { o.providers = providers; }); }
  function emit(id) { listeners.forEach((fn) => { try { fn({ id }); } catch (_) { /* do not log listener errors */ } }); }
  function newId() {
    let r = '';
    try { const b = new Uint8Array(6); crypto.getRandomValues(b); b.forEach((x) => { r += (x % 36).toString(36); }); }
    catch (_) { r = Math.random().toString(36).slice(2, 8); }
    return 'svc_' + Date.now().toString(36) + r;
  }
  function label(v) {
    const s = String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
    if (!s) throw new Error('Add a label.');
    if (s.length > 60) throw new Error('Label is too long (60 characters at most).');
    return s;
  }
  function type(v) {
    const t = String(v || '').trim().toLowerCase();
    if (!TYPES.some((x) => x.type === t)) throw new Error('Provider type must be OpenAI-compatible or Gemini.');
    return t;
  }
  function endpoint(v, t) {
    const s = String(v == null ? '' : v).trim();
    if (!s) { if (t === 'gemini') return ''; throw new Error('Add the API endpoint, e.g. https://api.example.com/v1'); }
    let u;
    try { u = new URL(s); } catch (_) { throw new Error('API endpoint is not a valid URL.'); }
    if (!/^https?:$/.test(u.protocol) || u.username || u.password || u.search || u.hash) {
      throw new Error('API endpoint must be http(s), without login, query (?…) or #. Put the key in the API key field.');
    }
    return u.href.replace(/\/+$/, '');
  }
  function key(v) {
    const s = String(v == null ? '' : v).trim();
    if (s.length > 4096 || /[\r\n]/.test(s)) throw new Error('API key looks wrong (one line, up to 4096 characters).');
    return s;
  }
  const pub = (r) => ({ id: r.id, label: r.label, type: r.type });

  function list() { return read().map(pub); }
  function has(id) { return read().some((r) => r.id === id); }
  function info(id) {
    const r = read().find((x) => x.id === id);
    return r ? { id: r.id, label: r.label, type: r.type, endpoint: r.endpoint, hasKey: !!r.key } : null;
  }
  function add(o = {}) {
    const t = type(o.type);
    const rec = { id: newId(), label: label(o.label), type: t, key: key(o.key), endpoint: endpoint(o.endpoint, t), created: Date.now() };
    const a = read();
    while (a.some((r) => r.id === rec.id)) rec.id = newId();
    a.push(rec);
    if (!write(a)) throw new Error('Could not save (browser storage full or blocked).');
    return rec.id;
  }
  function update(id, o = {}) {
    const a = read(), r = a.find((x) => x.id === id);
    if (!r) throw new Error('No such service.');
    if (o.label !== undefined) r.label = label(o.label);
    if (o.type !== undefined) r.type = type(o.type);
    if (o.endpoint !== undefined || o.type !== undefined) r.endpoint = endpoint(o.endpoint !== undefined ? o.endpoint : r.endpoint, r.type);
    if (o.key === null) r.key = '';
    else if (o.key !== undefined && String(o.key).trim()) r.key = key(o.key);
    if (!write(a)) throw new Error('Could not save (browser storage full or blocked).');
    return true;
  }
  function remove(id) {
    const a = read(), b = a.filter((r) => r.id !== id);
    if (a.length === b.length) return false;
    const ok = write(b);
    return ok;
  }
  function secret(id) {
    const r = read().find((x) => x.id === id);
    return Promise.resolve(r ? { type: r.type, endpoint: r.endpoint || (r.type === 'gemini' ? GEMINI_DEFAULT : ''), key: r.key } : null);
  }
  function onChange(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
  function open(id) {
    const H = window.HubKeys;
    if (H && typeof H.open === 'function') return H.open(id);   // same #keys/<name> deep link; ids are lowercase
    return false;
  }
  let last = JSON.stringify(read());
  C.onChange(() => {
    const now = read(), text = JSON.stringify(now);
    if (text === last) return;
    const prev = JSON.parse(last); last = text;
    const ids = new Set(prev.concat(now).map((r) => r.id));
    const changed = Array.from(ids).filter((id) => JSON.stringify(prev.find((r) => r.id === id)) !== JSON.stringify(now.find((r) => r.id === id)));
    emit(changed.length === 1 ? changed[0] : '');
  });

  window.HubProviders = Object.freeze({ list, has, info, add, update, remove, secret, onChange, open,
    TYPES: Object.freeze(TYPES.map((t) => Object.freeze(Object.assign({}, t)))), GEMINI_DEFAULT, STORE });
})();
