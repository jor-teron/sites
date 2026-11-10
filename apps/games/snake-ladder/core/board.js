/* board.js — seeded procedural board generation + cell geometry.
   Boards 00..99: seed number IS the board. Same seed => same board, always. */

const Board = (() => {
  /* ---------- seeded PRNG (mulberry32) ---------- */
  function rng(seed) {
    let a = (seed >>> 0) + 0x9e3779b9;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- boustrophedon numbering ----------
     cell 0 bottom-left, runs right, next row runs left, ... cell 99 top-left */
  function coords(cell) {
    const S = CONFIG.SIZE;
    const row = Math.floor(cell / S); // 0 = bottom
    const col = row % 2 === 0 ? cell % S : S - 1 - (cell % S);
    return { row, col };
  }

  // inverse: grid position -> cell number
  function cellAt(row, col) {
    const S = CONFIG.SIZE;
    return row % 2 === 0 ? row * S + col : row * S + (S - 1 - col);
  }

  /* 34 endpoints cannot all be king-separated on a 10×10 grid (maximum 25).
     Use one checkerboard parity: different connectors never share an end or an
     orthogonal neighbour; diagonal neighbours are allowed. Each connector itself
     spans >=2 rows and >=2.5 cells. Exhaustive candidates avoid sampling starvation.
     Board IDs stay 00..99; numbering is only a presentation change to 1..100. */
  function generate(seed) {
    const rand = rng(seed);
    const shuffled = (values) => {
      for (let i = values.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [values[i], values[j]] = [values[j], values[i]];
      }
      return values;
    };
    const pool = Array.from({ length: 100 }, (_, i) => i).filter((c) => {
      const { row, col } = coords(c);
      return !CONFIG.NO_CONNECT_ON.includes(c) && (row + col) % 2 === seed % 2;
    });
    const candidates = [];
    for (const from of pool)
      for (const to of pool) {
        const a = coords(from),
          b = coords(to);
        const distance = Math.hypot(a.row - b.row, a.col - b.col);
        if (
          to > from &&
          b.row - a.row >= CONFIG.MIN_ROWS &&
          distance >= CONFIG.MIN_DISTANCE &&
          distance <= 5.8
        )
          candidates.push({ from, to });
      }
    // Deterministic bounded retries (normally one pass). Never return a deficient board.
    for (let attempt = 0; attempt < 200; attempt++) {
      const used = new Set(),
        ladders = [],
        snakes = [];
      for (const pair of shuffled(candidates.slice())) {
        if (used.has(pair.from) || used.has(pair.to)) continue;
        if (ladders.length < CONFIG.LADDERS && ladders.length <= snakes.length) ladders.push({ ...pair });
        else if (snakes.length < CONFIG.SNAKES) snakes.push({ from: pair.to, to: pair.from });
        else if (ladders.length < CONFIG.LADDERS) ladders.push({ ...pair });
        else break;
        used.add(pair.from);
        used.add(pair.to);
      }
      if (ladders.length === CONFIG.LADDERS && snakes.length === CONFIG.SNAKES)
        return { seed, ladders, snakes };
    }
    throw new Error('Could not place the full board');
  }

  // Shared by the artist and the token animator, so a snake ride follows its body exactly.
  function center(cell) {
    const { row, col } = coords(cell);
    return { x: col + 0.5, y: 9.5 - row };
  }
  function connectorPoint(from, to, t, kind = 'snake') {
    const a = center(from),
      b = center(to),
      dx = b.x - a.x,
      dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const sway = kind === 'snake' ? Math.sin(t * Math.PI * 4) * Math.sin(t * Math.PI) * 0.32 : 0;
    return { x: a.x + dx * t - (dy / len) * sway, y: a.y + dy * t + (dx / len) * sway };
  }

  /* ---------- lookup: cell -> destination ---------- */
  function buildJumpMap(board) {
    const map = new Map();
    for (const l of board.ladders) map.set(l.from, l.to);
    for (const s of board.snakes) map.set(s.from, s.to);
    return map;
  }

  return { rng, coords, cellAt, generate, buildJumpMap, center, connectorPoint };
})();
