/*
 * Connect 4 — pure board model (C4-1). No DOM.
 * Cells: grid[r][c], r = 0 is the TOP row. 0 empty, 1 = Red, 2 = Yellow.
 */
const C4Board = (() => {
  const { cols: COLS, rows: ROWS } = C4_CONFIG;
  const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

  const create = () => Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  const clone = (g) => g.map((row) => row.slice());

  /** Lowest empty row in column c, or -1 if full. */
  function openRow(g, c) {
    for (let r = ROWS - 1; r >= 0; r--) if (!g[r][c]) return r;
    return -1;
  }
  const validCols = (g) => { const o = []; for (let c = 0; c < COLS; c++) if (!g[0][c]) o.push(c); return o; };
  const isFull = (g) => validCols(g).length === 0;

  /** If the disc at (r,c) makes four, return the winning cells [[r,c]x4+], else null. */
  function winAt(g, r, c) {
    const p = g[r][c]; if (!p) return null;
    for (const [dr, dc] of DIRS) {
      const line = [[r, c]];
      for (const s of [1, -1]) {
        let rr = r + dr * s, cc = c + dc * s;
        while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && g[rr][cc] === p) { line.push([rr, cc]); rr += dr * s; cc += dc * s; }
      }
      if (line.length >= 4) return line;
    }
    return null;
  }
  return { COLS, ROWS, create, clone, openRow, validCols, isFull, winAt };
})();
