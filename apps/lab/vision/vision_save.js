/* Vision — the single save module: copy/download of answers and the recent history
   (IndexedDB 'vision-v1', store 'chats' {id, ts, mode, model, img (JPEG blob), messages}). Keeps the newest 20. */
window.VSSave = (function () {
  const MAX = 20;
  let dbp = null;
  function db() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open('vision-v1', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('chats', { keyPath: 'id', autoIncrement: true });
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  const tx = (mode, fn) => db().then((d) => new Promise((res, rej) => {
    const t = d.transaction('chats', mode), s = t.objectStore('chats'); let out;
    const q = fn(s); if (q) q.onsuccess = () => { out = q.result; };
    t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  }));
  async function list() { const all = (await tx('readonly', (s) => s.getAll())) || []; return all.sort((a, b) => b.ts - a.ts); }
  /* insert or update (rec.id set) one chat; trims to the newest MAX */
  async function put(rec) {
    rec.ts = Date.now(); if (rec.id == null) delete rec.id;
    const id = await tx('readwrite', (s) => s.put(rec));
    const all = await list();
    for (const r of all.slice(MAX)) await del(r.id);
    return id;
  }
  function del(id) { return tx('readwrite', (s) => s.delete(id)); }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (_) { /* fall back */ }
    const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (_) { /* */ } t.remove();
    return ok;
  }
  function download(text, name) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' })), a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  return { list, put, del, copy, download, MAX };
})();
