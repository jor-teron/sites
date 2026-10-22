// Neon Fist 3D — shared body frame + procedural SDF skin engine (used by male, female, attire, hair).
// Bodies are lists of primitives (ellipsoids + round cones) blended with per-primitive smooth-min,
// sampled on a grid and meshed with surface nets: one continuous skin, no ball joints or ledges.
import * as THREE from 'three';

export const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o });
export const lerpV = (a, b, t) => a.clone().lerp(b, t);

// build shape factors: w = overall width, sh = shoulder/chest, limb = limb girth, mus = muscle definition, fat
export const BUILD = {
  lean:     { w: 0.92, sh: 0.95, limb: 0.86, mus: 0.25, fat: 0, depth: 0.93 },
  average:  { w: 1.0,  sh: 1.0,  limb: 1.0,  mus: 0.45, fat: 0, depth: 1.0 },
  muscular: { w: 1.05, sh: 1.16, limb: 1.22, mus: 1,    fat: 0, depth: 1.08 },
  fat:      { w: 1.17, sh: 1.06, limb: 1.3,  mus: 0.1,  fat: 1, depth: 1.3 },
};
export const HEAD_Y = 1.68, NECK_CUT = 1.53;

// Joint layout for a gender + build (metres, before height scaling). Relaxed contrapposto for both.
export function frame(gender, build) {
  const b = BUILD[build], fem = gender === 'female', L = b.limb * (fem ? 0.9 : 1);
  const shW = (fem ? 0.158 : 0.188) * b.sh * b.w, hipW = (fem ? 0.092 : 0.082) * b.w;
  const J = { fem, b, L, shW, hipW, shY: 1.43, waistY: fem ? 1.06 : 1.03, arms: [], legs: [] };
  for (const sd of [-1, 1]) {
    const sh = V(sd * shW, 1.425, -0.012);
    const el = V(sd * (shW + 0.035 + 0.035 * b.fat + 0.012 * b.mus), 1.135, -0.045);
    const wr = V(sd * (shW + 0.05 + 0.05 * b.fat + 0.015 * b.mus), 0.885, 0.0);
    J.arms.push({ sd, sh, el, wr });
    const hp = V(sd * hipW, 0.9, 0), kn = V(sd * (hipW + 0.012 + 0.02 * b.fat), 0.5, 0.012), an = V(sd * (hipW + 0.018 + 0.015 * b.fat), 0.082, -0.01);
    J.legs.push({ sd, hp, kn, an, toe: sd * 0.16 });
  }
  // weight on the right leg (sd=-1): that hip rides up, its shoulder drops, the left knee eases forward
  const [R, Lg] = J.legs, [aR, aL] = J.arms;
  R.hp.y += 0.014; Lg.hp.y -= 0.014; R.an.x -= 0.012;
  Lg.kn.set(Lg.kn.x - 0.018, 0.495, 0.055); Lg.an.set(Lg.an.x - 0.004, 0.092, 0.03); Lg.toe = 0.35;
  aR.sh.y -= 0.01; aR.el.y -= 0.01; aR.wr.y -= 0.008; aL.sh.y += 0.01; aL.el.y += 0.008;
  aL.el.z -= 0.012; aL.wr.z -= 0.025; aR.wr.z += 0.02;
  J.tilt = 0.014;
  return J;
}

// ---- primitives ----
// E: ellipsoid (centre c, radii r[3]); C: round cone a->b with radii ra->rb.
// o: { k: blend radius, tag, op: 'add' | 'sub' | 'tint', tint: [r,g,b] }
export const E = (c, r, o = {}) => ({ t: 'E', c, r, k: 0.02, op: 'add', ...o });
export const Cn = (a, b, ra, rb, o = {}) => ({ t: 'C', a, b, ra, rb, k: 0.02, op: 'add', ...o });

function sdE(p, x, y, z, pad) {
  const rx = p.r[0] + pad, ry = p.r[1] + pad, rz = p.r[2] + pad;
  const qx = x - p.c.x, qy = y - p.c.y, qz = z - p.c.z;
  const ax = qx / rx, ay = qy / ry, az = qz / rz, bx = ax / rx, by = ay / ry, bz = az / rz;
  const k0 = Math.sqrt(ax * ax + ay * ay + az * az), k1 = Math.sqrt(bx * bx + by * by + bz * bz);
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : k0 * (k0 - 1) / k1;
}
function sdC(p, x, y, z, pad) {
  const bx = p.b.x - p.a.x, by = p.b.y - p.a.y, bz = p.b.z - p.a.z;
  const qx = x - p.a.x, qy = y - p.a.y, qz = z - p.a.z;
  const t = Math.max(0, Math.min(1, (qx * bx + qy * by + qz * bz) / (bx * bx + by * by + bz * bz)));
  const ux = qx - bx * t, uy = qy - by * t, uz = qz - bz * t;
  return Math.sqrt(ux * ux + uy * uy + uz * uz) - (p.ra + (p.rb - p.ra) * t) - pad;
}
export const sd = (p, x, y, z, pad = 0) => (p.t === 'E' ? sdE : sdC)(p, x, y, z, pad);
function bounds(p, m) {
  if (p.t === 'E') return [p.c.x - p.r[0] - m, p.c.y - p.r[1] - m, p.c.z - p.r[2] - m, p.c.x + p.r[0] + m, p.c.y + p.r[1] + m, p.c.z + p.r[2] + m];
  const r = Math.max(p.ra, p.rb) + m;
  return [Math.min(p.a.x, p.b.x) - r, Math.min(p.a.y, p.b.y) - r, Math.min(p.a.z, p.b.z) - r, Math.max(p.a.x, p.b.x) + r, Math.max(p.a.y, p.b.y) + r, Math.max(p.a.z, p.b.z) + r];
}
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);

// Signed distance at one point (same blend order as the grid).
export function evalSD(prims, x, y, z, pad = 0, kMul = 1) {
  let d = 1;
  for (const p of prims) {
    if (p.op === 'tint') continue;
    const di = sd(p, x, y, z, pad), k = p.k * kMul;
    d = p.op === 'sub' ? smax(d, -di, k) : smin(d, di, k);
  }
  return d;
}

// Sample prims on a grid over box [x0,y0,z0,x1,y1,z1] and mesh it. clip(x,y,z) <= 0 keeps the point.
export function meshSDF(prims, box, res, { pad = 0, kMul = 1, clip = null, tints = null, colors = false } = {}) {
  const live = prims.filter(p => p.op !== 'tint');
  let [x0, y0, z0, x1, y1, z1] = box;
  const nx = Math.ceil((x1 - x0) / res) + 1, ny = Math.ceil((y1 - y0) / res) + 1, nz = Math.ceil((z1 - z0) / res) + 1;
  const D = new Float32Array(nx * ny * nz).fill(1), sxy = nx * ny;
  for (const p of live) {
    const k = p.k * kMul, [bx0, by0, bz0, bx1, by1, bz1] = bounds(p, pad + k + 2 * res);
    const i0 = Math.max(0, Math.floor((bx0 - x0) / res)), i1 = Math.min(nx - 1, Math.ceil((bx1 - x0) / res));
    const j0 = Math.max(0, Math.floor((by0 - y0) / res)), j1 = Math.min(ny - 1, Math.ceil((by1 - y0) / res));
    const q0 = Math.max(0, Math.floor((bz0 - z0) / res)), q1 = Math.min(nz - 1, Math.ceil((bz1 - z0) / res));
    const f = p.t === 'E' ? sdE : sdC, sub = p.op === 'sub';
    for (let q = q0; q <= q1; q++) { const z = z0 + q * res;
      for (let j = j0; j <= j1; j++) { const y = y0 + j * res, row = q * sxy + j * nx;
        for (let i = i0; i <= i1; i++) {
          const di = f(p, x0 + i * res, y, z, pad), o = row + i, a = D[o];
          if (sub) { const h = Math.max(k + di + a, 0); if (h > 0) { const hh = Math.max(k - Math.abs(a + di), 0) / k; D[o] = Math.max(a, -di) + hh * hh * k * 0.25; } }
          else if (di < a + k) { const hh = Math.max(k - Math.abs(a - di), 0) / k; D[o] = Math.min(a, di) - hh * hh * k * 0.25; }
        }
      }
    }
  }
  if (clip) for (let q = 0; q < nz; q++) for (let j = 0; j < ny; j++) for (let i = 0, row = q * sxy + j * nx; i < nx; i++) {
    if (D[row + i] > 0.02) continue;
    const c = clip(x0 + i * res, y0 + j * res, z0 + q * res); if (c > D[row + i]) D[row + i] = c;
  }
  // close the grid border so every surface is watertight
  for (let q = 0; q < nz; q++) for (let j = 0; j < ny; j++) { const edge = !j || !q || j === ny - 1 || q === nz - 1;
    for (let i = 0; i < nx; i += edge ? 1 : nx - 1) { const o = q * sxy + j * nx + i; if (D[o] < 1e-4) D[o] = 1e-4; } }
  return surfaceNets(D, nx, ny, nz, x0, y0, z0, res, tints, { colors: colors });
}

function surfaceNets(D, nx, ny, nz, x0, y0, z0, res, tints, opts = {}) {
  const sxy = nx * ny, cid = new Int32Array(nx * ny * nz).fill(-1), pos = [], idx = [];
  const C8 = [[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]];
  const EDGES = [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
  const v = new Float32Array(8), skip = res * 2.5;
  for (let q = 0; q < nz - 1; q++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const d0 = D[q * sxy + j * nx + i]; if (d0 > skip || d0 < -skip) continue;
    let neg = 0;
    for (let c = 0; c < 8; c++) { v[c] = D[(q + C8[c][2]) * sxy + (j + C8[c][1]) * nx + i + C8[c][0]]; if (v[c] < 0) neg++; }
    if (!neg || neg === 8) continue;
    let px = 0, py = 0, pz = 0, n = 0;
    for (const [a, b] of EDGES) {
      if ((v[a] < 0) === (v[b] < 0)) continue;
      const t = v[a] / (v[a] - v[b]);
      px += C8[a][0] + (C8[b][0] - C8[a][0]) * t; py += C8[a][1] + (C8[b][1] - C8[a][1]) * t; pz += C8[a][2] + (C8[b][2] - C8[a][2]) * t; n++;
    }
    cid[q * sxy + j * nx + i] = pos.length / 3;
    pos.push(x0 + (i + px / n) * res, y0 + (j + py / n) * res, z0 + (q + pz / n) * res);
  }
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; flip ? idx.push(a, c, b, a, d, c) : idx.push(a, b, c, a, c, d); };
  const C = (i, j, q) => cid[q * sxy + j * nx + i];
  for (let q = 1; q < nz - 1; q++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const o = q * sxy + j * nx + i, in0 = D[o] < 0;
    if (in0 !== (D[o + 1] < 0)) quad(C(i, j - 1, q - 1), C(i, j, q - 1), C(i, j, q), C(i, j - 1, q), !in0);
    if (in0 !== (D[o + nx] < 0)) quad(C(i - 1, j, q - 1), C(i - 1, j, q), C(i, j, q), C(i, j, q - 1), !in0);
    if (in0 !== (D[o + sxy] < 0)) quad(C(i - 1, j - 1, q), C(i, j - 1, q), C(i, j, q), C(i - 1, j, q), !in0);
  }
  // one Laplacian pass to iron out grid stepping
  const P = new Float32Array(pos), acc = new Float32Array(P.length), cnt = new Uint16Array(P.length / 3);
  for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = idx[t + e], b = idx[t + (e + 1) % 3];
    for (let c = 0; c < 3; c++) { acc[a * 3 + c] += P[b * 3 + c]; acc[b * 3 + c] += P[a * 3 + c]; } cnt[a]++; cnt[b]++; }
  for (let i = 0; i < cnt.length; i++) if (cnt[i]) for (let c = 0; c < 3; c++) P[i * 3 + c] = P[i * 3 + c] * 0.5 + acc[i * 3 + c] / cnt[i] * 0.5;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setIndex(P.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  if (tints || opts.colors) {
    const col = new Float32Array(P.length).fill(1);
    for (const tp of tints || []) for (let i = 0; i < col.length / 3; i++) {
      const d = sd(tp, P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); if (d > tp.k) continue;
      const w = d < 0 ? 1 : 1 - d / tp.k;
      for (let c = 0; c < 3; c++) col[i * 3 + c] *= 1 - w + w * tp.tint[c];
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function primBox(prims, pad = 0, m = 0.02) {
  const b = [9, 9, 9, -9, -9, -9];
  for (const p of prims) { if (p.op !== 'add') continue; const q = bounds(p, pad + m); for (let i = 0; i < 3; i++) { b[i] = Math.min(b[i], q[i]); b[i + 3] = Math.max(b[i + 3], q[i + 3]); } }
  return b;
}
export const shadow = m => { m.castShadow = true; m.receiveShadow = true; return m; };

// Shared limbs/hands/feet/neck prims. Returns prims tagged by region.
export function limbPrims(J, o = {}) {
  const { b, L } = J, out = [], m = b.mus, f = b.fat, fem = J.fem;
  for (const { sd: s, sh, el, wr } of J.arms) {
    const ua0 = 0.047 * L, ua1 = 0.036 * L, fa0 = 0.037 * L, fa1 = 0.025 * L;
    out.push(E(V(sh.x - s * 0.004, sh.y - 0.01, sh.z), [0.05 * L * (fem ? 0.9 : 1) + 0.01 * m, 0.052 * L, 0.052 * L], { k: 0.04, tag: 'delt' }));
    out.push(Cn(sh.clone().add(V(0, -0.03, 0)), el, ua0, ua1, { k: 0.03, tag: 'ua' }));
    out.push(Cn(lerpV(sh, el, 0.3).add(V(0, 0, 0.012)), lerpV(sh, el, 0.75).add(V(0, 0, 0.01)), 0.03 * L * (0.7 + 0.5 * m), 0.026 * L, { k: 0.03, tag: 'ua' })); // biceps
    out.push(Cn(lerpV(sh, el, 0.25).add(V(0, 0, -0.012)), lerpV(sh, el, 0.85).add(V(0, 0, -0.012)), 0.03 * L * (0.7 + 0.4 * m), 0.024 * L, { k: 0.03, tag: 'ua' })); // triceps
    out.push(Cn(el, wr, fa0, fa1, { k: 0.025, tag: 'fa' }));
    out.push(Cn(lerpV(el, wr, 0.08).add(V(s * 0.006, 0, 0.006)), lerpV(el, wr, 0.55), 0.03 * L * (0.75 + 0.35 * m), 0.024 * L, { k: 0.03, tag: 'fa' }));
    out.push(...handPrims(J, s, el, wr));
  }
  for (const { sd: s, hp, kn, an, toe } of J.legs) {
    const th0 = (fem ? 0.08 : 0.078) * L, th1 = 0.05 * L, ca1 = 0.03 * L;
    out.push(Cn(hp.clone().add(V(s * 0.012, 0.03, 0)), kn, th0, th1, { k: 0.05, tag: 'th' }));
    out.push(Cn(lerpV(hp, kn, 0.3).add(V(0, 0, 0.02)), lerpV(hp, kn, 0.85).add(V(-s * 0.004, 0, 0.022)), 0.055 * L * (0.75 + 0.35 * m), 0.04 * L, { k: 0.04, tag: 'th' })); // quads
    out.push(E(kn.clone().add(V(0, 0.005, 0.034)), [0.026 * L, 0.03, 0.016], { k: 0.025, tag: 'knee' }));
    out.push(Cn(kn, an, 0.047 * L, ca1, { k: 0.03, tag: 'ca' }));
    out.push(Cn(lerpV(kn, an, 0.12).add(V(0, 0, -0.022)), lerpV(kn, an, 0.6).add(V(0, 0, -0.012)), 0.045 * L * (0.8 + 0.3 * m), 0.026 * L, { k: 0.035, tag: 'ca' })); // calf
    out.push(...footPrims(J, s, an, toe));
  }
  return out;
}
function handPrims(J, s, el, wr) {
  const k = J.fem ? 0.92 : 1, dir = wr.clone().sub(el).normalize(), out = [];
  const palmC = wr.clone().addScaledVector(dir, 0.045 * k);
  out.push(Cn(wr.clone().addScaledVector(dir, -0.01), palmC, 0.026 * k, 0.022 * k, { k: 0.012, tag: 'hand' }));
  out.push(E(palmC.clone().add(V(0, 0, 0.002)), [0.016 * k, 0.04 * k, 0.044 * k], { k: 0.012, tag: 'hand' }));
  // four fingers hang down with a soft curl, slightly fanned; thumb points forward
  for (let f = 0; f < 4; f++) {
    const zz = (0.027 - f * 0.018) * k, len = [0.075, 0.085, 0.08, 0.064][f] * k, r = [0.0085, 0.009, 0.0085, 0.0075][f] * k;
    const b0 = palmC.clone().add(V(0, -0.035 * k, zz));
    const b1 = b0.clone().add(V(s * 0.004, -len * 0.55, zz * 0.18 + 0.006));
    const b2 = b1.clone().add(V(s * 0.002, -len * 0.42, zz * 0.12 + 0.016));
    out.push(Cn(b0, b1, r, r * 0.92, { k: 0.004, tag: 'hand' }), Cn(b1, b2, r * 0.92, r * 0.78, { k: 0.004, tag: 'hand' }));
  }
  const t0 = wr.clone().addScaledVector(dir, 0.02 * k).add(V(-s * 0.012, 0, 0.022 * k)), t1 = t0.clone().add(V(-s * 0.012, -0.032 * k, 0.026 * k)), t2 = t1.clone().add(V(-s * 0.004, -0.028 * k, 0.012 * k));
  out.push(Cn(t0, t1, 0.013 * k, 0.0105 * k, { k: 0.01, tag: 'hand' }), Cn(t1, t2, 0.0105 * k, 0.0085 * k, { k: 0.005, tag: 'hand' }));
  return out;
}
function footPrims(J, s, an, toe) {
  const k = J.fem ? 0.9 : 1, out = [], fwd = V(Math.sin(toe), 0, Math.cos(toe));
  const base = V(an.x, 0, an.z), at = (f, y, x = 0) => base.clone().addScaledVector(fwd, f).add(V(x, y, 0));
  out.push(Cn(an, at(0.0, 0.05), 0.034 * k, 0.034 * k, { k: 0.02, tag: 'foot' }));
  out.push(E(at(-0.025 * k, 0.035), [0.03 * k, 0.034, 0.034 * k], { k: 0.02, tag: 'foot' })); // heel
  out.push(Cn(at(-0.01, 0.04), at(0.12 * k, 0.026, -s * 0.004), 0.035 * k, 0.028 * k, { k: 0.02, tag: 'foot' }));
  out.push(Cn(at(0.03, 0.05, -s * 0.012), at(0.12 * k, 0.03, -s * 0.014), 0.03 * k, 0.024 * k, { k: 0.02, tag: 'foot' })); // instep/arch side
  for (let t = 0; t < 5; t++) { // toes: short soft capsules, big toe inside
    const x = (-s * 0.026 + s * t * 0.0125) * k, len = [0.04, 0.034, 0.03, 0.026, 0.022][t] * k, r = [0.012, 0.0085, 0.008, 0.0075, 0.007][t] * k;
    const p0 = at(0.125 * k - t * 0.006, 0.02, x), p1 = p0.clone().addScaledVector(fwd, len).add(V(0, -0.006, 0));
    out.push(Cn(p0, p1, r, r * 0.9, { k: 0.006, tag: 'foot' }));
  }
  return out;
}

// Head: cranium, jaw, cheekbones, nose, lips, brow ridge, ears, eye sockets + lids. o tunes gender.
export function headPrims(o) {
  const y = HEAD_Y, out = [], A = (...a) => out.push(...a);
  A(E(V(0, y + 0.01, -0.01), [o.cw, o.ch, o.cd], { k: 0.02, tag: 'head' }));
  A(E(V(0, y - 0.04, 0.012), [o.cw * 0.74, 0.065, o.cd * 0.8], { k: 0.03, tag: 'face' })); // midface mass
  for (const s of [-1, 1]) {
    A(Cn(V(s * o.cw * 0.84, y - 0.03, -0.022), V(s * o.jw * 0.45, y - 0.1, 0.058), 0.019 * o.jt, 0.014 * o.jt, { k: 0.03, tag: 'face' })); // jaw line
    A(E(V(s * 0.045, y - 0.022, 0.058), [0.024, 0.016, 0.022], { k: 0.02, tag: 'face' })); // cheekbone
    A(E(V(s * 0.036, y + 0.026, 0.074), [0.026, 0.011, 0.016 * o.brow], { k: 0.015, tag: 'face' })); // brow ridge
    A(E(V(s * o.cw * 1.0, y - 0.01, -0.012), [0.009, 0.029, 0.018], { k: 0.008, tag: 'ear' })); // ear
    A(E(V(s * 0.012, y - 0.052, 0.088), [0.008, 0.006, 0.007], { k: 0.008, tag: 'face' })); // nostril wing
  }
  A(E(V(0, y - 0.105, 0.064), [0.022 * o.chin, 0.02, 0.018], { k: 0.025, tag: 'face' })); // chin
  A(Cn(V(0, y + 0.012, 0.083), V(0, y - 0.042, 0.1 * o.nose), 0.0075, 0.011 * o.nose, { k: 0.014, tag: 'face' })); // nose bridge->tip
  A(E(V(0, y - 0.072, 0.083), [0.022 * o.lip, 0.0075 * o.lip, 0.01], { k: 0.01, tag: 'face' })); // upper lip
  A(E(V(0, y - 0.085, 0.08), [0.019 * o.lip, 0.0085 * o.lip, 0.01], { k: 0.01, tag: 'face' })); // lower lip
  A(E(V(0, y - 0.0785, 0.091), [0.02 * o.lip, 0.0012, 0.008], { k: 0.003, tag: 'face', op: 'sub' })); // mouth line
  for (const s of [-1, 1]) {
    A(E(V(s * 0.034, y + 0.004, 0.083), [0.019, 0.0145, 0.016], { k: 0.008, tag: 'face', op: 'sub' })); // eye socket
    A(E(V(s * 0.034, y + 0.0145, 0.07), [0.0165, 0.0055, 0.0115], { k: 0.003, tag: 'lid' })); // upper lid
    A(E(V(s * 0.034, y - 0.0085, 0.068), [0.015, 0.0035, 0.0105], { k: 0.003, tag: 'lid' })); // lower lid
  }
  // colour tints (not geometry): lips, cheeks, ears
  A(E(V(0, y - 0.079, 0.083), [0.021 * o.lip, 0.012 * o.lip, 0.012], { op: 'tint', k: 0.004, tint: o.lipTint }));
  for (const s of [-1, 1]) A(E(V(s * 0.05, y - 0.035, 0.06), [0.02, 0.02, 0.02], { op: 'tint', k: 0.02, tint: [1, 0.94, 0.92] }));
  return out;
}
export const EYE = { x: 0.034, y: HEAD_Y + 0.004, z: 0.0655, r: 0.0125 };

// Build the skin meshes from prims: torso pass + fine head pass + fine hand passes, cut on hidden seams.
export function skinGeometries(prims, J) {
  const tints = prims.filter(p => p.op === 'tint'), shape = prims.filter(p => p.op !== 'tint');
  const wristCut = J.arms.map(({ el, wr }) => ({ c: wr.clone(), d: wr.clone().sub(el).normalize() }));
  const handSide = (x, y, z) => { let s = -1; for (const w of wristCut) { const dx = x - w.c.x, dy = y - w.c.y, dz = z - w.c.z, t = dx * w.d.x + dy * w.d.y + dz * w.d.z;
    if (t > -0.05 && Math.hypot(dx - w.d.x * t, dy - w.d.y * t, dz - w.d.z * t) < 0.07) s = Math.max(s, t); } return s; };
  const all = shape;
  const bb = primBox(shape.filter(p => p.tag !== 'hand')), headPs = all.filter(p => ['head', 'face', 'ear', 'lid', 'neck', 'trap'].includes(p.tag));
  const out = {};
  out.body = meshSDF(all.filter(p => p.tag !== 'hand' && p.tag !== 'ear' && p.tag !== 'lid'), [bb[0], Math.max(0, bb[1]), bb[2], bb[3], NECK_CUT + 0.012, bb[5]], 0.0058,
    { clip: (x, y, z) => Math.max(y - NECK_CUT, -y, handSide(x, y, z)), tints });
  const hb = primBox(headPs.filter(p => p.tag !== 'trap'));
  out.head = meshSDF(headPs, [hb[0], NECK_CUT - 0.012, hb[2], hb[3], hb[4], hb[5]], 0.0026, { clip: (x, y) => NECK_CUT - y, tints });
  const handPs = all.filter(p => p.tag === 'hand' || p.tag === 'fa');
  out.hands = J.arms.map(({ wr }) => {
    const ps = handPs.filter(p => (p.c || p.b).distanceTo(wr) < 0.2);
    const b = primBox(ps.filter(p => p.tag === 'hand'));
    return meshSDF(ps, [b[0] - 0.01, b[1], b[2] - 0.01, b[3] + 0.01, wr.y + 0.06, b[5] + 0.01], 0.0028, { clip: (x, y, z) => -handSide(x, y, z), colors: true });
  });
  // seam vertices take their normal from the unclipped field, so the cuts at the neck and wrists don't shade
  const seam = (x, y, z) => Math.min(Math.abs(y - NECK_CUT), Math.abs(handSide(x, y, z)) + (handSide(x, y, z) === -1 ? 9 : 0)) < 0.012;
  for (const g of [out.body, out.head, ...out.hands]) seamNormals(g, shape, seam);
  return out;
}

// Find the skin surface along +z at (x, y) (used to seat brows, pockets, zips on the body).
export function surfaceZ(prims, x, y, pad = 0, z = 0.25) {
  const ps = prims.filter(p => p.op !== 'tint');
  for (let i = 0; i < 40; i++) { const d = evalSD(ps, x, y, z, pad); if (d < 0.0005) break; z -= Math.max(0.0008, d * 0.8); }
  return z;
}

// Eyes (white, iris, pupil, glossy highlight) and brows tracing the brow ridge.
let EYE_TEX = null;
function eyeTexture() {
  if (EYE_TEX) return EYE_TEX;
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#f2ece6'; x.fillRect(0, 0, 256, 128);
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 24); g.addColorStop(0, '#3a2412'); g.addColorStop(0.55, '#6b4a2a'); g.addColorStop(0.9, '#2f6a6a'); g.addColorStop(1, '#141414');
  x.fillStyle = g; x.beginPath(); x.arc(64, 64, 23, 0, 7); x.fill();
  x.fillStyle = '#050505'; x.beginPath(); x.arc(64, 64, 9, 0, 7); x.fill();
  EYE_TEX = new THREE.CanvasTexture(c); EYE_TEX.colorSpace = THREE.SRGBColorSpace; EYE_TEX.userData.keep = true;
  return EYE_TEX;
}
export function faceDetails(prims, browColor) {
  const g = new THREE.Group(), headPs = prims.filter(p => ['head', 'face', 'lid'].includes(p.tag));
  const eyeM = new THREE.MeshPhysicalMaterial({ map: eyeTexture(), roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.02 });
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(EYE.r, 24, 16), eyeM);
    e.position.set(s * EYE.x, EYE.y, EYE.z); e.rotation.y = -s * 0.12; g.add(e);
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6, x = s * (0.015 + t * 0.04), y = HEAD_Y + 0.021 + Math.sin(Math.min(1, t * 1.25) * Math.PI) * 0.006 - t * 0.004;
      pts.push(V(x, y, surfaceZ(headPs, x, y) + 0.0012));
    }
    const brow = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.0028, 6), new THREE.MeshStandardMaterial({ color: browColor, roughness: 0.9 }));
    brow.scale.set(1, 1, 1); g.add(brow);
  }
  return g;
}

function seamNormals(g, prims, test) {
  const P = g.attributes.position.array, N = g.attributes.normal.array, e = 0.0015;
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i], y = P[i + 1], z = P[i + 2];
    if (!test(x, y, z)) continue;
    const ps = prims.filter(p => Math.hypot(x - (p.c || p.a).x, y - (p.c || p.a).y, z - (p.c || p.a).z) < 0.35);
    const n = V(evalSD(ps, x + e, y, z) - evalSD(ps, x - e, y, z), evalSD(ps, x, y + e, z) - evalSD(ps, x, y - e, z), evalSD(ps, x, y, z + e) - evalSD(ps, x, y, z - e)).normalize();
    N[i] = n.x; N[i + 1] = n.y; N[i + 2] = n.z;
  }
  g.attributes.normal.needsUpdate = true;
}
