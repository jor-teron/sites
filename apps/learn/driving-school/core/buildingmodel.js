/* DS-8: higher quality houses and town buildings. DOM-free and three.js-free (Node tests it).
   Every building type is merged into ONE flat-shaded triangle list with per-vertex colours:
   walls, parapet or roof, water tank, window rows, doors, signboards and awnings.
   Placement, footprints and heights are unchanged; only the look is new.
   Frame: base at y = 0, centred on x and z. Road houses are built in a UNIT box (x, z in
   -0.5..0.5, y 0..1) that the instance scales by (w, ht, d), exactly like the old unit cube.
   Town buildings are built in metres at their real size (22 x 15 m, height 7-13 m).
   Detail quads sit EPS outside the wall so they never flicker; they stay inside 1% / 5 cm. */
(function (root, factory) {
  const api = factory(typeof module === 'object' ? require('./carmodel.js') : root.DS);
  if (typeof module === 'object') module.exports = api;
  else Object.assign(root.DS = root.DS || {}, api);
})(typeof window === 'object' ? window : globalThis, function (C) {
  'use strict';
  // House walls are white in the geometry: the instance colour (the old house palette) paints them.
  const BCOL = { wall: '#ffffff', roof: '#d9d6cc', parapet: '#efece4', glass: '#34414c', frame: '#e8e4da', door: '#5b3d26', tank: '#24282b',
    band: '#c9c4b8', mud: '#b58d5c', mud2: '#a67c4f', thatch: '#c9a55a', thatch2: '#a88845', sign: '#f4f1e6', signFrame: '#203040',
    shutter: '#8f979c', awning: ['#d9534f', '#f2efe6'], cross: '#2f9e5b', hedge: '#3d6e4a' };
  const HOUSE_TYPES = ['house2', 'house3', 'house4', 'hut'];
  // Which house model a road house uses: huts keep c = 4; city houses by height (floors).
  function houseKind(t) { return t.c === 4 ? 'hut' : t.ht < 9 ? 'house2' : t.ht < 12.5 ? 'house3' : 'house4'; }

  // ---------- a tiny mesh builder (arrays grow once at start-up, never per frame) ----------
  function builder() {
    const pos = [], nor = [], col = [];
    let rgb = [1, 1, 1], cen = [0, 0, 0];
    const api = {
      color(hex) { rgb = C.hexToLinear(hex); return api; },
      centre(x, y, z) { cen = [x, y, z]; return api; },
      tri(a, b, c) {
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const len = Math.hypot(nx, ny, nz) || 1; nx /= len; ny /= len; nz /= len;
        const mx = (a[0] + b[0] + c[0]) / 3 - cen[0], my = (a[1] + b[1] + c[1]) / 3 - cen[1], mz = (a[2] + b[2] + c[2]) / 3 - cen[2];
        if (nx * mx + ny * my + nz * mz < 0) { const t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz; }   // face away from the centre
        for (const q of [a, b, c]) { pos.push(q[0], q[1], q[2]); nor.push(nx, ny, nz); col.push(rgb[0], rgb[1], rgb[2]); }
        return api;
      },
      quad(a, b, c, d) { return api.tri(a, b, c).tri(a, c, d); },
      // Box x0..x1, y0..y1, z0..z1 without its bottom face (never seen): 10 triangles.
      box(x0, x1, y0, y1, z0, z1) {
        api.centre((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
        const p = (x, y, z) => [x, y, z];
        api.quad(p(x0, y1, z0), p(x1, y1, z0), p(x1, y1, z1), p(x0, y1, z1));
        api.quad(p(x0, y0, z0), p(x1, y0, z0), p(x1, y1, z0), p(x0, y1, z0)); api.quad(p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1));
        api.quad(p(x0, y0, z0), p(x0, y0, z1), p(x0, y1, z1), p(x0, y1, z0)); api.quad(p(x1, y0, z0), p(x1, y0, z1), p(x1, y1, z1), p(x1, y1, z0));
        return api;
      },
      // Upright n-sided cylinder with a top cap.
      drum(x, z, rx, rz, y0, y1, n) {
        api.centre(x, (y0 + y1) / 2, z);
        const ring = y => { const o = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; o.push([x + Math.cos(a) * rx, y, z + Math.sin(a) * rz]); } return o; };
        const lo = ring(y0), hi = ring(y1);
        for (let i = 0; i < n; i++) { const j = (i + 1) % n; api.quad(lo[i], lo[j], hi[j], hi[i]); }
        api.centre(x, y0, z); for (let i = 1; i < n - 1; i++) api.tri(hi[0], hi[i], hi[i + 1]);
        return api;
      },
      // A flat panel on a wall face. f = '+z' | '-z' | '+x' | '-x'; u runs along the face, v is height.
      panel(W, D, f, eps, u0, u1, v0, v1) {
        const P = (u, v) => f === '+z' ? [u, v, D / 2 + eps] : f === '-z' ? [-u, v, -D / 2 - eps] : f === '+x' ? [W / 2 + eps, v, -u] : [-W / 2 - eps, v, u];
        const n = f === '+z' ? [0, 0, 1] : f === '-z' ? [0, 0, -1] : f === '+x' ? [1, 0, 0] : [-1, 0, 0];
        const a = P(u0, v0); api.centre(a[0] - n[0], a[1], a[2] - n[2]);
        return api.quad(P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1));
      },
      done() { return { position: new Float32Array(pos), normal: new Float32Array(nor), color: new Float32Array(col), triangles: pos.length / 9 }; }
    };
    return api;
  }
  const faceLen = (W, D, f) => f[1] === 'z' ? W : D;

  // ---------- road houses (unit box) ----------
  function houseArrays(kind = 'house2') {
    if (!HOUSE_TYPES.includes(kind)) kind = 'house2';
    const b = builder(), E = .004;
    if (kind === 'hut') {
      // Mud walls, a small door and window, and a thatch-style pitched roof with its ridge along x.
      b.color(BCOL.mud).box(-.5, .5, 0, .58, -.5, .5);
      for (const f of ['+z', '-z']) { b.color(BCOL.door).panel(1, 1, f, E, -.1, .1, 0, .4); b.color(BCOL.mud2).panel(1, 1, f, E, .22, .38, .26, .42); }
      b.centre(0, .5, 0).color(BCOL.thatch);
      b.quad([-.5, .55, .5], [.5, .55, .5], [.5, 1, 0], [-.5, 1, 0]); b.color(BCOL.thatch2).quad([-.5, .55, -.5], [.5, .55, -.5], [.5, 1, 0], [-.5, 1, 0]);
      b.color(BCOL.thatch); for (const x of [-.5, .5]) { b.centre(0, .6, 0); b.tri([x, .55, .5], [x, .55, -.5], [x, 1, 0]); }
      return Object.assign(b.done(), { kind, floors: 1 });
    }
    const floors = { house2: 2, house3: 3, house4: 4 }[kind], top = .92, fh = top / floors;
    b.color(BCOL.wall).box(-.5, .5, 0, top, -.5, .5);                                     // walls (instance colour)
    // Flat roof with a low parapet (India-style terrace) and a black water tank.
    b.color(BCOL.roof).box(-.47, .47, top, top + .005, -.47, .47);
    b.color(BCOL.parapet);
    b.box(-.5, .5, top, 1, -.5, -.47).box(-.5, .5, top, 1, .47, .5).box(-.5, -.47, top, 1, -.47, .47).box(.47, .5, top, 1, -.47, .47);
    b.color(BCOL.tank).drum(.28, -.18, .06, .07, top, top + .075, 6);
    for (const f of ['+z', '-z']) {
      for (let k = 0; k < floors; k++) {
        const v0 = k * fh + fh * .32, v1 = k * fh + fh * .78;
        if (k) b.color(BCOL.band).panel(1, 1, f, E * .5, -.5, .5, k * fh - .008, k * fh + .008);   // floor band
        for (const u of [-.32, 0, .32]) {
          if (!k && u === 0) { b.color(BCOL.door).panel(1, 1, f, E, -.07, .07, 0, fh * .82); continue; }   // ground-floor door
          b.color(BCOL.glass).panel(1, 1, f, E, u - .08, u + .08, v0, v1);
        }
      }
    }
    return Object.assign(b.done(), { kind, floors });
  }

  // ---------- town buildings (metres) ----------
  // The face that looks at the nearest road (roads run along x = n and y = n in the town map).
  function frontFace(x, y, w, d, roads) {
    let best = '+z', gap = 1e9;
    for (const n of roads) {
      const cand = [['-z', y - n], ['+z', n - (y + d)], ['-x', x - n], ['+x', n - (x + w)]];
      for (const [f, g] of cand) if (g >= 0 && g < gap) { gap = g; best = f; }
    }
    return best;
  }
  function townBuildingArrays(name, color, h, front = '+z', W = 22, D = 15) {
    const b = builder(), E = .03, faces = ['+z', '-z', '+x', '-x'], park = name === 'PARK', shops = name === 'SHOPS';
    b.color(color).box(-W / 2, W / 2, 0, h, -D / 2, D / 2);
    b.color(BCOL.roof).box(-W / 2 + .3, W / 2 - .3, h, h + .02, -D / 2 + .3, D / 2 - .3);
    b.color(BCOL.parapet);
    b.box(-W / 2, W / 2, h, h + .9, -D / 2, -D / 2 + .3).box(-W / 2, W / 2, h, h + .9, D / 2 - .3, D / 2)
      .box(-W / 2, -W / 2 + .3, h, h + .9, -D / 2 + .3, D / 2 - .3).box(W / 2 - .3, W / 2, h, h + .9, -D / 2 + .3, D / 2 - .3);
    if (!park) b.color(BCOL.tank).drum(W / 2 - 2.2, -D / 2 + 2, .7, .7, h, h + 1.2, 6);
    const floors = Math.max(2, Math.floor(h / 3.4)), fh = (h - 1) / floors;
    for (const f of faces) {
      const L = faceLen(W, D, f), cols = Math.max(2, Math.floor(L / 3.6)), step = L / cols, isFront = f === front;
      for (let k = 0; k < floors; k++) {
        if (k) b.color(BCOL.band).panel(W, D, f, E * .5, -L / 2, L / 2, k * fh - .12, k * fh + .12);
        for (let i = 0; i < cols; i++) {
          const u = -L / 2 + step * (i + .5);
          if (!k && isFront && Math.abs(u) < step * .6) continue;                         // entrance gap
          if (!k && shops && isFront) { b.color(BCOL.shutter).panel(W, D, f, E, u - step * .42, u + step * .42, 0, fh * .78); continue; }
          if (park) { b.color(BCOL.hedge).panel(W, D, f, E, u - step * .4, u + step * .4, k * fh + .4, k * fh + fh * .8); continue; }   // trellis panels
          b.color(BCOL.frame).panel(W, D, f, E * .6, u - .75, u + .75, k * fh + .8, k * fh + 2.3);
          b.color(BCOL.glass).panel(W, D, f, E, u - .6, u + .6, k * fh + .95, k * fh + 2.15);
        }
      }
      if (isFront) {
        b.color(BCOL.door).panel(W, D, f, E, -1.2, 1.2, 0, 2.6);                         // entrance doors
        b.color(BCOL.signFrame).panel(W, D, f, E, -L * .32, L * .32, h - 1.05, h - .05);   // signboard (label is the sprite above)
        b.color(BCOL.sign).panel(W, D, f, E * 1.6, -L * .3, L * .3, h - .95, h - .15);
        // Entrance canopy: a thin slab sticking out over the door.
        const s = f[0] === '+' ? 1 : -1, out = 1.6;
        if (f[1] === 'z') b.color(BCOL.parapet).box(-1.8, 1.8, 2.8, 3.0, s > 0 ? D / 2 : -D / 2 - out, s > 0 ? D / 2 + out : -D / 2);
        else b.color(BCOL.parapet).box(s > 0 ? W / 2 : -W / 2 - out, s > 0 ? W / 2 + out : -W / 2, 2.8, 3.0, -1.8, 1.8);
        if (name === 'CLINIC') {   // green cross (a common medical sign; not the protected red cross)
          b.color(BCOL.cross).panel(W, D, f, E * 2.2, L * .34, L * .34 + .4, h - 2.2, h - .9).panel(W, D, f, E * 2.2, L * .34 - .45, L * .34 + .85, h - 1.75, h - 1.35);
        }
        if (shops) for (let i = 0; i < cols; i++) {   // striped awnings over the shop fronts
          const u = -L / 2 + step * (i + .5); if (Math.abs(u) < step * .6) continue;
          b.color(BCOL.awning[i % 2]);
          const y0 = fh * .82, y1 = fh * .95, o = 1.1, a = u - step * .45, c = u + step * .45, sx = s;
          const P = (uu, y, outw) => f[1] === 'z' ? [sx * uu, y, sx * (D / 2 + outw)] : [sx * (W / 2 + outw), y, -sx * uu];
          b.centre(...P(u, y0, -1)).quad(P(a, y1, .02), P(c, y1, .02), P(c, y0, o), P(a, y0, o));
        }
      }
    }
    return Object.assign(b.done(), { name, floors, front });
  }
  function bounds(arr) {
    const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
    for (let i = 0; i < arr.position.length; i += 3) for (let a = 0; a < 3; a++) { const v = arr.position[i + a]; if (v < min[a]) min[a] = v; if (v > max[a]) max[a] = v; }
    return { min, max };
  }
  // Same storey heights as before: buildings[i] is 7 + (i % 3) * 3 metres tall.
  const townBuildingHeight = i => 7 + (i % 3) * 3;
  return { HOUSE_TYPES, BUILDING_COLOURS: BCOL, houseKind, houseArrays, frontFace, townBuildingArrays, townBuildingHeight, buildingBounds: bounds };
});
