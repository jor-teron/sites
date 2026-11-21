/* DS-7: higher quality trees. DOM-free and three.js-free, so Node can test it.
   Three tree types, each merged into ONE small triangle list with per-vertex colours, so the
   scene draws each type as a single InstancedMesh (one draw call for hundreds of trees).
   Tree frame: base at y = 0, height 1 (the instance scales y by the tree height in metres);
   x and z are metres (the instance scales them by a small spread factor around 1).
   Placement is unchanged (core/roadgen.js); these helpers only pick a look for each tree. */
(function (root, factory) {
  const api = factory(typeof module === 'object' ? require('./carmodel.js') : root.DS);
  if (typeof module === 'object') module.exports = api;
  else Object.assign(root.DS = root.DS || {}, api);
})(typeof window === 'object' ? window : globalThis, function (C) {
  'use strict';
  const TREE_TYPES = ['conifer', 'broadleaf', 'palm'];
  const COL = { bark: '#6b4a32', palmBark: '#8a6d4c', pine: ['#2c6542', '#33724c', '#3c8056'], leaf: ['#4a873b', '#5b9946'], frond: '#5f9b3a', nut: '#7a5a2e' };
  // How likely each type is beside each road type (conifer, broadleaf, palm).
  const MIX = { highway: [.25, .6, .15], ghat: [.7, .3, 0], village: [.1, .55, .35], town: [.5, .5, 0] };
  // Icosahedron (12 points, 20 faces) for round canopies.
  const P = (1 + Math.sqrt(5)) / 2;
  const ICO_V = [[-1, P, 0], [1, P, 0], [-1, -P, 0], [1, -P, 0], [0, -1, P], [0, 1, P], [0, -1, -P], [0, 1, -P], [P, 0, -1], [P, 0, 1], [-P, 0, -1], [-P, 0, 1]].map(v => { const l = Math.hypot(...v); return v.map(n => n / l); });
  const ICO_F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  const OCT_V = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const OCT_F = [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [0, 4, 3], [4, 1, 3], [1, 5, 3], [5, 0, 3]];
  // Part list: prism (trunk, r1 > 0) or cone (r1 = 0), blob (scaled ico/octahedron), blade (palm frond).
  function treeParts(type = 'broadleaf') {
    if (type === 'conifer') return [
      { kind: 'prism', y0: 0, y1: .22, r0: .2, r1: .16, sides: 5, color: COL.bark },
      { kind: 'prism', y0: .14, y1: .56, r0: 1.9, r1: 0, sides: 6, cap: true, color: COL.pine[0] },
      { kind: 'prism', y0: .38, y1: .8, r0: 1.5, r1: 0, sides: 6, cap: true, color: COL.pine[1], twist: .5 },
      { kind: 'prism', y0: .6, y1: 1, r0: 1.05, r1: 0, sides: 6, cap: true, color: COL.pine[2] }
    ];
    if (type === 'palm') {
      const parts = [{ kind: 'prism', y0: 0, y1: .9, r0: .17, r1: .11, sides: 5, color: COL.palmBark },
        { kind: 'blob', shape: 'oct', x: 0, y: .88, z: 0, rx: .3, ry: .035, rz: .3, color: COL.nut }];
      for (let i = 0; i < 8; i++) parts.push({ kind: 'blade', a: i / 8 * Math.PI * 2 + .3, len: 2.4, wide: .75, y: .92, mid: .95, tip: .78, color: COL.frond });
      return parts;
    }
    return [
      { kind: 'prism', y0: 0, y1: .48, r0: .24, r1: .17, sides: 5, color: COL.bark },
      { kind: 'blob', shape: 'ico', x: 0, y: .64, z: 0, rx: 2.4, ry: .26, rz: 2.4, color: COL.leaf[0] },
      { kind: 'blob', shape: 'ico', x: .6, y: .82, z: -.3, rx: 1.5, ry: .18, rz: 1.5, color: COL.leaf[1] }
    ];
  }
  const partTriangles = p => p.kind === 'prism' ? p.sides * (p.r1 > 0 ? 2 : 1) + (p.cap ? p.sides - 2 : 0) : p.kind === 'blob' ? (p.shape === 'oct' ? 8 : 20) : 2;
  function treeTriangles(parts) { let n = 0; for (const p of parts) n += partTriangles(p); return n; }
  function buildTreeArrays(type = 'broadleaf') {
    if (!TREE_TYPES.includes(type)) type = 'broadleaf';
    const parts = treeParts(type), tris = treeTriangles(parts);
    const position = new Float32Array(tris * 9), normal = new Float32Array(tris * 9), color = new Float32Array(tris * 9);
    let o = 0, rgb = null, cen = [0, 0, 0];
    function tri(a, b, c) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1; nx /= len; ny /= len; nz /= len;
      const mx = (a[0] + b[0] + c[0]) / 3 - cen[0], my = (a[1] + b[1] + c[1]) / 3 - cen[1], mz = (a[2] + b[2] + c[2]) / 3 - cen[2];
      if (nx * mx + ny * my + nz * mz < 0) { const t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz; }   // face away from the part centre
      for (const q of [a, b, c]) {
        position[o] = q[0]; position[o + 1] = q[1]; position[o + 2] = q[2]; normal[o] = nx; normal[o + 1] = ny; normal[o + 2] = nz;
        color[o] = rgb[0]; color[o + 1] = rgb[1]; color[o + 2] = rgb[2]; o += 3;
      }
    }
    for (const p of parts) {
      rgb = C.hexToLinear(p.color);
      if (p.kind === 'prism') {
        const ring = (r, y) => { const out = []; for (let i = 0; i < p.sides; i++) { const a = (i + (p.twist || 0)) / p.sides * Math.PI * 2; out.push([Math.cos(a) * r, y, Math.sin(a) * r]); } return out; };
        const lo = ring(p.r0, p.y0), hi = ring(p.r1, p.y1), apex = [0, p.y1, 0];
        // Cones: centre a third of the way up, so the underside cap faces down and the sides face out.
        cen = [0, p.r1 > 0 ? (p.y0 + p.y1) / 2 : p.y0 + (p.y1 - p.y0) / 3, 0];
        for (let i = 0; i < p.sides; i++) {
          const j = (i + 1) % p.sides;
          if (p.r1 > 0) { tri(lo[i], lo[j], hi[j]); tri(lo[i], hi[j], hi[i]); } else tri(lo[i], lo[j], apex);
        }
        if (p.cap) for (let i = 1; i < p.sides - 1; i++) tri(lo[0], lo[i], lo[i + 1]);
      } else if (p.kind === 'blob') {
        const V = p.shape === 'oct' ? OCT_V : ICO_V, F = p.shape === 'oct' ? OCT_F : ICO_F;
        const v = V.map(q => [p.x + q[0] * p.rx, p.y + q[1] * p.ry, p.z + q[2] * p.rz]); cen = [p.x, p.y, p.z];
        for (const f of F) tri(v[f[0]], v[f[1]], v[f[2]]);
      } else {   // blade: a drooping leaf from the crown, normal facing up
        const ca = Math.cos(p.a), sa = Math.sin(p.a), px = -sa, pz = ca, h = p.len / 2;
        const base = [0, p.y, 0], tip = [ca * p.len, p.tip, sa * p.len];
        const l = [ca * h + px * p.wide / 2, p.mid, sa * h + pz * p.wide / 2], r = [ca * h - px * p.wide / 2, p.mid, sa * h - pz * p.wide / 2];
        cen = [ca * h, p.mid - 1, sa * h];
        tri(base, l, r); tri(l, tip, r);
      }
    }
    return { position, normal, color, triangles: tris, parts: parts.length, type };
  }
  // Deterministic per-tree choices from its position (no stored state, same look every rebuild).
  function treeHash(x, y) {
    let h = Math.imul(Math.round(x * 8) | 0, 0x27d4eb2d) ^ Math.imul(Math.round(y * 8) | 0, 0x165667b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function treeKind(x, y, road = 'town') {
    const mix = MIX[road] || MIX.town, u = treeHash(x, y);
    return u < mix[0] ? 'conifer' : u < mix[0] + mix[1] ? 'broadleaf' : 'palm';
  }
  // Width spread 0.85-1.15 and a slight colour tint (linear, at most 1, so it only darkens a little).
  function treeSpread(x, y) { return .85 + treeHash(y + 17.3, x - 4.1) * .3; }
  function treeTint(x, y, out = [1, 1, 1]) {
    const a = treeHash(x + 3.7, y + 9.1), b = treeHash(x - 6.2, y + 1.9);
    out[0] = .82 + a * .18; out[1] = .86 + b * .14; out[2] = .8 + (a + b) * .05; return out;
  }
  function treeBounds(arr) {
    const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
    for (let i = 0; i < arr.position.length; i += 3) for (let a = 0; a < 3; a++) { const v = arr.position[i + a]; if (v < min[a]) min[a] = v; if (v > max[a]) max[a] = v; }
    return { min, max };
  }
  return { TREE_TYPES, TREE_MIX: MIX, TREE_COLOURS: COL, treeParts, treeTriangles, buildTreeArrays, treeHash, treeKind, treeSpread, treeTint, treeBounds };
});
