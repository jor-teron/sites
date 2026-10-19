/*
 * Thumbnail cache (shared/fs/thumbs_store.js) — small preview pictures for the Files app
 * (apps/tools/files/files_thumbs.js), kept in IndexedDB 'sites-thumbs' / 'thumbs' (never a
 * folder, so no file listing can show it). Cleared from Files' menu or Settings → Windows.
 *
 * A record: { key, blob (webp / png, null = "no preview possible" — not tried again), dur
 *   (video seconds), bytes, at (last used) }. key = drive|path|name|size|modified, so a changed
 *   file gets a new key (= fresh thumbnail). Total kept under CAP (50 MB): the least recently
 *   used go first (down to 80 %).
 *
 * API window.ThumbStore: get(key) → Promise<record | null>, put(record), clear() → Promise (tells
 *   every open page: BroadcastChannel 'sites-thumbs'), onClear(fn), stats() → Promise<{ count, bytes }>, CAP
 */
(function () {
  'use strict';
  const DB = 'sites-thumbs', STORE = 'thumbs', CAP = 50 * 1024 * 1024, DAY = 864e5;
  let dbp = null, trimT = 0;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { const s = r.result.createObjectStore(STORE, { keyPath: 'key' }); s.createIndex('at', 'at'); };
      r.onsuccess = () => { const d = r.result; d.onversionchange = () => { d.close(); dbp = null; }; res(d); };
      r.onerror = () => { dbp = null; rej(r.error); };
    });
    return dbp;
  }
  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function tx(mode, fn) {
    const d = await db(); const t = d.transaction(STORE, mode); const out = fn(t.objectStore(STORE));
    await new Promise((res, rej) => { t.oncomplete = res; t.onerror = t.onabort = () => rej(t.error); });
    return out;
  }
  async function get(key) {
    try {
      const d = await db();
      const rec = await req(d.transaction(STORE).objectStore(STORE).get(key));
      if (rec && Date.now() - rec.at > DAY) { rec.at = Date.now(); put(rec, true); }   // keep "recently used" roughly right
      return rec || null;
    } catch (_) { return null; }
  }
  async function put(rec, noTrim) {
    rec.at = rec.at || Date.now();
    rec.bytes = rec.blob ? rec.blob.size : 0;
    try { await tx('readwrite', (s) => s.put(rec)); } catch (_) { return; }
    if (!noTrim) { clearTimeout(trimT); trimT = setTimeout(trim, 1500); }
  }
  async function trim() {
    try {
      const d = await db();
      const all = [];
      await new Promise((res, rej) => {
        const c = d.transaction(STORE).objectStore(STORE).index('at').openCursor();
        c.onsuccess = () => { const k = c.result; if (!k) { res(); return; } all.push([k.value.key, k.value.bytes || 0]); k.continue(); };
        c.onerror = () => rej(c.error);
      });
      let total = all.reduce((a, x) => a + x[1], 0);
      if (total <= CAP) return;
      const drop = [];
      for (const [k, b] of all) { if (total <= CAP * 0.8) break; drop.push(k); total -= b; }   // oldest first
      await tx('readwrite', (s) => drop.forEach((k) => s.delete(k)));
    } catch (_) { /* ignore */ }
  }
  // "cache cleared" reaches every open page (Settings clears it while Files is open)
  const fns = [];
  let bc = null;
  try { bc = new BroadcastChannel('sites-thumbs'); bc.onmessage = (e) => { if (e.data && e.data.type === 'cleared') fns.forEach((f) => f()); }; } catch (_) { /* old browser */ }
  async function clear() {
    await tx('readwrite', (s) => s.clear());
    fns.forEach((f) => f());
    try { if (bc) bc.postMessage({ type: 'cleared' }); } catch (_) { /* closed */ }
  }
  const onClear = (fn) => { fns.push(fn); };
  async function stats() {
    let count = 0, bytes = 0;
    try {
      const d = await db();
      await new Promise((res, rej) => {
        const c = d.transaction(STORE).objectStore(STORE).openCursor();
        c.onsuccess = () => { const k = c.result; if (!k) { res(); return; } count++; bytes += k.value.bytes || 0; k.continue(); };
        c.onerror = () => rej(c.error);
      });
    } catch (_) { /* none */ }
    return { count, bytes };
  }
  window.ThumbStore = { get, put, clear, onClear, stats, trim, CAP };
})();
