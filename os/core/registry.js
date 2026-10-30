// Simple app registry. Loads optional ../packages/index.json.
const apps = new Map();

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

// Returns number of packages loaded; never throws.
export async function loadPackages() {
  try {
    const url = new URL('../packages/index.json', import.meta.url);
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return 0;
    const items = await res.json();
    if (!Array.isArray(items)) return 0;
    items.forEach(m => { try { register(m); } catch {} });
    return items.length;
  } catch {
    return 0;
  }
}
