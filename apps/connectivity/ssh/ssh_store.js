/*
 * SSH — S3 storage: known_hosts and saved hosts in localStorage. No DOM, so node can unit-test it.
 *   ssh-known-hosts-v1: { "host:port": { alg, fp: "SHA256:…", first, last } }  (times: ms since epoch)
 *   ssh-hosts-v1:       [ { id, name, user, host, port } ]  (never a password)
 * Store.make(storage, now) -> { known: { check, trust, seen, forget, forgetAll, list }, hosts: { list, save, remove, find } }
 * Store.backoff(n) -> seconds before auto-reconnect try n+1, or null after the last try.
 */
(() => {
  const KH = 'ssh-known-hosts-v1', HS = 'ssh-hosts-v1';
  const BACKOFF = [1, 2, 5, 10, 30];

  const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
  function hostId(host, port) {
    const h = str(host, 255).toLowerCase().replace(/^\[|\]$/g, '');
    return (h.includes(':') ? '[' + h + ']' : h) + ':' + (parseInt(port, 10) || 22);
  }
  const backoff = (n) => (n >= 0 && n < BACKOFF.length ? BACKOFF[n] : null);

  function make(storage, now) {
    now = now || (() => Date.now());
    const mem = {}; /* used when localStorage is unavailable (private mode) */
    function read(k, def) {
      let raw = null;
      try { raw = storage.getItem(k); } catch (_) { raw = null; }
      if (raw == null) return k in mem ? JSON.parse(mem[k]) : def;
      try { return JSON.parse(raw); } catch (_) { return def; }
    }
    function write(k, v) {
      const s = JSON.stringify(v); mem[k] = s;
      try { storage.setItem(k, s); } catch (_) { /* keep the in-memory copy */ }
    }

    /* ---- known_hosts ---- */
    const validKey = (e) => e && typeof e === 'object' && typeof e.fp === 'string' && /^SHA256:/.test(e.fp) && typeof e.alg === 'string';
    function kmap() {
      const m = read(KH, {});
      const out = {};
      if (m && typeof m === 'object' && !Array.isArray(m)) Object.keys(m).forEach((id) => { if (validKey(m[id])) out[id] = m[id]; });
      return out;
    }
    const known = {
      /* -> { status: 'known' | 'new' | 'changed', entry } */
      check(id, info) {
        const e = kmap()[id];
        if (!e) return { status: 'new', entry: null };
        return { status: e.fp === info.fp && e.alg === info.alg ? 'known' : 'changed', entry: e };
      },
      trust(id, info) {
        const m = kmap(), t = now(), old = m[id];
        m[id] = { alg: str(info.alg, 64), fp: str(info.fp, 128), first: old && old.fp === info.fp && old.alg === info.alg ? old.first : t, last: t };
        write(KH, m);
        return m[id];
      },
      seen(id) { const m = kmap(); if (m[id]) { m[id].last = now(); write(KH, m); } },
      forget(id) { const m = kmap(); delete m[id]; write(KH, m); },
      forgetAll() { write(KH, {}); },
      list() { const m = kmap(); return Object.keys(m).sort().map((id) => Object.assign({ id }, m[id])); },
    };

    /* ---- saved hosts ---- */
    /* clean(h) -> { name, user, host, port } or a string error. Only these fields are ever stored. */
    function clean(h) {
      h = h || {};
      const user = str(h.user, 64), host = str(h.host, 255).replace(/^\[|\]$/g, ''), port = parseInt(h.port, 10) || 22;
      if (!host || /[\s/@]/.test(host)) return 'Enter a valid host (name or IP address).';
      if (!user || /[\s@:]/.test(user)) return 'Enter a valid user name.';
      if (port < 1 || port > 65535) return 'Port must be 1–65535.';
      return { name: str(h.name, 60) || user + '@' + host, user, host, port: String(port) };
    }
    function hlist() {
      const a = read(HS, []);
      if (!Array.isArray(a)) return [];
      return a.map((h) => { const c = clean(h); return typeof c === 'string' || !h.id ? null : Object.assign({ id: String(h.id) }, c); }).filter(Boolean);
    }
    let seq = 0;
    const hosts = {
      list: hlist,
      find(user, host, port) {
        const id = hostId(host, port);
        return hlist().find((h) => h.user === str(user, 64) && hostId(h.host, h.port) === id) || null;
      },
      /* save(h) adds (no id) or updates (id). Returns the saved entry or a string error. */
      save(h) {
        const c = clean(h);
        if (typeof c === 'string') return c;
        const a = hlist();
        const i = h.id ? a.findIndex((x) => x.id === h.id) : -1;
        const e = Object.assign({ id: i >= 0 ? a[i].id : now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 6) }, c);
        if (i >= 0) a[i] = e; else a.push(e);
        write(HS, a);
        return e;
      },
      remove(id) { write(HS, hlist().filter((h) => h.id !== id)); },
    };

    return { known, hosts, clean };
  }

  const api = { make, hostId, backoff, BACKOFF, KEYS: { known: KH, hosts: HS } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else SSH.Store = Object.assign(api, (() => { try { return make(localStorage); } catch (_) { return make({ getItem() { return null; }, setItem() { throw new Error('no storage'); } }); } })());
})();
