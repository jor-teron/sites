/*
 * Connect 4 — computer player (C4-1). No DOM.
 *  easy:   takes a win if it has one, else mostly random.
 *  medium: win > block > avoid giving a win on top > prefer the centre.
 *  hard:   negamax + alpha-beta, centre-first move order, iterative deepening
 *          up to C4_CONFIG.hardDepth within C4_CONFIG.hardTimeMs (stays quick on weak phones).
 */
const C4AI = (() => {
  const B = C4Board, CFG = C4_CONFIG;
  const ORDER = [3, 2, 4, 1, 5, 0, 6];        // centre first: better pruning
  const WIN = 1e6;

  /** Column that wins immediately for player p, or -1. */
  function winningCol(g, p) {
    for (const c of B.validCols(g)) {
      const r = B.openRow(g, c); g[r][c] = p;
      const w = B.winAt(g, r, c); g[r][c] = 0;
      if (w) return c;
    }
    return -1;
  }
  const rand = (a) => a[Math.floor(Math.random() * a.length)];

  function easy(g, p) {
    const w = winningCol(g, p); if (w >= 0) return w;
    const v = B.validCols(g);
    return Math.random() < CFG.easyRandom ? rand(v) : medium(g, p);
  }

  function medium(g, p) {
    const o = 3 - p;
    let c = winningCol(g, p); if (c >= 0) return c;
    c = winningCol(g, o); if (c >= 0) return c;
    // skip moves that let the opponent win by playing on top
    const safe = B.validCols(g).filter((col) => {
      const r = B.openRow(g, col); g[r][col] = p;
      const bad = r > 0 && (() => { g[r - 1][col] = o; const w = B.winAt(g, r - 1, col); g[r - 1][col] = 0; return !!w; })();
      g[r][col] = 0; return !bad;
    });
    const pool = safe.length ? safe : B.validCols(g);
    // weight toward the centre, with a little randomness
    let best = pool[0], bs = -1;
    for (const col of pool) { const s = 4 - Math.abs(3 - col) + Math.random() * 1.5; if (s > bs) { bs = s; best = col; } }
    return best;
  }

  /** Heuristic score of the board for player p (windows of 4 + centre column). */
  function evaluate(g, p) {
    const o = 3 - p; let s = 0;
    for (let r = 0; r < B.ROWS; r++) if (g[r][3] === p) s += 3; else if (g[r][3] === o) s -= 3;
    const win = (cells) => {
      let a = 0, b = 0;
      for (const [r, c] of cells) { if (g[r][c] === p) a++; else if (g[r][c] === o) b++; }
      if (a && b) return 0;
      if (a === 3) return 5; if (a === 2) return 2;
      if (b === 3) return -4; if (b === 2) return -1;
      return 0;
    };
    for (let r = 0; r < B.ROWS; r++) for (let c = 0; c < B.COLS; c++) {
      if (c + 3 < B.COLS) s += win([[r, c], [r, c + 1], [r, c + 2], [r, c + 3]]);
      if (r + 3 < B.ROWS) s += win([[r, c], [r + 1, c], [r + 2, c], [r + 3, c]]);
      if (r + 3 < B.ROWS && c + 3 < B.COLS) s += win([[r, c], [r + 1, c + 1], [r + 2, c + 2], [r + 3, c + 3]]);
      if (r + 3 < B.ROWS && c - 3 >= 0) s += win([[r, c], [r + 1, c - 1], [r + 2, c - 2], [r + 3, c - 3]]);
    }
    return s;
  }

  class Timeout extends Error {}
  let deadline = 0, nodes = 0;

  /** Negamax with alpha-beta; returns score for player p to move. */
  function negamax(g, depth, alpha, beta, p) {
    if ((++nodes & 1023) === 0 && performance.now() > deadline) throw new Timeout();
    const moves = ORDER.filter((c) => !g[0][c]);
    if (!moves.length) return 0;
    if (depth === 0) return evaluate(g, p);
    for (const c of moves) {               // immediate win check first (cheap, strong)
      const r = B.openRow(g, c); g[r][c] = p; const w = B.winAt(g, r, c); g[r][c] = 0;
      if (w) return WIN + depth;
    }
    let best = -Infinity;
    for (const c of moves) {
      const r = B.openRow(g, c); g[r][c] = p;
      const v = -negamax(g, depth - 1, -beta, -alpha, 3 - p);
      g[r][c] = 0;
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  function hard(g, p) {
    const w = winningCol(g, p); if (w >= 0) return w;
    const b = winningCol(g, 3 - p); if (b >= 0) return b;
    g = B.clone(g);
    deadline = performance.now() + CFG.hardTimeMs; nodes = 0;
    let bestCol = medium(B.clone(g), p);
    for (let d = 2; d <= CFG.hardDepth; d++) {     // iterative deepening
      try {
        let best = -Infinity, col = bestCol;
        for (const c of ORDER.filter((x) => !g[0][x])) {
          const r = B.openRow(g, c); g[r][c] = p;
          const v = -negamax(g, d - 1, -Infinity, -best, 3 - p);
          g[r][c] = 0;
          if (v > best) { best = v; col = c; }
        }
        bestCol = col;
      } catch (e) { if (e instanceof Timeout) break; throw e; }
    }
    return bestCol;
  }

  /** Pick a column for player p at the given level. */
  function choose(g, p, level) {
    const work = B.clone(g);
    if (level === 'easy') return easy(work, p);
    if (level === 'hard') return hard(work, p);
    return medium(work, p);
  }
  return { choose, evaluate };
})();
