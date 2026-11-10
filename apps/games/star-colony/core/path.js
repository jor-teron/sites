/* A* with a Manhattan heuristic. Buildings are walk-through airlocked tiles. */
(function (root) {
  'use strict';
  function path(s, start, goal) {
    const key = (x, y) => y * s.w + x;
    const valid = (x, y) => x >= 0 && y >= 0 && x < s.w && y < s.h && s.terrain[key(x, y)] !== 'rock';
    if (!valid(goal.x, goal.y) || !valid(start.x, start.y)) return null;
    const from = key(Math.round(start.x), Math.round(start.y)), to = key(goal.x, goal.y);
    const open = [{ k: from, g: 0, f: 0 }], best = new Map([[from, 0]]), prev = new Map();
    while (open.length) {
      let m = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[m].f) m = i;
      const cur = open.splice(m, 1)[0];
      if (cur.g !== best.get(cur.k)) continue;
      if (cur.k === to) {
        const out = []; let k = to;
        while (k !== from) { out.unshift({ x: k % s.w, y: Math.floor(k / s.w) }); k = prev.get(k); }
        return out;
      }
      const x = cur.k % s.w, y = Math.floor(cur.k / s.w);
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        const nx = x + dx, ny = y + dy, k = key(nx, ny), g = cur.g + 1;
        if (!valid(nx, ny) || g >= (best.get(k) ?? Infinity)) continue;
        best.set(k, g); prev.set(k, cur.k);
        open.push({ k, g, f: g + Math.abs(goal.x - nx) + Math.abs(goal.y - ny) });
      }
    }
    return null;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = path;
  else root.SCPath = path;
})(typeof globalThis !== 'undefined' ? globalThis : this);
