/* Stable-boundary saves: a reload during animation replays from before that move.
 * A versioned, validated store is optional: private mode still plays in memory. */
(function (root) {
  'use strict';
  const R = typeof module !== 'undefined' && module.exports ? require('./matches.js') : root.SweetRules;
  const KEY = 'sweet-swap.save', BEST = 'sweet-swap.best', LEVELS = 10, MOVES = 25;
  const target = level => 2400 + (level - 1) * 400;
  const thresholds = level => [target(level), Math.round(target(level) * 1.4), Math.round(target(level) * 1.8)];
  const stars = (level, score) => thresholds(level).filter(n => score >= n).length;
  const fresh = level => ({ version: 1, level, board: R.newBoard(), score: 0, moves: MOVES });
  function valid(s) {
    return s && s.version === 1 && Number.isInteger(s.level) && s.level >= 1 && s.level <= LEVELS &&
      Number.isInteger(s.score) && s.score >= 0 && s.score <= 1e9 && Number.isInteger(s.moves) && s.moves >= 0 && s.moves <= MOVES &&
      Array.isArray(s.board) && s.board.length === 64 && s.board.every(c => Number.isInteger(c) && c >= 0 && c < 6) &&
      !R.findMatches(s.board).length && !!R.findMove(s.board);
  }
  function read(store, key) { try { return JSON.parse(store.getItem(key)); } catch (_) { return null; } }
  function write(store, key, value) { try { store.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; } }
  function load(store) { const s = read(store, KEY); return valid(s) ? s : null; }
  function bests(store) {
    const raw = read(store, BEST), out = {};
    for (let level = 1; level <= LEVELS; level++) {
      const n = raw && raw[level]; out[level] = Number.isInteger(n) && n >= 0 && n <= 1e9 ? n : 0;
    }
    return out;
  }
  const api = { KEY, BEST, LEVELS, MOVES, target, thresholds, stars, fresh, valid, write, load, bests };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SweetProgress = api;
})(typeof window === 'undefined' ? globalThis : window);
