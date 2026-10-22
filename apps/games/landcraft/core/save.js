// LandCraft L2c saves, modelled on AoE RTS: one save per map in localStorage 'landcraft.save.NN'.
// The world is rebuilt from the map number; a save only holds the block edits as a diff against the
// generated world ([x, y, z, id, ...]), the player position and view, and the hotbar slot.
import { CH } from './chunk.js';
import { WATER, HOTBAR } from './blocks.js';

export const SAVE_VER = 1;
// Migration hook: MIGRATE[v](save) returns the save upgraded to v + 1 (none needed yet).
const MIGRATE = {};
export function saveKey(n) { return 'landcraft.save.' + String(n).padStart(2, '0'); }
export function hasSave(n) { try { return localStorage.getItem(saveKey(n)) !== null; } catch (e) { return false; } }
export function dropSave(n) { try { localStorage.removeItem(saveKey(n)); } catch (e) {} }

const r3 = function (v) { return Math.round(v * 1000) / 1000; };
export function buildSave(n, world, player, slot) {
  return { v: SAVE_VER, map: n, saved: Date.now(), edits: world.diff(),
    player: { x: r3(player.pos.x), y: r3(player.pos.y), z: r3(player.pos.z), yaw: r3(Math.atan2(Math.sin(player.yaw), Math.cos(player.yaw))), pitch: r3(player.pitch) }, slot: slot };
}
// Returns true when written; false (with a warning) when storage is full or unavailable.
export function writeSave(n, world, player, slot) {
  try { localStorage.setItem(saveKey(n), JSON.stringify(buildSave(n, world, player, slot))); return true; }
  catch (e) { console.warn('LandCraft: could not save map ' + n + ' (' + (e && e.name) + ')'); return false; }
}
// Validate a raw save string for map n against its freshly generated world. Throws on anything wrong,
// so a bad save never half-applies.
export function decodeSave(raw, n, world) {
  let s = JSON.parse(raw);
  if (!s || typeof s !== 'object' || !Number.isInteger(s.v)) throw new Error('not a save');
  while (s.v < SAVE_VER && MIGRATE[s.v]) s = MIGRATE[s.v](s);
  if (s.v !== SAVE_VER) throw new Error('unknown version ' + s.v);
  if (s.map !== n) throw new Error('map mismatch');
  const e = s.edits, p = s.player, b = world.bounds;
  if (!Array.isArray(e) || e.length % 4 !== 0 || !p || typeof p !== 'object') throw new Error('missing parts');
  for (let i = 0; i < e.length; i += 4) {
    if (!Number.isInteger(e[i]) || !Number.isInteger(e[i + 1]) || !Number.isInteger(e[i + 2]) || !world.inBounds(e[i], e[i + 1], e[i + 2])) throw new Error('bad cell');
    if (!Number.isInteger(e[i + 3]) || e[i + 3] < 0 || e[i + 3] > WATER) throw new Error('bad block id');
  }
  const num = function (v, lo, hi) { if (typeof v !== 'number' || !isFinite(v) || v < lo || v > hi) throw new Error('bad number'); return v; };
  const pos = { x: num(p.x, -b - 1, b + 1), y: num(p.y, -20, CH + 10), z: num(p.z, -b - 1, b + 1) };
  const view = { yaw: num(p.yaw, -4, 4), pitch: num(p.pitch, -1.55, 1.55) };
  if (!Number.isInteger(s.slot) || s.slot < 0 || s.slot >= HOTBAR.length) throw new Error('bad slot');
  return { edits: e, pos: pos, view: view, slot: s.slot, saved: s.saved };
}
// Read and validate map n's save, or null (no save, or an invalid one that is ignored with a warning).
export function readSave(n, world) {
  let raw = null;
  try { raw = localStorage.getItem(saveKey(n)); } catch (e) { return null; }
  if (raw === null) return null;
  try { return decodeSave(raw, n, world); }
  catch (err) { console.warn('LandCraft: ignoring invalid save for map ' + n + ': ' + err.message); return null; }
}
