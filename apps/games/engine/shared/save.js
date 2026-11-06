export function loadJson(key, fallback = null) {
  try { const r = localStorage.getItem(key); return r == null ? fallback : JSON.parse(r); }
  catch (_) { return fallback; }
}
export function saveJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; }
}
