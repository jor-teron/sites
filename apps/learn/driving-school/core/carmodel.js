/* DS-6: higher quality traffic cars. DOM-free and three.js-free, so Node can test it.
   A car is a short list of low-poly parts (boxes, tapered boxes and 8-sided wheels) merged
   into ONE triangle list with per-vertex colours: one mesh and one shared material per car.
   Car frame: x forward (front bumper at +x), y up (wheels touch y = 0), z across the car.
   Colours are sRGB hex in the parts and linear 0-1 in the arrays (what three.js expects). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object') module.exports = api;
  else Object.assign(root.DS = root.DS || {}, api);
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const CAR_PALETTE = ['#e3b85f', '#df798b', '#a8abd9', '#e3e5da', '#6fa8c9', '#c95f4a', '#7fae7a', '#5a5f66'];
  const PART = { glass: '#2a3a47', trim: '#2f3337', tyre: '#1c1f22', hub: '#b9bec2', head: '#fff2c4', tail: '#c4303c', plate: '#f2f2ea' };
  // Three body shapes: length, width, body height, window base and roof x ranges, roof top, wheelbase (metres).
  const VARIANTS = {
    hatch: { len: 3.8, wid: 1.7, body: .62, cab: [-1.55, .55], roof: [-1.45, .05], top: 1.48, base: 2.4 },
    sedan: { len: 4.3, wid: 1.76, body: .6, cab: [-1.2, .85], roof: [-.85, .3], top: 1.44, base: 2.6 },
    suv: { len: 4.4, wid: 1.82, body: .78, cab: [-1.9, .75], roof: [-1.85, .2], top: 1.78, base: 2.7 }
  };
  const VARIANT_NAMES = Object.keys(VARIANTS);
  const variantOf = i => VARIANT_NAMES[((i | 0) % VARIANT_NAMES.length + VARIANT_NAMES.length) % VARIANT_NAMES.length];
  // Parts list. box: x0..x1 along, y0..y1 up, width w. taper: top face x range and width differ.
  function carParts(variant = 'sedan') {
    const v = VARIANTS[variant] || VARIANTS.sedan, h = v.len / 2, w = v.wid, y0 = .28, y1 = y0 + v.body, r = .33;
    const box = (x0, x1, ya, yb, wd, color) => ({ kind: 'box', x0, x1, y0: ya, y1: yb, w: wd, color });
    const parts = [
      box(-h + .12, h - .12, y0, y1, w, 'body'),                                                   // lower body
      { kind: 'taper', x0: v.cab[0], x1: v.cab[1], tx0: v.roof[0], tx1: v.roof[1], y0: y1, y1: v.top - .06, w: w - .1, tw: w - .3, color: 'glass' },  // windows
      box(v.roof[0] - .04, v.roof[1] + .04, v.top - .06, v.top, w - .26, 'body'),                // roof
      box(h - .14, h + .02, y0 - .04, y0 + .22, w + .04, PART.trim),                             // front bumper
      box(-h - .02, -h + .14, y0 - .04, y0 + .22, w + .04, PART.trim),                           // rear bumper
      box(h - .14, h + .03, y0 + .07, y0 + .19, .5, PART.plate),                                 // front number plate
      box(-h - .03, -h + .14, y0 + .07, y0 + .19, .5, PART.plate)                                // rear number plate
    ];
    for (const s of [1, -1]) {
      const z = s * (w / 2 - .22);
      parts.push({ kind: 'box', x0: h - .14, x1: h - .1, y0: y1 - .2, y1: y1 - .06, w: .34, z, color: PART.head });   // headlight
      parts.push({ kind: 'box', x0: -h + .1, x1: -h + .14, y0: y1 - .22, y1: y1 - .08, w: .36, z, color: PART.tail });   // tail light
      parts.push({ kind: 'box', x0: v.cab[1] - .2, x1: v.cab[1] - .05, y0: y1 + .02, y1: y1 + .14, w: .14, z: s * (w / 2 + .06), color: 'body' });  // door mirror
      for (const ax of [v.base / 2, -v.base / 2]) parts.push({ kind: 'wheel', x: ax, y: r, z: s * (w / 2 - .1), r, w: .24, sides: 8, color: PART.tyre },
        { kind: 'box', x0: ax - .13, x1: ax + .13, y0: r - .13, y1: r + .13, w: .03, z: s * (w / 2 + .035), color: PART.hub });   // wheel + hub cap
    }
    return parts;
  }
  const lin = c => c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4);
  function hexToLinear(hex) {
    const n = parseInt(String(hex).replace('#', ''), 16);
    return [lin((n >> 16 & 255) / 255), lin((n >> 8 & 255) / 255), lin((n & 255) / 255)];
  }
  // Corners of a (tapered) box: bottom 0-3, top 4-7.
  function hexCorners(p) {
    const z = p.z || 0, bw = p.w / 2, tw = (p.tw ?? p.w) / 2, tx0 = p.tx0 ?? p.x0, tx1 = p.tx1 ?? p.x1;
    return [[p.x0, p.y0, z - bw], [p.x1, p.y0, z - bw], [p.x1, p.y0, z + bw], [p.x0, p.y0, z + bw],
      [tx0, p.y1, z - tw], [tx1, p.y1, z - tw], [tx1, p.y1, z + tw], [tx0, p.y1, z + tw]];
  }
  const HEX_QUADS = [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]];
  const partTriangles = p => p.kind === 'wheel' ? p.sides * 4 - 4 : 12;
  function countTriangles(parts) { let n = 0; for (const p of parts) n += partTriangles(p); return n; }
  // Merge every part into flat position / normal / colour arrays (non-indexed, flat shaded).
  function buildCarArrays(color = CAR_PALETTE[0], variant = 'sedan') {
    const parts = carParts(variant), tris = countTriangles(parts);
    const position = new Float32Array(tris * 9), normal = new Float32Array(tris * 9), colour = new Float32Array(tris * 9);
    const body = hexToLinear(color);
    let o = 0, rgb = body, cx = 0, cy = 0, cz = 0;
    function tri(a, b, c) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1; nx /= len; ny /= len; nz /= len;
      // Point the normal (and the winding) away from the part centre, so lighting is right.
      const mx = (a[0] + b[0] + c[0]) / 3 - cx, my = (a[1] + b[1] + c[1]) / 3 - cy, mz = (a[2] + b[2] + c[2]) / 3 - cz;
      if (nx * mx + ny * my + nz * mz < 0) { const t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz; }
      for (const q of [a, b, c]) {
        position[o] = q[0]; position[o + 1] = q[1]; position[o + 2] = q[2];
        normal[o] = nx; normal[o + 1] = ny; normal[o + 2] = nz;
        colour[o] = rgb[0]; colour[o + 1] = rgb[1]; colour[o + 2] = rgb[2]; o += 3;
      }
    }
    for (const p of parts) {
      rgb = p.color === 'body' ? body : hexToLinear(p.color === 'glass' ? PART.glass : p.color);
      if (p.kind === 'wheel') {
        cx = p.x; cy = p.y; cz = p.z;
        const ring = [];
        for (let i = 0; i < p.sides; i++) { const a = (i + .5) / p.sides * Math.PI * 2; ring.push([p.x + Math.cos(a) * p.r, p.y + Math.sin(a) * p.r]); }
        const zi = p.z - p.w / 2, zo = p.z + p.w / 2;
        for (let i = 0; i < p.sides; i++) {
          const A = ring[i], B = ring[(i + 1) % p.sides];
          tri([A[0], A[1], zi], [B[0], B[1], zi], [B[0], B[1], zo]); tri([A[0], A[1], zi], [B[0], B[1], zo], [A[0], A[1], zo]);
        }
        for (const z of [zi, zo]) for (let i = 1; i < p.sides - 1; i++) tri([ring[0][0], ring[0][1], z], [ring[i][0], ring[i][1], z], [ring[i + 1][0], ring[i + 1][1], z]);
        continue;
      }
      const k = hexCorners(p);
      cx = 0; cy = 0; cz = 0; for (const q of k) { cx += q[0] / 8; cy += q[1] / 8; cz += q[2] / 8; }
      for (const [a, b, c, d] of HEX_QUADS) { tri(k[a], k[b], k[c]); tri(k[a], k[c], k[d]); }
    }
    return { position, normal, color: colour, triangles: tris, parts: parts.length, variant: VARIANTS[variant] ? variant : 'sedan' };
  }
  function carBounds(arr) {
    const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
    for (let i = 0; i < arr.position.length; i += 3) for (let a = 0; a < 3; a++) { const v = arr.position[i + a]; if (v < min[a]) min[a] = v; if (v > max[a]) max[a] = v; }
    return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
  }
  return { CAR_PALETTE, CAR_PARTS: PART, CAR_VARIANTS: VARIANTS, carVariantOf: variantOf, carParts, carTriangles: countTriangles, buildCarArrays, carBounds, hexToLinear };
});
