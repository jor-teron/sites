// Browser-storage file helper. IndexedDB first, localStorage fallback.
// DB name 'jor-os' keeps it apart from the Hub's storage.
// Files are keys like '/home/a.txt'. Folders are marker keys ending in '/'.
const DB_NAME = 'jor-os';
const STORE = 'files';
const LS_PREFIX = 'jor-os:file:';
const DIR = '\u0000dir'; // value stored for folder markers

let backend = null; // 'indexeddb' | 'localstorage'
let db = null;

// ---- low-level key/value layer ----
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

const kv = {
  async get(k) {
    if (backend === 'indexeddb') return (await tx('readonly', s => s.get(k))) ?? null;
    return localStorage.getItem(LS_PREFIX + k);
  },
  async put(k, v) {
    if (backend === 'indexeddb') return void (await tx('readwrite', s => s.put(v, k)));
    localStorage.setItem(LS_PREFIX + k, v);
  },
  async del(k) {
    if (backend === 'indexeddb') return void (await tx('readwrite', s => s.delete(k)));
    localStorage.removeItem(LS_PREFIX + k);
  },
  async keys() {
    if (backend === 'indexeddb') return tx('readonly', s => s.getAllKeys());
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith(LS_PREFIX)) out.push(k.slice(LS_PREFIX.length));
    }
    return out;
  },
};

// ---- paths ----
export function normalize(path) {
  const parts = [];
  for (const p of String(path).split('/')) {
    if (!p || p === '.') continue;
    if (p === '..') parts.pop(); else parts.push(p);
  }
  return '/' + parts.join('/');
}
const dirKey = p => (p === '/' ? '/' : p + '/');

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

// ---- file API (OS1-compatible) ----
export async function writeFile(path, text) {
  await init();
  const p = normalize(path);
  await mkdir(p.slice(0, p.lastIndexOf('/')) || '/');
  await kv.put(p, String(text));
}

export async function readFile(path) {
  await init();
  return kv.get(normalize(path));
}

export async function deleteFile(path) {
  await init();
  await kv.del(normalize(path));
}

// ---- folders ----
export async function mkdir(path) {
  await init();
  const p = normalize(path);
  if (p === '/') return;
  let cur = '';
  for (const part of p.slice(1).split('/')) {
    cur += '/' + part;
    await kv.put(dirKey(cur), DIR);
  }
}

export async function exists(path) {
  await init();
  const p = normalize(path);
  if (p === '/') return true;
  return (await kv.get(p)) !== null || (await kv.get(dirKey(p))) !== null;
}

// Direct children of a folder: [{ name, path, type: 'file' | 'dir' }]
export async function listFiles(dir = '/') {
  await init();
  const base = dirKey(normalize(dir));
  const seen = new Map();
  for (const k of await kv.keys()) {
    if (!k.startsWith(base) || k === base) continue;
    const rest = k.slice(base.length);
    const name = rest.split('/')[0];
    const type = rest.includes('/') ? 'dir' : 'file';
    if (!seen.has(name) || type === 'dir') seen.set(name, { name, path: base + name, type });
  }
  return [...seen.values()].sort((a, b) => a.path.localeCompare(b.path));
}

// Move a file or a whole folder.
export async function rename(from, to) {
  await init();
  const a = normalize(from), b = normalize(to);
  if (await exists(b)) throw new Error('rename: target exists: ' + b);
  const v = await kv.get(a);
  if (v !== null) {
    await writeFile(b, v);
    return kv.del(a);
  }
  if ((await kv.get(dirKey(a))) === null) throw new Error('rename: not found: ' + a);
  await mkdir(b);
  for (const k of await kv.keys()) {
    if (!k.startsWith(dirKey(a))) continue;
    await kv.put(dirKey(b) + k.slice(dirKey(a).length), await kv.get(k));
    await kv.del(k);
  }
}
