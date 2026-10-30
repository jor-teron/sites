// Browser-storage file helper. IndexedDB first, localStorage fallback.
// DB name 'jor-os' keeps it apart from the Hub's storage.
const DB_NAME = 'jor-os';
const STORE = 'files';
const LS_PREFIX = 'jor-os:file:';

let backend = null; // 'indexeddb' | 'localstorage'
let db = null;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
  });
}

export async function init() {
  if (backend) return backend;
  try {
    if (!('indexedDB' in globalThis)) throw new Error('no IndexedDB');
    db = await openDb();
    backend = 'indexeddb';
  } catch {
    backend = 'localstorage';
  }
  return backend;
}

export async function writeFile(path, text) {
  await init();
  if (backend === 'indexeddb') return void (await tx('readwrite', s => s.put(String(text), path)));
  localStorage.setItem(LS_PREFIX + path, String(text));
}

export async function readFile(path) {
  await init();
  if (backend === 'indexeddb') return (await tx('readonly', s => s.get(path))) ?? null;
  return localStorage.getItem(LS_PREFIX + path);
}

export async function listFiles(prefix = '') {
  await init();
  if (backend === 'indexeddb') {
    const keys = await tx('readonly', s => s.getAllKeys());
    return keys.filter(k => k.startsWith(prefix)).sort();
  }
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith(LS_PREFIX + prefix)) out.push(k.slice(LS_PREFIX.length));
  }
  return out.sort();
}

export async function deleteFile(path) {
  await init();
  if (backend === 'indexeddb') return void (await tx('readwrite', s => s.delete(path)));
  localStorage.removeItem(LS_PREFIX + path);
}
