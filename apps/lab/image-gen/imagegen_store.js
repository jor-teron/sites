/* Image Gen gallery: IndexedDB 'imagegen-v1', store 'images' {id, ts, prompt, model, w, h, steps, blob,
   kind?: 'edit'|'up', src?: start-photo blob (edit), from?: source id (up)}. Keeps the newest 20. */
window.IGStore = (function () {
  const MAX = 20;
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open('imagegen-v1', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('images', { keyPath: 'id', autoIncrement: true });
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  const tx = (mode, fn) => db().then((d) => new Promise((res, rej) => {
    const t = d.transaction('images', mode), s = t.objectStore('images'); let out;
    const q = fn(s); if (q) q.onsuccess = () => { out = q.result; };
    t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  }));
  async function list() { const all = (await tx('readonly', (s) => s.getAll())) || []; return all.sort((a, b) => b.ts - a.ts); }
  async function add(rec) {
    const id = await tx('readwrite', (s) => s.add(Object.assign({ ts: Date.now() }, rec)));
    const all = await list();
    for (const r of all.slice(MAX)) await del(r.id);
    return id;
  }
  function del(id) { return tx('readwrite', (s) => s.delete(id)); }
  function get(id) { return tx('readonly', (s) => s.get(id)); }
  return { list, add, del, get, MAX };
})();
