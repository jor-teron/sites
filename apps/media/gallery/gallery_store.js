/* Gallery store: settings in 'gallery-settings-v1' + last folder handle in IndexedDB (where supported). */
window.GAStore = (function () {
  const SKEY = 'gallery-settings-v1', DB = 'gallery-v1', OS = 'kv';
  const P = { theme: 'dark', cols: 'm', sort: 'date-desc', group: '1', kind: 'all', speed: '1', loop: '0' };
  try { Object.assign(P, JSON.parse(localStorage.getItem(SKEY) || '{}')); } catch (_) { /* */ }
  const save = () => { try { localStorage.setItem(SKEY, JSON.stringify(P)); } catch (_) { /* */ } };
  const canHandles = typeof window.showDirectoryPicker === 'function' && typeof indexedDB !== 'undefined';
  function db() {
    return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(OS); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  }
  async function tx(mode, fn) { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(OS, mode), r = fn(t.objectStore(OS)); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); }
  return {
    P, save, canHandles,
    async putFolder(h) { if (!canHandles) return; try { await tx('readwrite', (s) => s.put(h, 'folder')); } catch (_) { /* */ } },
    async getFolder() { if (!canHandles) return null; try { return (await tx('readonly', (s) => s.get('folder'))) || null; } catch (_) { return null; } },
    async clearFolder() { if (!canHandles) return; try { await tx('readwrite', (s) => s.delete('folder')); } catch (_) { /* */ } },
    /* must be called from a user gesture for the prompt to show */
    async permit(h) { const o = { mode: 'read' }; if ((await h.queryPermission(o)) === 'granted') return true; return (await h.requestPermission(o)) === 'granted'; },
  };
})();
