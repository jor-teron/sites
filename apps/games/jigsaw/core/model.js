/* JIG-1a: deterministic geometry and pure movement rules; classic script + Node. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JigsawModel = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  function random(seed) {
    return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function grid(count, aspect) {
    let cols = count, rows = 1, error = Infinity;
    for (let r = 1; r <= count; r++) if (count % r === 0) {
      const c = count / r, e = Math.abs(Math.log(c / r / aspect));
      if (e < error) { cols = c; rows = r; error = e; }
    }
    return { cols, rows };
  }
  function create(count, aspect, seed) {
    const { cols, rows } = grid(count, aspect), rng = random(seed), w = 1000 / cols, h = 1000 / aspect / rows;
    const edge = () => ({ sign: rng() < .5 ? -1 : 1, depth: .85 + rng() * .25, neck: .12 + rng() * .04 });
    const pieces = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const id = r * cols + c, left = c ? pieces[id - 1].edges[1] : null;
      const top = r ? pieces[id - cols].edges[2] : null;
      pieces.push({ id, r, c, tx: c * w, ty: r * h, x: c * w, y: r * h, group: id, locked: false,
        edges: [top && { ...top, sign: -top.sign }, c === cols - 1 ? null : edge(),
          r === rows - 1 ? null : edge(), left && { ...left, sign: -left.sign }] });
    }
    return { version: 1, count, aspect, seed, cols, rows, w, h, pieces };
  }
  // Symmetric Bezier profile: reversing a shared edge and its sign gives exactly the same curve.
  function edgeSegments(ax, ay, bx, by, edge, size) {
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    const at = (t, d = 0) => [ax + dx * t + dy / len * d, ay + dy * t - dx / len * d];
    if (!edge) return [{ kind: 'line', points: [at(1)] }];
    const d = edge.sign * size * .24 * edge.depth, n = edge.neck;
    return [{ kind: 'line', points: [at(.5 - n)] },
      { kind: 'curve', points: [at(.5 - n / 3), at(.5 - n * 1.5, d), at(.5, d)] },
      { kind: 'curve', points: [at(.5 + n * 1.5, d), at(.5 + n / 3), at(.5 + n)] },
      { kind: 'line', points: [at(1)] }];
  }
  const group = (s, id) => s.pieces.filter(p => p.group === id);
  const adjacent = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
  const isEdge = p => p.edges.some(e => !e);
  function move(s, id, dx, dy) {
    const p = s.pieces[id]; if (!p || p.locked) return;
    group(s, p.group).forEach(q => { q.x += dx; q.y += dy; });
  }
  function settle(s, id, tolerance) {
    let p = s.pieces[id]; if (!p || p.locked) return false;
    let changed = false, again = true;
    while (again) {
      again = false;
      const members = group(s, p.group), ox = p.x - p.tx, oy = p.y - p.ty;
      if (Math.hypot(ox, oy) <= tolerance) {
        members.forEach(q => { q.x = q.tx; q.y = q.ty; q.locked = true; });
        return true;
      }
      outer: for (const a of members) for (const b of s.pieces) {
        if (a.group === b.group || !adjacent(a, b)) continue;
        const dx = b.x - b.tx - ox, dy = b.y - b.ty - oy;
        if (Math.hypot(dx, dy) > tolerance) continue;
        const target = b.group;
        members.forEach(q => { q.x += dx; q.y += dy; q.group = target; q.locked = b.locked; });
        changed = again = true; p = s.pieces[id];
        if (p.locked) return true;
        break outer;
      }
    }
    return changed;
  }
  function restore(raw) {
    if (!raw || raw.version !== 1 || ![12,24,48,100,150,200,300].includes(raw.count) ||
        !Number.isFinite(raw.aspect) || raw.aspect < .25 || raw.aspect > 4 || !Number.isInteger(raw.seed)) return null;
    const s = create(raw.count, raw.aspect, raw.seed);
    if (!Array.isArray(raw.pieces) || raw.pieces.length !== s.count) return null;
    const groups = new Map();
    for (let i = 0; i < s.count; i++) {
      const p = raw.pieces[i], q = s.pieces[i];
      if (!p || p.id !== i || !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 1e6 ||
          Math.abs(p.y) > 1e6 || !Number.isInteger(p.group) || p.group < 0 || p.group >= s.count || typeof p.locked !== 'boolean') return null;
      const offset = [p.x - q.tx, p.y - q.ty, p.locked], old = groups.get(p.group);
      if (p.locked && Math.hypot(offset[0], offset[1]) > .001) return null;
      if (old && (Math.hypot(old[0] - offset[0], old[1] - offset[1]) > .001 || old[2] !== p.locked)) return null;
      groups.set(p.group, offset); Object.assign(q, { x: p.x, y: p.y, group: p.group, locked: p.locked });
    }
    return s;
  }
  return { random, grid, create, edgeSegments, group, adjacent, isEdge, move, settle, restore,
    complete: s => s.pieces.every(p => p.locked) };
});
