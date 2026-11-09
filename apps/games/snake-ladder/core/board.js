/* board.js — seeded procedural board generation + cell geometry.
   Board 00..99: seed number IS the board. Same seed => same board, always. */

const Board = (() => {

  /* ---------- seeded PRNG (mulberry32) ---------- */
  function rng(seed) {
    let a = (seed >>> 0) + 0x9e3779b9;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- boustrophedon numbering ----------
     cell 0 bottom-left, runs right, next row runs left, ... cell 99 top-left */
  function coords(cell) {
    const S = CONFIG.SIZE;
    const row = Math.floor(cell / S);          // 0 = bottom
    const col = row % 2 === 0
      ? cell % S
      : S - 1 - (cell % S);
    return { row, col };
  }

  // inverse: grid position -> cell number
  function cellAt(row, col) {
    const S = CONFIG.SIZE;
    return row % 2 === 0
      ? row * S + col
      : row * S + (S - 1 - col);
  }

  /* ---------- connectors ----------
     Placement is a deterministic shuffle, not rejection sampling: build a
     candidate list, shuffle once with the seed, then take the first entries
     that satisfy the constraints. No early starvation, no infinite retries. */
  function generate(seed) {
    const rand = rng(seed);
    const S = CONFIG.SIZE;
    const total = S * S;
    const blocked = new Set(CONFIG.NO_CONNECT_ON);

    // state: 'free' | 'end'
    const state = new Array(total).fill('free');
    const ladders = [];
    const snakes = [];

    function neighboursOf(cell) {
      const { row, col } = coords(cell);
      const out = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const r = row + dr, c = col + dc;
          if (r < 0 || r >= S || c < 0 || c >= S) continue;
          out.push(cellAt(r, c));
        }
      }
      return out;
    }

    function usable(cell) {
      if (cell < 0 || cell >= total) return false;
      if (blocked.has(cell)) return false;
      if (state[cell] !== 'free') return false;
      if (!CONFIG.NO_ADJACENT_ENDS) return true;
      return neighboursOf(cell).every(n => !blocked.has(n) && state[n] === 'free');
    }

    function shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }

    // Pre-shuffle the cell pool once. Each connector then scans forward from a
    // random offset; since the pool order is fixed, the result is stable.
    const pool = shuffle([...Array(total).keys()]);

    function take(kind) {
      const start = Math.floor(rand() * total);
      for (let i = 0; i < total; i++) {
        const from = pool[(start + i) % total];
        if (!usable(from)) continue;

        // try a handful of spans, scaled to the board, and keep the first legal
        for (let attempt = 0; attempt < 24; attempt++) {
          const span = CONFIG.MIN_JUMP +
            Math.floor(rand() * (total - 1 - CONFIG.MIN_JUMP));
          const to = kind === 'ladder' ? from + span : from - span;
          if (to < 0 || to >= total) continue;
          if (!usable(to)) continue;

          state[from] = 'end';
          state[to] = 'end';
          return { from, to };
        }
      }
      return null;
    }

    // interleave so both kinds spread across the whole board
    let wantLadder = CONFIG.LADDERS >= CONFIG.SNAKES;
    let guard = 0;
    while ((ladders.length < CONFIG.LADDERS || snakes.length < CONFIG.SNAKES) &&
           guard++ < 1000) {
      const needLadder = ladders.length < CONFIG.LADDERS;
      const needSnake  = snakes.length  < CONFIG.SNAKES;
      const kind = (wantLadder && needLadder) || !needSnake ? 'ladder' : 'snake';
      wantLadder = !wantLadder;

      const pair = take(kind);
      if (!pair) break;                        // board genuinely saturated
      (kind === 'ladder' ? ladders : snakes).push(pair);
    }

    return { seed, ladders, snakes };
  }

  /* ---------- lookup: cell -> destination ---------- */
  function buildJumpMap(board) {
    const map = new Map();
    for (const l of board.ladders) map.set(l.from, l.to);
    for (const s of board.snakes)  map.set(s.from, s.to);
    return map;
  }

  return { rng, coords, cellAt, generate, buildJumpMap };
})();
