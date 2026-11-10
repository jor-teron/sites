/* SWAP-1a. Pure match-3 rules; classic browser script + CommonJS for Node tests.
 * Groups keep their constituent runs and shape for SWAP-1b special creation.
 * Board: 64 colour indices (0..5), -1 means empty. No artwork or external assets. */
(function (root) {
  'use strict';
  const SIZE = 8, COLOURS = 6;
  const adjacent = (a, b) => Number.isInteger(a) && Number.isInteger(b) &&
    a >= 0 && b >= 0 && a < 64 && b < 64 &&
    Math.abs(a % SIZE - b % SIZE) + Math.abs((a / SIZE | 0) - (b / SIZE | 0)) === 1;
  function swap(board, a, b) { [board[a], board[b]] = [board[b], board[a]]; }

  function findMatches(board) {
    const runs = [];
    for (const axis of ['row', 'column']) {
      for (let line = 0; line < SIZE; line++) {
        const at = p => axis === 'row' ? line * SIZE + p : p * SIZE + line;
        for (let start = 0; start < SIZE;) {
          let end = start + 1;
          while (end < SIZE && board[at(start)] >= 0 && board[at(end)] === board[at(start)]) end++;
          if (end - start >= 3) runs.push({ axis, cells: Array.from({ length: end - start }, (_, j) => at(start + j)) });
          start = end;
        }
      }
    }
    // Union intersecting runs, not merely adjacent same-colour matches.
    const groups = [];
    for (const run of runs) {
      const joins = groups.filter(g => run.cells.some(i => g.cells.includes(i)));
      const group = { cells: [...run.cells], runs: [run], colour: board[run.cells[0]] };
      for (const old of joins) {
        group.cells.push(...old.cells); group.runs.push(...old.runs);
        groups.splice(groups.indexOf(old), 1);
      }
      group.cells = [...new Set(group.cells)]; groups.push(group);
    }
    for (const g of groups) {
      const rows = g.runs.filter(r => r.axis === 'row'), cols = g.runs.filter(r => r.axis === 'column');
      g.shape = rows.length ? 'row' : 'column';
      if (rows.length && cols.length) {
        g.shape = 'L';
        for (const r of rows) for (const c of cols) {
          const i = r.cells.find(n => c.cells.includes(n));
          if (i === undefined) continue;
          const inner = run => run.cells[0] !== i && run.cells[run.cells.length - 1] !== i;
          if (inner(r) && inner(c)) g.shape = 'cross';
          else if ((inner(r) || inner(c)) && g.shape !== 'cross') g.shape = 'T';
        }
      }
    }
    return groups;
  }

  function trySwap(board, a, b) {
    if (!adjacent(a, b)) return [];
    swap(board, a, b);
    const groups = findMatches(board).filter(g => g.cells.includes(a) || g.cells.includes(b));
    if (!groups.length) swap(board, a, b);
    return groups;
  }
  function findMove(board) {
    for (let a = 0; a < 64; a++) for (const b of [a + 1, a + SIZE]) {
      if (!adjacent(a, b) || board[a] === board[b]) continue;
      swap(board, a, b);
      const ok = findMatches(board).some(g => g.cells.includes(a) || g.cells.includes(b));
      swap(board, a, b);
      if (ok) return [a, b];
    }
    return null;
  }
  function newBoard(random = Math.random) {
    const board = [];
    for (let i = 0; i < 64; i++) {
      const allowed = Array.from({ length: COLOURS }, (_, c) => c).filter(c =>
        !(i % SIZE >= 2 && board[i - 1] === c && board[i - 2] === c) &&
        !(i >= SIZE * 2 && board[i - SIZE] === c && board[i - SIZE * 2] === c));
      board.push(allowed[Math.floor(random() * allowed.length)]);
    }
    // A bounded deterministic repair also works with a degenerate test RNG.
    if (!findMove(board)) {
      board[0] = 0; board[1] = 1; board[2] = 0; board[9] = 0;
      if (findMatches(board).length) return fallbackBoard();
    }
    return board;
  }
  function fallbackBoard() {
    const board = Array.from({ length: 64 }, (_, i) => (i % SIZE + (i / SIZE | 0) * 2) % COLOURS);
    board[0] = 0; board[1] = 1; board[2] = 0; board[9] = 0;
    return board;
  }
  function reshuffle(board, random = Math.random) {
    for (let attempt = 0; attempt < 120; attempt++) {
      for (let i = board.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1)); swap(board, i, j);
      }
      if (!findMatches(board).length && findMove(board)) return board;
    }
    // Impossible multiset (or pathological RNG): redeal rather than loop forever.
    board.splice(0, 64, ...newBoard(random));
    return board;
  }
  function clearMatches(board, groups) {
    const cells = [...new Set(groups.flatMap(g => g.cells))];
    cells.forEach(i => { board[i] = -1; });
    return cells.length;
  }
  function gravityAndRefill(board, random = Math.random) {
    const falls = [];
    for (let col = 0; col < SIZE; col++) {
      let dest = SIZE - 1;
      for (let row = SIZE - 1; row >= 0; row--) {
        const from = row * SIZE + col;
        if (board[from] < 0) continue;
        const to = dest-- * SIZE + col;
        board[to] = board[from]; falls.push({ from: row, to: to / SIZE | 0, cell: to });
      }
      for (let row = dest; row >= 0; row--) {
        const cell = row * SIZE + col;
        board[cell] = Math.floor(random() * COLOURS);
        falls.push({ from: row - dest - 1, to: row, cell });
      }
    }
    return falls;
  }
  const api = { SIZE, COLOURS, adjacent, swap, findMatches, trySwap, findMove, newBoard, reshuffle, clearMatches, gravityAndRefill };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SweetRules = api;
})(typeof window === 'undefined' ? globalThis : window);
