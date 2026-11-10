/* SUDO-P1: printable sets reuse the unchanged, unique-solution SDQ1b bank.
   Bands are the game's level bands, NOT a claim of solver-technique grading. */
(function (root) {
  'use strict';
  var gen = typeof module !== 'undefined' && module.exports ? require('./gen.js') : root.SD_GEN;
  var bands = ['Demo', 'Easy', 'Medium', 'Hard', 'Very Hard'];
  var ranges = [[0,100], [100,300], [300,600], [600,850], [850,1000]];
  function integer(n, lo, hi) { return Math.min(hi, Math.max(lo, Math.floor(Number(n) || lo))); }
  function random(seed) {
    var h = 2166136261;
    for (var i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
    return function () {
      h = (h + 0x6D2B79F5) | 0;
      var t = Math.imul(h ^ h >>> 15, 1 | h);
      t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function shuffle(a, rnd) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function readId(id) {
    var m = /^S1:([\w-]{1,32}):(1|2|4|6):([1-9]|1\d|20):([0-5])$/.exec(id);
    if (m) return { seed: m[1], perPage: +m[2], pages: +m[3], difficulty: bands[+m[4]] || 'Mixed' };
    m = /^L1:(\d{1,3})$/.exec(id);
    return m ? { current: +m[1] } : null;
  }
  function create(options) {
    var o = options || {}, perPage = [1,2,4,6].indexOf(+o.perPage) >= 0 ? +o.perPage : 1;
    var pages = integer(o.pages, 1, 20), difficulty = bands.indexOf(o.difficulty) >= 0 ? o.difficulty : 'Mixed';
    var seed = String(o.seed || 'sudoku').replace(/[^\w-]/g, '-').slice(0, 32), current = o.current != null;
    var id = current ? 'L1:' + integer(o.current, 0, 999) : 'S1:' + seed + ':' + perPage + ':' + pages + ':' + (bands.indexOf(difficulty) < 0 ? 5 : bands.indexOf(difficulty));
    var puzzles = [], rnd = random(seed), pools = ranges.map(function (range) {
      var a = []; for (var l = range[0]; l < range[1]; l++) a.push(l); return shuffle(a, rnd);
    }), used = {}, seen = {};
    for (var n = 0; n < (current ? 1 : perPage * pages); n++) {
      var b = difficulty === 'Mixed' ? n % 5 : bands.indexOf(difficulty);
      var pool = pools[b], index = used[b] || 0;
      var level = current ? integer(o.current, 0, 999) : pool[index % pool.length];
      used[b] = index + 1;
      var p = gen.generate(level), basePuzzle = p.puzzle, baseSolution = p.solution, digits;
      // Digit relabelling permits >100 distinct Demo puzzles without changing difficulty.
      if (!current) do {
        digits = shuffle([0,1,2,3,4,5,6,7,8,9].slice(1), rnd); digits.unshift(0);
        p.puzzle = basePuzzle.map(function (d) { return digits[d]; });
        p.solution = baseSolution.map(function (d) { return digits[d]; });
      } while (seen[p.puzzle.join('')]);
      seen[p.puzzle.join('')] = true;
      puzzles.push({ number: n + 1, level: level, band: p.band, puzzle: p.puzzle, solution: p.solution });
    }
    return { id: id, seed: seed, perPage: current ? 1 : perPage, pages: current ? 1 : pages,
      difficulty: difficulty, puzzles: puzzles };
  }
  var api = { create: create, readId: readId, bands: bands };
  root.SD_SHEETS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
