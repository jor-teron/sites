/* ============================================================
   FILE: mybookmark_store.js
   PROJECT: MyBookmark
   ROLE: Storage — the only file that touches IndexedDB, so it can be swapped
         (e.g. for Hub Drive) without changing the rest.
   API (all return Promises):
     MBStore.open()          → this
     MBStore.all()           → [node]
     MBStore.put(nodes)      → saves / replaces nodes (array)
     MBStore.del(ids)        → removes nodes by id (array)
     MBStore.getMeta(k) / setMeta(k, v)
   node = {id, type:'folder'|'bm', parent, title, url?, added?, icon?, order, dup?}
   ============================================================ */
const MBStore = (() => {
  const C = MB_CONFIG.db;
  let db = null;
  const req = (r) => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  const tx = (stores, mode) => db.transaction(stores, mode);
  const done = (t) => new Promise((ok, no) => { t.oncomplete = () => ok(); t.onerror = () => no(t.error); t.onabort = () => no(t.error || new Error('aborted')); });

  async function open() {
    if (db) return api;
    db = await new Promise((ok, no) => {
      const r = indexedDB.open(C.name, C.version);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains(C.nodes)) d.createObjectStore(C.nodes, { keyPath: 'id' });
        if (!d.objectStoreNames.contains(C.meta)) d.createObjectStore(C.meta);
      };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => no(r.error || new Error('IndexedDB is not available'));
    });
    return api;
  }
  async function all() { return req(tx(C.nodes, 'readonly').objectStore(C.nodes).getAll()); }
  async function put(nodes) {
    if (!nodes.length) return;
    const t = tx(C.nodes, 'readwrite'), s = t.objectStore(C.nodes);
    nodes.forEach((n) => s.put(n));
    return done(t);
  }
  async function del(ids) {
    if (!ids.length) return;
    const t = tx(C.nodes, 'readwrite'), s = t.objectStore(C.nodes);
    ids.forEach((id) => s.delete(id));
    return done(t);
  }
  async function getMeta(k) { return req(tx(C.meta, 'readonly').objectStore(C.meta).get(k)); }
  async function setMeta(k, v) { const t = tx(C.meta, 'readwrite'); t.objectStore(C.meta).put(v, k); return done(t); }
  const api = { open, all, put, del, getMeta, setMeta };
  return api;
})();
