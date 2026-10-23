/**
 * Car Run — shared pseudo-3D model helper (boxes projected with the road camera).
 * Loaded before car.js / traffic_car.js / barrier.js. Registers CAR_RUN_ASSETS.model.
 *
 * Every part is a box (optionally tapered at the top) in WORLD units around the
 * entity's ground centre. Its 8 corners go through the game's own project(), and
 * only faces turned toward the camera are filled (back, roof / hood, and the side
 * that faces the screen centre). So a car in the right lane shows its left side,
 * a car in the left lane shows its right side, and everything leans toward the
 * vanishing point by itself. No gradients or images per frame: face colours are
 * cached per base colour.
 *
 * o (scene info passed by core/logic.js):
 *   project(x, y, z) -> {x, y, k} | null   the road projection
 *   cam: {x, y, z}                         camera position (world)
 *   nearZ                                  nearest drawable world z (corners are clamped to it)
 */
window.CAR_RUN_ASSETS = window.CAR_RUN_ASSETS || {};
(function () {
  'use strict';

  /* ---------- colours ---------- */

  const shadeCache = new Map();

  /** Lighten (amt > 0) or darken (amt < 0) a #rrggbb colour. */
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt));
    return 'rgb(' + f((n >> 16) & 255) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')';
  }

  /** Face colours for one base colour, built once: top lit, back mid, sides darker. */
  function faces(hex) {
    let s = shadeCache.get(hex);
    if (!s) {
      s = { top: shade(hex, 0.22), back: hex, side: shade(hex, -0.28), front: shade(hex, -0.1), edge: shade(hex, -0.55) };
      shadeCache.set(hex, s);
    }
    return s;
  }

  const GLASS = { top: '#3b4f66', back: '#24364a', side: '#1b2a3b', front: '#2c4058', edge: '#0d1622' };
  const TYRE = { top: '#2a2a2e', back: '#151518', side: '#1d1d21', front: '#151518', edge: '#000' };

  /* ---------- geometry ---------- */

  /*
    Placement of a model: world ground centre (x, y, z), yaw (radians, + = nose
    to the right) and roll (+ = lean right), applied to local points.
  */
  function makePlacer(o, x, y, z, yaw, roll) {
    const c = Math.cos(yaw || 0), s = Math.sin(yaw || 0), r = roll || 0;
    return function (lx, ly, lz) {
      return { x: x + lx * c + lz * s + ly * r, y: y + ly, z: z - lx * s + lz * c };
    };
  }

  /* Faces as corner indices (outward winding); normal = (v1 - v0) x (v3 - v0). */
  const FACES = {
    back: [0, 4, 5, 1],
    top: [4, 7, 6, 5],
    left: [0, 3, 7, 4],
    right: [1, 5, 6, 2],
    front: [3, 2, 6, 7],
  };

  /** Project a world point, clamping it to the near plane so close boxes don't vanish. */
  function projW(o, w) {
    const z = Math.max(w.z, o.nearZ);
    return o.project(w.x, w.y, z);
  }

  /**
   * Draw a box. b = { x0, x1, y0, y1, z0, z1, taper?: {x, zBack, zFront} } in local
   * units (z0 = rear, toward the camera). col = face colour set. opts.only = list
   * of face names to allow; opts.after(face, pts) runs after each drawn face.
   * Returns the projected corners (for details) or null.
   */
  function box(ctx, o, place, b, col, opts) {
    const t = b.taper || { x: 0, zBack: 0, zFront: 0 };
    const L = [
      [b.x0, b.y0, b.z0], [b.x1, b.y0, b.z0], [b.x1, b.y0, b.z1], [b.x0, b.y0, b.z1],
      [b.x0 + t.x, b.y1, b.z0 + t.zBack], [b.x1 - t.x, b.y1, b.z0 + t.zBack],
      [b.x1 - t.x, b.y1, b.z1 - t.zFront], [b.x0 + t.x, b.y1, b.z1 - t.zFront],
    ];
    const Wp = new Array(8), P = new Array(8);
    for (let i = 0; i < 8; i++) {
      Wp[i] = place(L[i][0], L[i][1], L[i][2]);
      P[i] = projW(o, Wp[i]);
      if (!P[i]) return null;
    }
    const only = opts && opts.only;
    for (const name in FACES) {
      if (only && only.indexOf(name) === -1) continue;
      const f = FACES[name];
      const a = Wp[f[0]], b1 = Wp[f[1]], d = Wp[f[3]];
      const ux = b1.x - a.x, uy = b1.y - a.y, uz = b1.z - a.z;
      const vx = d.x - a.x, vy = d.y - a.y, vz = d.z - a.z;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const cx = (a.x + Wp[f[2]].x) / 2, cy = (a.y + Wp[f[2]].y) / 2, cz = (a.z + Wp[f[2]].z) / 2;
      if (nx * (o.cam.x - cx) + ny * (o.cam.y - cy) + nz * (o.cam.z - cz) <= 0) continue;
      ctx.fillStyle = name === 'top' ? col.top : name === 'back' ? col.back : name === 'front' ? col.front : col.side;
      ctx.beginPath();
      ctx.moveTo(P[f[0]].x, P[f[0]].y);
      ctx.lineTo(P[f[1]].x, P[f[1]].y);
      ctx.lineTo(P[f[2]].x, P[f[2]].y);
      ctx.lineTo(P[f[3]].x, P[f[3]].y);
      ctx.closePath();
      ctx.fill();
      if (opts && opts.outline) {
        ctx.strokeStyle = col.edge;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      if (opts && opts.after) opts.after(name, P, f);
    }
    return P;
  }

  /** Flat quad on the plane z = lz (local), from (x0, y0) to (x1, y1). */
  function quadZ(ctx, o, place, x0, x1, y0, y1, lz, fill) {
    const a = projW(o, place(x0, y0, lz)), b = projW(o, place(x1, y0, lz));
    const c = projW(o, place(x1, y1, lz)), d = projW(o, place(x0, y1, lz));
    if (!a || !b || !c || !d) return null;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
    return { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2, w: Math.abs(b.x - a.x) };
  }

  /** Soft two-layer ground shadow under a footprint w x len (world), at ground y 0. */
  function shadow(ctx, o, x, z, w, len) {
    const f = projW(o, { x: x, y: 0, z: z + len / 2 });
    const r = projW(o, { x: x, y: 0, z: z - len / 2 });
    if (!f || !r) return;
    const cx = (f.x + r.x) / 2, cy = (f.y + r.y) / 2;
    const rx = r.k * w * 0.56, ry = Math.max(2, (r.y - f.y) / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 1.08, ry * 1.06, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.96, ry * 0.94, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ---------- car ---------- */

  /**
   * Draw a car. m = { x, y, z (world ground centre; z = middle of the car),
   *   w, h, len (world), color '#rrggbb', yaw, roll, braking, nitro, shadowY0 }.
   */
  function drawCar(ctx, o, m) {
    const w = m.w, h = m.h, len = m.len, hw = w / 2, hl = len / 2;
    shadow(ctx, o, m.x, m.z, w, len);
    const place = makePlacer(o, m.x, m.y, m.z, m.yaw, m.roll);
    const body = faces(m.color);

    /* Wheels first (body covers their inner half). */
    const wx0 = hw - w * 0.2, wx1 = hw + w * 0.02, wr = h * 0.36, wl = len * 0.13;
    const wheels = [];
    for (const zc of [hl * 0.62, -hl * 0.62]) {
      for (const sx of [-1, 1]) {
        wheels.push({ x0: sx < 0 ? -wx1 : wx0, x1: sx < 0 ? -wx0 : wx1, y0: 0, y1: wr, z0: zc - wl, z1: zc + wl, outer: sx < 0 ? 'left' : 'right' });
      }
    }
    for (const wb of wheels) box(ctx, o, place, wb, TYRE);

    /* Lower body: slight taper so it reads rounded. */
    const by0 = h * 0.17, by1 = h * 0.58;
    box(ctx, o, place, { x0: -hw, x1: hw, y0: by0, y1: by1, z0: -hl, z1: hl, taper: { x: w * 0.03, zBack: len * 0.02, zFront: len * 0.05 } }, body);

    /* Outer wheel faces over the body side (wheel arches). */
    for (const wb of wheels) box(ctx, o, place, wb, TYRE, { only: [wb.outer], after: hub });

    /* Cabin in body colour (roof + pillars), glass inset on the tapered rear and sides. */
    const cab = { x0: -hw * 0.84, x1: hw * 0.84, y0: by1, y1: h, z0: -hl * 0.58, z1: hl * 0.42,
      taper: { x: w * 0.07, zBack: len * 0.16, zFront: len * 0.12 } };
    box(ctx, o, place, cab, body, { after: windows });

    /* Back-face details. */
    const rz = -hl - 0.004;
    quadZ(ctx, o, place, -hw, hw, by0, by0 + h * 0.09, rz, '#1d1f24');                         // bumper
    quadZ(ctx, o, place, -w * 0.13, w * 0.13, by0 + h * 0.12, by0 + h * 0.22, rz, '#e8e6d8');  // plate
    const lc = m.braking ? '#ff2a2a' : '#9c1414';
    const tl = quadZ(ctx, o, place, -hw * 0.94, -hw * 0.55, by1 - h * 0.14, by1 - h * 0.04, rz, lc);
    const tr = quadZ(ctx, o, place, hw * 0.55, hw * 0.94, by1 - h * 0.14, by1 - h * 0.04, rz, lc);
    if (m.braking && tl && tr) {
      ctx.fillStyle = 'rgba(255,40,40,0.25)';
      for (const L of [tl, tr]) {
        ctx.beginPath();
        ctx.arc(L.x, L.y, Math.max(3, L.w * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    /* Exhaust, glowing with nitro. */
    const ex = projW(o, place(hw * 0.55, by0 + h * 0.045, rz));
    if (ex) {
      const er = Math.max(1, ex.k * w * 0.03);
      ctx.fillStyle = '#3a3d44';
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, er, 0, Math.PI * 2);
      ctx.fill();
      if (m.nitro) {
        const fl = er * (5 + Math.random() * 3);
        ctx.fillStyle = 'rgba(96,165,250,0.35)';
        ctx.beginPath();
        ctx.arc(ex.x, ex.y, er * 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(186,220,255,0.9)';
        ctx.beginPath();
        ctx.ellipse(ex.x, ex.y + fl * 0.45, er * 1.1, fl * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    /* Glass inset inside a cabin face (screen-space bilinear inset of its 4 corners). */
    function windows(name, P, f) {
      if (name === 'top') return;
      /* Corners: back = 0,4,5,1 (bl, tl, tr, br); left = 0,3,7,4; right = 1,5,6,2. */
      const q = f.map((i) => P[i]);
      const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      /* Map (u along the bottom edge, v up) -> screen for the face quad. */
      let bl, br, tl, tr;
      if (name === 'back') { bl = q[0]; tl = q[1]; tr = q[2]; br = q[3]; }
      else if (name === 'left') { bl = q[0]; br = q[1]; tr = q[2]; tl = q[3]; }
      else if (name === 'right') { bl = q[0]; tl = q[1]; tr = q[2]; br = q[3]; }
      else return;
      const at = (u, v) => lerp(lerp(bl, br, u), lerp(tl, tr, u), v);
      const m = name === 'back' ? [0.1, 0.9, 0.14, 0.86] : [0.12, 0.88, 0.16, 0.84];
      const a = at(m[0], m[2]), b = at(m[1], m[2]), c = at(m[1], m[3]), d = at(m[0], m[3]);
      ctx.fillStyle = name === 'back' ? GLASS.back : GLASS.side;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
      if (name === 'back') {
        const e = at(0.18, 0.2), g = at(0.34, 0.2), hh = at(0.26, 0.8), k = at(0.12, 0.8);
        ctx.fillStyle = 'rgba(255,255,255,0.13)';
        ctx.beginPath();
        ctx.moveTo(e.x, e.y); ctx.lineTo(g.x, g.y); ctx.lineTo(hh.x, hh.y); ctx.lineTo(k.x, k.y);
        ctx.closePath();
        ctx.fill();
      }
    }

    /* Hub cap on an outer wheel face. */
    function hub(name, P, f) {
      const cx = (P[f[0]].x + P[f[1]].x + P[f[2]].x + P[f[3]].x) / 4;
      const cy = (P[f[0]].y + P[f[1]].y + P[f[2]].y + P[f[3]].y) / 4;
      const r = Math.max(Math.abs(P[f[1]].y - P[f[0]].y), Math.abs(P[f[3]].y - P[f[0]].y)) * 0.24;
      if (r < 1) return;
      ctx.fillStyle = '#9aa0a8';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ---------- barrier ---------- */

  /**
   * Road barrier: two legs and a striped board. m = { x, z, w, h, len, color, stripe }.
   */
  function drawBarrier(ctx, o, m) {
    const hw = m.w / 2, hl = m.len / 2, h = m.h;
    shadow(ctx, o, m.x, m.z, m.w * 0.9, m.len * 0.6);
    const place = makePlacer(o, m.x, 0, m.z, 0, 0);
    const leg = faces('#6b7280');
    for (const sx of [-1, 1]) {
      const x0 = sx * hw * 0.8 - m.w * 0.05;
      box(ctx, o, place, { x0: x0, x1: x0 + m.w * 0.1, y0: 0, y1: h * 0.45, z0: -hl * 0.2, z1: hl * 0.2 }, leg);
    }
    const board = { x0: -hw, x1: hw, y0: h * 0.42, y1: h, z0: -hl * 0.35, z1: hl * 0.35 };
    box(ctx, o, place, board, faces(m.color), { outline: true });
    /* Diagonal-style stripes as blocks across the back face. */
    const n = 4, sw = m.w / (n * 2);
    for (let i = 0; i < n; i++) {
      const x0 = -hw + sw * (i * 2 + 0.5);
      quadZ(ctx, o, place, x0, x0 + sw, h * 0.47, h * 0.95, board.z0 - 0.003, m.stripe);
    }
    /* Warning lamp on top. */
    const lamp = projW(o, place(hw * 0.75, h * 1.04, 0));
    if (lamp) {
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, Math.max(1.5, lamp.k * m.w * 0.05), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  window.CAR_RUN_ASSETS.model = { drawCar: drawCar, drawBarrier: drawBarrier, box: box, faces: faces, shade: shade };
})();
