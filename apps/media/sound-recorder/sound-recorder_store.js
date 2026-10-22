/*
 * Sound Recorder — IndexedDB store 'sound-recorder-v1', object store 'rec' (keyPath id).
 * Record: { id, name, date (ms), dur (s), mime, size, blob, peaks: Float32Array, pps }
 * peaks = max |sample| per 1/pps s (0..1), computed once while recording or on import.
 */
const SRStore = (() => {
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open('sound-recorder-v1', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('rec', { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then((d) => new Promise((res, rej) => {
      const t = d.transaction('rec', mode), r = fn(t.objectStore('rec'));
      t.oncomplete = () => res(r && r.result);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    }));
  }
  return {
    all: () => tx('readonly', (s) => s.getAll()).then((a) => (a || []).sort((x, y) => y.date - x.date)),
    get: (id) => tx('readonly', (s) => s.get(id)),
    put: (rec) => tx('readwrite', (s) => s.put(rec)),
    del: (id) => tx('readwrite', (s) => s.delete(id)),
  };
})();
