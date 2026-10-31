/* Sudoku SDQ1b — seeded level generator (logic only, no DOM).
   Level 000-999 IS the seed: the same level gives the same puzzle on every device, forever.
   DO NOT CHANGE this file's algorithm, PRNG, constants or order of calls: any change alters every level.
   Steps: mulberry32(level) -> fill a full grid by backtracking with seeded shuffled digits ->
   remove cells in a seeded order, keeping each removal only if the solution stays unique (solver counts to 2).
   Blanks target = 20 + round(level * 38 / 999); if it can't be reached uniquely, it stops at the most reached. */
(function (root) {
  'use strict';

  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rnd) {
    for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }

  var BOX = [];
  for (var i = 0; i < 81; i++) BOX[i] = Math.floor(Math.floor(i / 9) / 3) * 3 + Math.floor((i % 9) / 3);

  // Count solutions of g (0 = empty), stopping at limit. g is modified during search and restored.
  function countSolutions(g, limit) {
    var rows = [0,0,0,0,0,0,0,0,0], cols = rows.slice(), boxes = rows.slice(), k;
    for (k = 0; k < 81; k++) if (g[k]) {
      var b = 1 << g[k], r = (k / 9) | 0, c = k % 9;
      if ((rows[r] | cols[c] | boxes[BOX[k]]) & b) return 0;
      rows[r] |= b; cols[c] |= b; boxes[BOX[k]] |= b;
    }
    var count = 0;
    function go() {
      var best = -1, bestMask = 0, bestN = 10;
      for (var k = 0; k < 81; k++) if (!g[k]) {
        var m = ~(rows[(k / 9) | 0] | cols[k % 9] | boxes[BOX[k]]) & 0x3FE, n = 0, x = m;
        while (x) { x &= x - 1; n++; }
        if (n < bestN) { best = k; bestMask = m; bestN = n; if (n <= 1) break; }
      }
      if (best < 0) { count++; return; }
      if (!bestN) return;
      var r = (best / 9) | 0, c = best % 9, bx = BOX[best];
      for (var d = 1; d <= 9 && count < limit; d++) if (bestMask & (1 << d)) {
        var b = 1 << d;
        g[best] = d; rows[r] |= b; cols[c] |= b; boxes[bx] |= b;
        go();
        g[best] = 0; rows[r] &= ~b; cols[c] &= ~b; boxes[bx] &= ~b;
      }
    }
    go();
    return count;
  }

  function fill(g, k, rnd) {
    if (k === 81) return true;
    var r = (k / 9) | 0, c = k % 9, digits = shuffle([1,2,3,4,5,6,7,8,9], rnd);
    for (var di = 0; di < 9; di++) {
      var d = digits[di], ok = true;
      for (var j = 0; j < 9 && ok; j++) {
        if (g[r * 9 + j] === d || g[j * 9 + c] === d) ok = false;
        var bi = (Math.floor(r / 3) * 3 + Math.floor(j / 3)) * 9 + Math.floor(c / 3) * 3 + j % 3;
        if (g[bi] === d) ok = false;
      }
      if (!ok) continue;
      g[k] = d;
      if (fill(g, k + 1, rnd)) return true;
      g[k] = 0;
    }
    return false;
  }

  function target(level) { return 20 + Math.round(level * 38 / 999); }

  function band(level) {
    return level < 100 ? 'Demo' : level < 300 ? 'Easy' : level < 600 ? 'Medium' : level < 850 ? 'Hard' : 'Very Hard';
  }

  function generate(level) {
    var rnd = mulberry32(level), sol = [], i;
    for (i = 0; i < 81; i++) sol[i] = 0;
    fill(sol, 0, rnd);
    var puz = sol.slice(), order = [], want = target(level), blanks = 0;
    for (i = 0; i < 81; i++) order[i] = i;
    shuffle(order, rnd);
    for (i = 0; i < 81 && blanks < want; i++) {
      var k = order[i], keep = puz[k];
      puz[k] = 0;
      if (countSolutions(puz.slice(), 2) === 1) blanks++;
      else puz[k] = keep;
    }
    return { level: level, puzzle: puz, solution: sol, blanks: blanks, target: want, band: band(level) };
  }

  var api = { generate: generate, band: band, target: target, countSolutions: countSolutions, LEVELS: 1000 };
  root.SD_GEN = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
