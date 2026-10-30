// App registry. Loads packages listed in ../packages/index.json.
const apps = new Map();
const base = new URL('../packages/', import.meta.url);

export function register(meta) {
  if (!meta || !meta.id) throw new Error('app meta needs an id');
  apps.set(meta.id, { ...meta });
}

export function list() {
  return [...apps.values()];
}

export function get(id) {
  return apps.get(id) ?? null;
}

async function getJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(res.status + ' ' + url);
  return res.json();
}

// Registers every package; returns { loaded, failed }. Never throws.
export async function loadPackages(log = () => {}) {
  let names = [];
  try {
    names = await getJson(new URL('index.json', base));
    if (!Array.isArray(names)) names = [];
  } catch (e) {
    log('registry: no package list (' + e.message + ')');
  }
  let loaded = 0, failed = 0;
  for (const folder of names) {
    try {
      const dir = new URL(folder + '/', base);
      const meta = await getJson(new URL('metadata.json', dir));
      register({ ...meta, folder, url: new URL(meta.main || 'main.js', dir).href });
      loaded++;
    } catch (e) {
      failed++;
      log('registry: ' + folder + ' failed: ' + e.message);
    }
  }
  return { loaded, failed };
}

// Imports an app's module and calls its start(os).
export async function start(id, os) {
  const app = get(id);
  if (!app) throw new Error('unknown app: ' + id);
  const mod = await import(app.url);
  if (typeof mod.start !== 'function') throw new Error(id + ' has no start()');
  return mod.start(os);
}
