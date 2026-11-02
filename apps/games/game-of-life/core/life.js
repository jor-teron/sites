/*
 * Game of Life — simulation core (LIFE-1). No DOM.
 * Cells live in a Uint8Array (1 = alive), index = y * cols + x. Edges wrap (torus).
 * step() writes into a second buffer and swaps, so there are no allocations per generation.
 */
const LifeCore = (() => {
  function create(cols, rows) {
    let cur = new Uint8Array(cols * rows), nxt = new Uint8Array(cols * rows);
    const w = { cols, rows, gen: 0, get cells() { return cur; } };

    const idx = (x, y) => ((y % rows + rows) % rows) * cols + ((x % cols + cols) % cols);
    w.get = (x, y) => cur[idx(x, y)];
    w.set = (x, y, v) => { cur[idx(x, y)] = v ? 1 : 0; };
    w.clear = () => { cur.fill(0); w.gen = 0; };
    w.random = (p) => { for (let i = 0; i < cur.length; i++) cur[i] = Math.random() < p ? 1 : 0; w.gen = 0; };
    w.count = () => { let n = 0; for (let i = 0; i < cur.length; i++) n += cur[i]; return n; };

    /** One generation (B3/S23). Neighbour rows/cols are precomputed per row for wrap-around. */
    w.step = () => {
      for (let y = 0; y < rows; y++) {
        const up = ((y + rows - 1) % rows) * cols, mid = y * cols, dn = ((y + 1) % rows) * cols;
        for (let x = 0; x < cols; x++) {
          const l = x === 0 ? cols - 1 : x - 1, r = x === cols - 1 ? 0 : x + 1;
          const n = cur[up + l] + cur[up + x] + cur[up + r] + cur[mid + l] + cur[mid + r] + cur[dn + l] + cur[dn + x] + cur[dn + r];
          nxt[mid + x] = n === 3 || (n === 2 && cur[mid + x]) ? 1 : 0;
        }
      }
      const t = cur; cur = nxt; nxt = t; w.gen++;
    };

    /** Stamp pattern cells ([[x,y],...]) centred on (cx, cy). */
    w.stamp = (cells, cx, cy) => {
      let mx = 0, my = 0; for (const [x, y] of cells) { mx = Math.max(mx, x); my = Math.max(my, y); }
      const ox = cx - (mx >> 1), oy = cy - (my >> 1);
      for (const [x, y] of cells) w.set(ox + x, oy + y, 1);
    };
    /** Load / save as a compact string of 0/1 runs (for localStorage). */
    w.dump = () => { let s = ''; for (let i = 0; i < cur.length; i++) s += cur[i]; return s; };
    w.load = (s) => { if (!s || s.length !== cur.length) return false; for (let i = 0; i < cur.length; i++) cur[i] = s.charCodeAt(i) === 49 ? 1 : 0; return true; };
    return w;
  }
  return { create };
})();
