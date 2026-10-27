/*
 * Sound Recorder — IndexedDB 'sound-recorder-v1' (version 2).
 *   'rec'  (keyPath id): full record { id, name, date (ms), dur (s), mime, size, blob, peaks: Float32Array, pps }
 *   'meta' (keyPath id): same without blob, so the Recordings list never loads audio.
 * peaks = max |sample| per 1/pps s (0..1), computed once while recording or on import.
 * v1 -> v2: 'meta' is built from 'rec' inside the upgrade transaction ('rec' is only read, never changed);
 * if anything fails the upgrade aborts and the database stays at v1 with all recordings.
 */
const SRStore = (() => {
  let dbp = null, asked = false;
  const metaOf = (r) => { const m = Object.assign({}, r); delete m.blob; if (!m.size && r.blob) m.size = r.blob.size; return m; };
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open('sound-recorder-v1', 2);
      r.onupgradeneeded = () => {
        const d = r.result, t = r.transaction;
        const rec = d.objectStoreNames.contains('rec') ? t.objectStore('rec') : d.createObjectStore('rec', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('meta')) {
          const meta = d.createObjectStore('meta', { keyPath: 'id' });
          rec.openCursor().onsuccess = (e) => { const c = e.target.result; if (c) { meta.put(metaOf(c.value)); c.continue(); } };
        }
      };
      r.onsuccess = () => { const d = r.result; d.onversionchange = () => { d.close(); dbp = null; }; res(d); };
      r.onerror = () => { dbp = null; rej(r.error); };
      r.onblocked = () => { /* another tab has the old version open; it closes on versionchange */ };
    });
    return dbp;
  }
  function tx(stores, mode, fn) {
    return db().then((d) => new Promise((res, rej) => {
      const t = d.transaction(stores, mode), r = fn(t);
      t.oncomplete = () => res(r && r.result);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    }));
  }
  /* ask once for persistent storage so Android does not evict recordings when space is low */
  function persist() {
    if (asked) return; asked = true;
    try {
      const s = navigator.storage;
      if (s && s.persist && s.persisted) s.persisted().then((p) => (p ? null : s.persist())).catch(() => {});
    } catch (_) { /* not supported */ }
  }
  return {
    /* metadata only (no audio), newest first */
    all: () => tx('meta', 'readonly', (t) => t.objectStore('meta').getAll()).then((a) => (a || []).sort((x, y) => y.date - x.date)),
    /* full record with blob */
    get: (id) => tx('rec', 'readonly', (t) => t.objectStore('rec').get(id)),
    put: (rec) => tx(['rec', 'meta'], 'readwrite', (t) => { t.objectStore('meta').put(metaOf(rec)); return t.objectStore('rec').put(rec); }).then((v) => { persist(); return v; }),
    rename: (id, name) => tx(['rec', 'meta'], 'readwrite', (t) => {
      ['rec', 'meta'].forEach((n) => { const s = t.objectStore(n); s.get(id).onsuccess = (e) => { const v = e.target.result; if (v) { v.name = name; s.put(v); } }; });
    }),
    del: (id) => tx(['rec', 'meta'], 'readwrite', (t) => { t.objectStore('meta').delete(id); return t.objectStore('rec').delete(id); }),
  };
})();
