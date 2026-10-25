/*
  File: modules/progress.js
  Project: tower-defence
  Purpose: Saved progress in localStorage: best wave per map, last map played.
           Every access is guarded, so private mode never breaks the game.
*/

const BEST_KEY = 'td_best_waves'; /* JSON { "07": 12, ... } */
const LAST_KEY = 'td_last_map';

/* Read the best-wave table. */
export function loadBestWaves() {
  try { return JSON.parse(localStorage.getItem(BEST_KEY) || '{}') || {}; } catch (e) { return {}; }
}

/* Best wave reached on map n, 0 if never played. */
export function bestWave(n) {
  return +loadBestWaves()[n] || 0;
}

/* Store a wave if it beats the record. Returns true on a new record. */
export function saveBestWave(n, wave) {
  const all = loadBestWaves();
  if (wave <= (+all[n] || 0)) return false;
  all[n] = wave;
  try { localStorage.setItem(BEST_KEY, JSON.stringify(all)); } catch (e) { /* ignore */ }
  return true;
}

/* Last map played, 0 if none. */
export function lastMap() {
  try { return +(localStorage.getItem(LAST_KEY) || 0) || 0; } catch (e) { return 0; }
}

/* Remember the map being played. */
export function saveLastMap(n) {
  try { localStorage.setItem(LAST_KEY, String(n)); } catch (e) { /* ignore */ }
}
