'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../core/matches.js');
const P = require('../core/progress.js');
const empty = () => Array(64).fill(-1);
function rng(seed) { return () => ((seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 4294967296); }

test('horizontal 3 and vertical 5 keep direction and length', () => {
  const b = empty(); [0, 1, 2].forEach(i => b[i] = 0); [7, 15, 23, 31, 39].forEach(i => b[i] = 1);
  const g = R.findMatches(b);
  assert.deepEqual(g.map(x => [x.shape, x.colour, x.cells.length]), [['row', 0, 3], ['column', 1, 5]]);
});
test('four match retains constituent run for later specials', () => {
  const b = empty(); [9, 10, 11, 12].forEach(i => b[i] = 3);
  const g = R.findMatches(b)[0]; assert.equal(g.shape, 'row'); assert.equal(g.runs[0].cells.length, 4);
});
test('L T and cross shapes merge intersection without duplicate cells', () => {
  for (const [shape, cells] of [['L', [0, 1, 2, 8, 16]], ['T', [0, 1, 2, 9, 17]], ['cross', [8, 9, 10, 1, 17]]]) {
    const b = empty(); cells.forEach(i => b[i] = 2);
    const groups = R.findMatches(b); assert.equal(groups.length, 1); assert.equal(groups[0].shape, shape);
    assert.equal(groups[0].cells.length, 5); assert.equal(groups[0].runs.length, 2);
    assert.equal(R.clearMatches(b, groups), 5);
  }
});
test('disjoint runs stay separate; row boundaries never wrap', () => {
  const b = empty(); [6, 7, 8, 9].forEach(i => b[i] = 1); assert.equal(R.findMatches(b).length, 0);
  [24, 25, 26, 27, 28, 29].forEach(i => b[i] = i < 27 ? 1 : 2);
  assert.equal(R.findMatches(b).length, 2); assert.equal(R.adjacent(7, 8), false);
});
test('gravity preserves survivor order and refills every hole', () => {
  const b = empty(); [1, 2, 3].forEach((c, i) => b[(i * 2 + 1) * 8] = c);
  const falls = R.gravityAndRefill(b, () => .99);
  assert.deepEqual([b[5 * 8], b[6 * 8], b[7 * 8]], [1, 2, 3]);
  assert.ok(b.every(c => c >= 0 && c < 6)); assert.equal(falls.length, 64);
  assert.deepEqual(falls.filter(f => f.cell % 8 === 0).slice(0, 3).map(f => [f.from, f.to]), [[5, 7], [3, 6], [1, 5]]);
  assert.ok(falls.some(f => f.from < 0));
});
test('1000 generated boards have no initial matches and a move without mutation', () => {
  for (let seed = 0; seed < 1000; seed++) {
    const b = R.newBoard(rng(seed)), before = b.slice();
    assert.equal(R.findMatches(b).length, 0); assert.ok(R.findMove(b)); assert.deepEqual(b, before);
    const [a, c] = R.findMove(b); assert.ok(R.trySwap(b, a, c).length);
  }
});
test('degenerate RNGs still generate a valid playable board', () => {
  for (const v of [0, .1, .5, .999]) {
    const b = R.newBoard(() => v); assert.equal(R.findMatches(b).length, 0); assert.ok(R.findMove(b));
  }
});
test('invalid swaps revert exactly; invalid coordinates cannot wrap', () => {
  const b = R.newBoard(rng(88)), before = b.slice(); let found = false;
  for (let a = 0; a < 64 && !found; a++) for (const c of [a + 1, a + 8]) {
    if (!R.adjacent(a, c)) continue;
    const probe = b.slice();
    if (!R.trySwap(probe, a, c).length) { assert.deepEqual(probe, before); found = true; break; }
  }
  assert.ok(found);
  for (const pair of [[7, 8], [-1, 0], [63, 64], [1, 9.1]]) { assert.equal(R.trySwap(b, ...pair).length, 0); assert.deepEqual(b, before); }
});
test('dead board detected then reshuffled to a match-free playable board', () => {
  const b = Array.from({ length: 64 }, (_, i) => (i % 8 + (i / 8 | 0) * 2) % 6);
  assert.equal(R.findMatches(b).length, 0); assert.equal(R.findMove(b), null);
  const multiset = b.slice().sort(); R.reshuffle(b, rng(9));
  assert.equal(R.findMatches(b).length, 0); assert.ok(R.findMove(b)); assert.deepEqual(b.slice().sort(), multiset);
});
test('impossible shuffle is bounded and redeals safely', () => {
  const b = Array(64).fill(0); R.reshuffle(b, () => 0);
  assert.equal(R.findMatches(b).length, 0); assert.ok(R.findMove(b));
});
test('100 seeded games resolve cascades then restore playable stable states', () => {
  for (let seed = 0; seed < 100; seed++) {
    const random = rng(seed), b = R.newBoard(random);
    for (let turn = 0; turn < 25; turn++) {
      if (!R.findMove(b)) R.reshuffle(b, random);
      const move = R.findMove(b); let groups = R.trySwap(b, ...move), rounds = 0;
      while (groups.length) {
        assert.ok(++rounds < 80); assert.ok(R.clearMatches(b, groups) >= 3);
        R.gravityAndRefill(b, random); groups = R.findMatches(b);
      }
      assert.equal(R.findMatches(b).length, 0); assert.ok(b.every(c => c >= 0 && c < 6));
    }
  }
});
test('progress roundtrip and corrupt/inaccessible stores', () => {
  const data = new Map(), store = { getItem: k => data.get(k) || null, setItem: (k, v) => data.set(k, v) };
  const s = P.fresh(2); s.score = 180; s.moves = 24;
  assert.ok(P.write(store, P.KEY, s)); assert.deepEqual(P.load(store), s);
  for (const bad of [{ ...s, board: Array(64).fill(1) }, { ...s, level: 11 }, { ...s, moves: -1 }, { ...s, score: NaN }, { ...s, version: 0 }]) {
    P.write(store, P.KEY, bad); assert.equal(P.load(store), null);
  }
  data.set(P.KEY, '{'); assert.equal(P.load(store), null); assert.equal(P.load(null), null); assert.equal(P.write(null, P.KEY, s), false);
  P.write(store, P.BEST, { 1: 500, 2: -4, 3: 'oops' }); assert.equal(P.bests(store)[1], 500); assert.equal(P.bests(store)[2], 0);
});
test('ten rising goals and exact 0/1/2/3 star boundaries', () => {
  for (let level = 1; level <= P.LEVELS; level++) {
    assert.equal(P.stars(level, P.target(level) - 1), 0);
    P.thresholds(level).forEach((t, i) => assert.equal(P.stars(level, t), i + 1));
    if (level > 1) assert.ok(P.target(level) > P.target(level - 1));
  }
});
