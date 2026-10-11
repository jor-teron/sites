/*
 * Paper Scan — ps_store.js
 * Saved data: IndexedDB 'paper-scan' / store 'pages' keeps each page record
 * {id, src (original photo Blob), out (processed JPEG Blob), w, h, corners, rot, filter, q}.
 * localStorage 'paper-scan-order' = page id order, 'paper-scan-quality' = preset.
 * Every call fails soft (private mode / blocked storage → pages only live in memory).
 */
(function () {
  'use strict';
  const PS = window.PS = window.PS || {};
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('No IndexedDB'));
      const r = indexedDB.open('paper-scan', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('pages', { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then((d) => new Promise((res, rej) => {
      const t = d.transaction('pages', mode), s = t.objectStore('pages');
      const r = fn(s);
      t.oncomplete = () => res(r && r.result);
      t.onerror = () => rej(t.error);
    })).catch((e) => { console.warn('Paper Scan store', e); return null; });
  }
  function lsGet(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* full/blocked */ } }

  PS.store = {
    put: (p) => tx('readwrite', (s) => s.put(p)),
    del: (id) => tx('readwrite', (s) => s.delete(id)),
    clear: () => { lsSet('paper-scan-order', []); return tx('readwrite', (s) => s.clear()); },
    all: () => tx('readonly', (s) => s.getAll()).then((list) => {
      list = list || [];
      const order = lsGet('paper-scan-order', []);
      const pos = (id) => { const i = order.indexOf(id); return i < 0 ? 1e9 : i; };
      return list.sort((a, b) => pos(a.id) - pos(b.id));
    }),
    order: (ids) => lsSet('paper-scan-order', ids),
    quality: (v) => { if (v) lsSet('paper-scan-quality', v); return lsGet('paper-scan-quality', 'medium'); }
  };
})();
