// Generator for body.glb (female island character). No dependencies: node build_body.mjs
// Body = one SDF (smooth-union of round cones/ellipsoids) meshed with surface nets -> one sealed surface.
// Ponytail = separate tapered tube on 3 bones. Textures 512x512 painted in code. Clips: idle, walk, run.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "body.glb");
const H = Number(process.env.CELL || 0.027);

// ---------- math ----------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const mix = (a, b, t) => a + (b - a) * t;
function smin(a, b, k) { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return mix(b, a, h) - k * h * (1 - h); }
function roundCone(p, a, b, r1, r2) { // tapered capsule
  const ba = sub(b, a), pa = sub(p, a); const t = clamp(dot(pa, ba) / dot(ba, ba), 0, 1);
  const q = [pa[0] - ba[0] * t, pa[1] - ba[1] * t, pa[2] - ba[2] * t];
  return len(q) - mix(r1, r2, t);
}
function ellipsoid(p, c, r) {
  const q = [(p[0] - c[0]) / r[0], (p[1] - c[1]) / r[1], (p[2] - c[2]) / r[2]];
  const k0 = len(q), k1 = Math.hypot(q[0] / r[0], q[1] / r[1], q[2] / r[2]);
  return k0 < 1e-6 ? -Math.min(...r) : k0 * (k0 - 1) / k1;
}

// ---------- skeleton (bind pose: standing, facing +Z, feet at y=0, L = +X) ----------
const J = {
  hips: [0, 0.93, 0], spine: [0, 1.02, 0], chest: [0, 1.18, 0], neck: [0, 1.42, 0], head: [0, 1.50, 0],
  pony1: [0, 1.665, -0.105], pony2: [0, 1.56, -0.165], pony3: [0, 1.44, -0.165], ponyEnd: [0, 1.31, -0.14],
};
for (const [s, x] of [["L", 1], ["R", -1]]) {
  Object.assign(J, {
    ["shoulder" + s]: [0.04 * x, 1.385, -0.005], ["upperArm" + s]: [0.165 * x, 1.385, -0.01],
    ["forearm" + s]: [0.245 * x, 1.125, -0.03], ["hand" + s]: [0.30 * x, 0.885, 0.0], ["handEnd" + s]: [0.325 * x, 0.735, 0.015],
    ["thigh" + s]: [0.09 * x, 0.88, 0], ["shin" + s]: [0.092 * x, 0.475, 0.005], ["foot" + s]: [0.095 * x, 0.075, -0.01],
    ["heel" + s]: [0.095 * x, 0.035, -0.04], ["toe" + s]: [0.105 * x, 0.024, 0.135],
  });
}
const BONES = [ // name, parent
  ["hips", null], ["spine", "hips"], ["chest", "spine"], ["neck", "chest"], ["head", "neck"],
  ["pony1", "head"], ["pony2", "pony1"], ["pony3", "pony2"],
  ...["L", "R"].flatMap((s) => [["shoulder" + s, "chest"], ["upperArm" + s, "shoulder" + s], ["forearm" + s, "upperArm" + s], ["hand" + s, "forearm" + s],
    ["thigh" + s, "hips"], ["shin" + s, "thigh" + s], ["foot" + s, "shin" + s]]),
];
const BI = Object.fromEntries(BONES.map((b, i) => [b[0], i]));
// segments used for skin weights
const SEG = { hips: [[-0.11, 0.93, 0], [0.11, 0.93, 0]], spine: [[0, 1.0, 0], [0, 1.12, 0]], chest: [[0, 1.18, 0], [0, 1.34, 0]],
  neck: [J.neck, [0, 1.49, 0]], head: [[0, 1.55, 0], [0, 1.66, 0]] };
for (const s of ["L", "R"]) Object.assign(SEG, {
  ["shoulder" + s]: [[J["shoulder" + s][0] * 1.4, 1.385, 0], J["upperArm" + s]], ["upperArm" + s]: [J["upperArm" + s], J["forearm" + s]],
  ["forearm" + s]: [J["forearm" + s], J["hand" + s]], ["hand" + s]: [J["hand" + s], J["handEnd" + s]],
  ["thigh" + s]: [[J["thigh" + s][0], 0.83, 0], J["shin" + s]], ["shin" + s]: [J["shin" + s], J["foot" + s]], ["foot" + s]: [J["heel" + s], J["toe" + s]],
});

// ---------- body SDF ----------
function sdf(p) {
  let d = ellipsoid(p, [0, 1.585, 0.005], [0.074, 0.105, 0.09]);               // skull/face
  d = smin(d, ellipsoid(p, [0, 1.528, 0.03], [0.05, 0.05, 0.055]), 0.03);       // jaw/chin
  d = smin(d, ellipsoid(p, [0, 1.585, 0.09], [0.011, 0.022, 0.014]), 0.012);   // nose
  d = Math.min(d, ellipsoid(p, [0, 1.612, -0.012], [0.081, 0.104, 0.097]));     // hair cap
  d = smin(d, roundCone(p, [0, 1.40, -0.005], [0, 1.53, 0.0], 0.046, 0.043), 0.025); // neck
  let t = ellipsoid(p, [0, 1.26, -0.005], [0.135, 0.15, 0.085]);               // ribcage
  t = smin(t, roundCone(p, [-0.12, 1.37, -0.01], [0.12, 1.37, -0.01], 0.05, 0.05), 0.06); // shoulders line
  t = smin(t, ellipsoid(p, [0, 1.08, -0.0], [0.105, 0.11, 0.072]), 0.06);      // waist
  t = smin(t, ellipsoid(p, [0, 0.92, -0.01], [0.15, 0.1, 0.095]), 0.07);       // pelvis
  for (const x of [-1, 1]) t = smin(t, ellipsoid(p, [0.052 * x, 1.235, 0.062], [0.05, 0.045, 0.04]), 0.03); // modest bust (under top)
  d = smin(d, t, 0.03);
  // skirt: short tight elliptical skirt
  const sy = clamp((0.98 - p[1]) / 0.25, 0, 1), rx = mix(0.155, 0.178, sy), rz = mix(0.1, 0.125, sy);
  const er = Math.hypot(p[0] / rx, (p[2] + 0.008) / rz);
  const skirt = Math.max((er - 1) * Math.min(rx, rz), Math.max(p[1] - 1.0, 0.73 - p[1]));
  d = smin(d, skirt, 0.012);
  for (const s of ["L", "R"]) {
    d = smin(d, roundCone(p, J["upperArm" + s], J["forearm" + s], 0.041, 0.033), 0.03);
    d = smin(d, roundCone(p, J["forearm" + s], J["hand" + s], 0.032, 0.023), 0.012);
    d = smin(d, roundCone(p, J["hand" + s], J["handEnd" + s], 0.024, 0.017), 0.015);
    d = smin(d, roundCone(p, J["thigh" + s], J["shin" + s], 0.078, 0.048), 0.04);
    const kx = J["shin" + s];
    d = smin(d, roundCone(p, kx, J["foot" + s], 0.046, 0.028), 0.04);           // shin
    d = smin(d, ellipsoid(p, [kx[0] * 1.03, 0.33, -0.016], [0.046, 0.11, 0.046]), 0.05); // calf
    d = smin(d, roundCone(p, J["heel" + s], J["toe" + s], 0.034, 0.025), 0.03); // foot
  }
  return d;
}
const grad = (p) => { const e = 1e-3, g = [0, 0, 0];
  for (let i = 0; i < 3; i++) { const a = [...p], b = [...p]; a[i] += e; b[i] -= e; g[i] = (sdf(a) - sdf(b)) / (2 * e); }
  const l = len(g) || 1; return g.map((v) => v / l); };

// ---------- surface nets ----------
const B0 = [-0.4, -0.03, -0.22], B1 = [0.4, 1.76, 0.24];
const N = B0.map((a, i) => Math.ceil((B1[i] - a) / H) + 1);
const idx = (i, j, k) => (k * N[1] + j) * N[0] + i;
const F = new Float32Array(N[0] * N[1] * N[2]);
for (let k = 0; k < N[2]; k++) for (let j = 0; j < N[1]; j++) for (let i = 0; i < N[0]; i++)
  F[idx(i, j, k)] = sdf([B0[0] + i * H, B0[1] + j * H, B0[2] + k * H]);
const cellV = new Int32Array(F.length).fill(-1), P = [];
const CORN = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
const EDG = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
for (let k = 0; k < N[2] - 1; k++) for (let j = 0; j < N[1] - 1; j++) for (let i = 0; i < N[0] - 1; i++) {
  const v = CORN.map((c) => F[idx(i + c[0], j + c[1], k + c[2])]);
  if (v.every((x) => x < 0) || v.every((x) => x >= 0)) continue;
  const acc = [0, 0, 0]; let n = 0;
  for (const [a, b] of EDG) if ((v[a] < 0) !== (v[b] < 0)) {
    const t = v[a] / (v[a] - v[b]); for (let q = 0; q < 3; q++) acc[q] += CORN[a][q] + (CORN[b][q] - CORN[a][q]) * t; n++;
  }
  let p = [B0[0] + (i + acc[0] / n) * H, B0[1] + (j + acc[1] / n) * H, B0[2] + (k + acc[2] / n) * H];
  for (let it = 0; it < 3; it++) { const d = sdf(p), g = grad(p); p = p.map((x, q) => x - d * g[q]); } // snap to surface
  cellV[idx(i, j, k)] = P.length; P.push(p);
}
const TRI = [];
for (let k = 1; k < N[2] - 1; k++) for (let j = 1; j < N[1] - 1; j++) for (let i = 1; i < N[0] - 1; i++) {
  const f0 = F[idx(i, j, k)];
  for (let ax = 0; ax < 3; ax++) {
    const o = [0, 0, 0]; o[ax] = 1; const f1 = F[idx(i + o[0], j + o[1], k + o[2])];
    if ((f0 < 0) === (f1 < 0)) continue;
    const u = (ax + 1) % 3, w = (ax + 2) % 3, c = [];
    for (const [du, dw] of [[0, 0], [1, 0], [1, 1], [0, 1]]) { const q = [i, j, k]; q[u] -= du; q[w] -= dw; c.push(cellV[idx(...q)]); }
    if (c.some((x) => x < 0)) continue;
    TRI.push([c[0], c[1], c[2]], [c[0], c[2], c[3]]);
  }
}
const NRM = P.map(grad);
for (const t of TRI) { // orient outward
  const [a, b, c] = t.map((i) => P[i]); const e1 = sub(b, a), e2 = sub(c, a);
  const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  if (dot(n, NRM[t[0]]) < 0) [t[1], t[2]] = [t[2], t[1]];
}

// ---------- skin weights ----------
function segDist(p, a, b) { const ba = sub(b, a), t = clamp(dot(sub(p, a), ba) / dot(ba, ba), 0, 1); return len(sub(p, [a[0] + ba[0] * t, a[1] + ba[1] * t, a[2] + ba[2] * t])); }
function weights(p, names) {
  const ws = names.map((n) => [BI[n], 1 / Math.pow(segDist(p, ...SEG[n]) + 0.004, 4)]).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const s = ws.reduce((a, w) => a + w[1], 0); while (ws.length < 4) ws.push([0, 0]);
  return { j: ws.map((w) => w[0]), w: ws.map((w) => w[1] / s) };
}
const bodyBones = Object.keys(SEG);
const W = P.map((p) => {
  let names = bodyBones;
  if (p[1] > 1.47) names = ["head", "neck"];                                   // head is rigid
  else if (Math.abs(p[0]) < 0.16 && p[1] > 0.7 && p[1] < 1.36) names = bodyBones.filter((n) => !/arm|hand/.test(n)); // torso/skirt never follows arms
  return weights(p, names);
});

// ---------- materials per triangle ----------
const HEAD_C = [0, 1.585, 0.005];
function region(c) {
  if (c[1] > 1.505 || (c[1] > 1.47 && c[2] < -0.02)) {
    const face = c[2] > 0.025 && c[1] < 1.648 && c[1] > 1.485 && Math.abs(c[0]) < 0.068;
    if (face) return "face";
    if (c[1] > 1.54 || c[2] < -0.04) return "hair";
    return "skin";
  }
  // torso band uses the cloth map, which paints skin outside the garments -> hems are straight lines in the texture
  if (Math.abs(c[0]) < 0.15 && c[1] > 1.12 && c[1] < 1.36) return "cloth";
  if (c[1] > 0.69 && c[1] < 1.12 && Math.hypot(c[0] / 0.19, c[2] / 0.135) < 1.08) return "cloth";
  return "skin";
}
// UV generators (per triangle, with wrap fix)
function cylUV(p, cx, cz, vy0, vy1) { return [(Math.atan2(p[0] - cx, p[2] - cz) / (2 * Math.PI) + 0.5), (p[1] - vy0) / (vy1 - vy0)]; }
function triUV(r, ps) {
  let uv;
  if (r === "face") uv = ps.map((p) => [0.5 + p[0] / 0.16, (p[1] - 1.48) / 0.18]);
  else if (r === "hair") uv = ps.map((p) => cylUV(p, HEAD_C[0], HEAD_C[2], 1.45, 1.72));
  else if (r === "cloth") uv = ps.map((p) => cylUV(p, 0, -0.005, 0.70, 1.36));
  else uv = ps.map((p) => [p[0] * 1.6 + p[2] * 1.1, p[1] * 1.3]);
  if (r !== "face" && r !== "skin") { const us = uv.map((t) => t[0]); if (Math.max(...us) - Math.min(...us) > 0.5) uv.forEach((t) => { if (t[0] < 0.5) t[0] += 1; }); }
  return uv;
}
const prims = { skin: [], face: [], cloth: [], hair: [] };
for (const t of TRI) {
  const ps = t.map((i) => P[i]); const c = [0, 1, 2].map((q) => (ps[0][q] + ps[1][q] + ps[2][q]) / 3);
  const r = region(c), uv = triUV(r, ps);
  t.forEach((vi, n) => prims[r].push({ p: P[vi], n: NRM[vi], uv: uv[n], j: W[vi].j, w: W[vi].w }));
}

// ---------- ponytail (separate tube, own bones) ----------
const pony = [];
{
  const path = (s) => { // catmull-ish polyline through tie -> tip
    const pts = [J.pony1, [0, 1.625, -0.15], J.pony2, J.pony3, J.ponyEnd];
    const f = s * (pts.length - 1), i = Math.min(Math.floor(f), pts.length - 2), t = f - i;
    return [0, 1, 2].map((q) => mix(pts[i][q], pts[i + 1][q], t));
  };
  const RING = 12, SEGS = 22, rad = (s) => s < 0.08 ? 0.022 : 0.04 * Math.sin(Math.PI * Math.min(1, 0.25 + s * 0.85)) * (1 - 0.75 * s) + 0.004;
  const rings = [];
  for (let a = 0; a <= SEGS; a++) {
    const s = a / SEGS, c = path(s), c2 = path(Math.min(1, s + 0.01)), c1 = path(Math.max(0, s - 0.01));
    let tg = sub(c2, c1); tg = tg.map((v) => v / len(tg));
    const side = [1, 0, 0], nrm = [tg[1] * side[2] - tg[2] * side[1], tg[2] * side[0] - tg[0] * side[2], tg[0] * side[1] - tg[1] * side[0]];
    const ring = [];
    for (let b = 0; b <= RING; b++) {
      const ang = (b / RING) * Math.PI * 2, ca = Math.cos(ang), sa = Math.sin(ang);
      const dir = [side[0] * ca + nrm[0] * sa, side[1] * ca + nrm[1] * sa, side[2] * ca + nrm[2] * sa];
      const r = rad(s) * (1 + 0.12 * Math.sin(ang * 3 + s * 9)), p = c.map((v, q) => v + dir[q] * r * (q === 0 ? 1.1 : 1));
      const segN = ["pony1", "pony2", "pony3"].map((n, i) => [n, segDist(p, [J.pony1, J.pony2, J.pony3][i], [J.pony2, J.pony3, J.ponyEnd][i])]);
      ring.push({ p, n: dir, uv: [b / RING, 1 - s], ...(() => { const ws = segN.map(([n, d]) => [BI[n], 1 / Math.pow(d + 0.01, 4)]); const sm = ws.reduce((a, w) => a + w[1], 0); return { j: [...ws.map((w) => w[0]), 0], w: [...ws.map((w) => w[1] / sm), 0] }; })() });
    }
    rings.push(ring);
  }
  for (let a = 0; a < SEGS; a++) for (let b = 0; b < RING; b++) {
    const v00 = rings[a][b], v01 = rings[a][b + 1], v10 = rings[a + 1][b], v11 = rings[a + 1][b + 1];
    pony.push(v00, v10, v11, v00, v11, v01);
  }
  const tip = { ...rings[SEGS][0], p: path(1) }; for (let b = 0; b < RING; b++) pony.push(rings[SEGS][b], tip, rings[SEGS][b + 1]);
  // orientation check: make sure normals point outward relative to winding
  for (let i = 0; i < pony.length; i += 3) {
    const [a, b, c] = [pony[i].p, pony[i + 1].p, pony[i + 2].p], e1 = sub(b, a), e2 = sub(c, a);
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (dot(n, pony[i].n) < 0) [pony[i + 1], pony[i + 2]] = [pony[i + 2], pony[i + 1]];
  }
}

// ---------- textures (512x512, painted in code) ----------
const S = 512;
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
function noise2(w) { const g = new Float32Array(S * S); for (let i = 0; i < g.length; i++) g[i] = rnd(); // box-blurred noise
  const o = new Float32Array(S * S); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { let s = 0, n = 0;
    for (let dy = -w; dy <= w; dy++) for (let dx = -w; dx <= w; dx++) { s += g[((y + dy + S) % S) * S + ((x + dx + S) % S)]; n++; } o[y * S + x] = s / n; } return o; }
function canvas(fn) { const px = new Uint8Array(S * S * 4); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const c = fn(x / S, 1 - y / S, x, y); const o = (y * S + x) * 4; px[o] = clamp(c[0], 0, 255); px[o + 1] = clamp(c[1], 0, 255); px[o + 2] = clamp(c[2], 0, 255); px[o + 3] = 255; } return px; }
const nA = noise2(2), nB = noise2(6);
const SKIN = [236, 196, 172];
const skinTex = canvas((u, v, x, y) => { const k = 1 + (nA[y * S + x] - 0.5) * 0.06 + (nB[y * S + x] - 0.5) * 0.08; return SKIN.map((c, i) => c * k + (i === 0 ? 4 : 0)); });
const ell = (u, v, cu, cv, ru, rv) => ((u - cu) / ru) ** 2 + ((v - cv) / rv) ** 2;
const faceTex = canvas((u, v, x, y) => {
  // u: 0.5 + x/0.16, v: (y-1.48)/0.18  -> eyes y=1.598 (v .655), brows 1.622 (.79), lips 1.528 (.267)
  let c = SKIN.map((q) => q * (1 + (nA[y * S + x] - 0.5) * 0.05));
  const shade = 1 - 0.18 * Math.max(0, Math.abs(u - 0.5) * 2 - 0.55); c = c.map((q) => q * shade);  // soft side shading
  for (const s of [-1, 1]) {
    const cu = 0.5 + s * 0.205, cv = 0.66;
    const cheek = ell(u, v, 0.5 + s * 0.24, 0.5, 0.09, 0.06); if (cheek < 1) c = [c[0] + 10 * (1 - cheek), c[1] - 2 * (1 - cheek), c[2]];
    const e = ell(u, v, cu, cv, 0.085, 0.032);
    if (e < 1) { c = [245, 243, 240]; const ir = ell(u, v, cu, cv, 0.034, 0.03); if (ir < 1) c = ir < 0.35 ? [20, 14, 12] : [72, 46, 32]; if (ell(u, v, cu - 0.01, cv + 0.01, 0.009, 0.008) < 1) c = [255, 255, 255]; }
    if (e >= 1 && e < 1.5 && v > cv - 0.005) c = [40, 28, 26];                               // upper lash line
    const bv = 0.79 - 0.03 * ((u - (0.5 + s * 0.2)) / 0.1) ** 2; if (Math.abs(v - bv) < 0.012 && Math.abs(u - (0.5 + s * 0.2)) < 0.1) c = [55, 38, 32]; // brows
  }
  const lip = ell(u, v, 0.5, 0.267, 0.085, 0.03); if (lip < 1) c = [200, 120, 118].map((q) => q * (v < 0.267 ? 1 : 0.9));
  if (Math.abs(v - 0.267) < 0.004 && Math.abs(u - 0.5) < 0.08) c = [150, 80, 80];
  const nose = ell(u, v, 0.5, 0.43, 0.04, 0.018); if (nose < 1 && v < 0.43) c = c.map((q) => q * 0.9);
  return c;
});
const BLUE = [38, 72, 178];
const clothTex = canvas((u, v, x, y) => {
  const weave = (x % 3 === 0 ? 0.92 : 1) * (y % 4 === 0 ? 0.95 : 1), rib = 1 + 0.04 * Math.sin(x * 0.9);
  let k = weave * rib * (1 + (nB[y * S + x] - 0.5) * 0.12);
  const yw = 0.70 + v * 0.66;   // world height of this texel
  for (const hem of [1.33, 1.165, 0.995, 0.735]) { const d = Math.abs(yw - hem); if (d < 0.012) k *= 0.78 + d * 10; } // hems
  if (Math.abs(yw - 1.32) < 0.002 || Math.abs(yw - 0.745) < 0.002) k *= 0.7; // stitch lines
  const onTop = yw > 1.165 && yw < 1.33, onSkirt = yw > 0.735 && yw < 0.995;
  if (!onTop && !onSkirt) { // bare skin (midriff, shoulders, upper thighs) with soft shading
    const kk = 1 + (nA[y * S + x] - 0.5) * 0.06 - 0.05 * Math.min(1, Math.min(Math.abs(yw - 1.165), Math.abs(yw - 0.995), Math.abs(yw - 0.735), Math.abs(yw - 1.33)) < 0.02 ? 1 : 0);
    return SKIN.map((c) => c * kk);
  }
  return BLUE.map((c) => c * k);
});
const hairTex = canvas((u, v, x, y) => { const s = 0.75 + 0.5 * nA[(y % 8) * S + x] + 0.35 * Math.sin(x * 0.7 + nB[y * S + x] * 6) * 0.3;
  const hl = Math.exp(-(((v - 0.62) / 0.05) ** 2)) * 0.6; return [18 * s + 30 * hl, 16 * s + 26 * hl, 20 * s + 30 * hl]; });

function png(px) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4); d.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + d.length)), 8 + d.length); return b; };
  const raw = Buffer.alloc(S * (S * 3 + 1)); for (let y = 0; y < S; y++) { raw[y * (S * 3 + 1)] = 0; for (let x = 0; x < S; x++) for (let c = 0; c < 3; c++) raw[y * (S * 3 + 1) + 1 + x * 3 + c] = px[(y * S + x) * 4 + c]; }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(S, 0); ih.writeUInt32BE(S, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ih), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// ---------- animation ----------
function quat(x, y, z) { // euler XYZ -> quaternion
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2), s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  return [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3];
}
function pose(kind, ph) { // ph in [0,1)
  const w = 2 * Math.PI * ph, s = Math.sin(w), c = Math.cos(w), R = {}; let hipY = J.hips[1];
  if (kind === "idle") {
    const b = Math.sin(w); R.chest = [0.02 * b, 0, 0]; R.hips = [0, 0, 0.015 * Math.sin(w)]; R.spine = [0, 0, -0.012 * Math.sin(w)];
    R.head = [0.02 * Math.sin(w * 2) * 0.5, 0.06 * Math.sin(w), 0]; hipY -= 0.004 * (1 - b) * 0.5;
    for (const [sd, x] of [["L", 1], ["R", -1]]) { R["upperArm" + sd] = [0.03 * b, 0, 0]; R["forearm" + sd] = [-0.12, 0, 0]; }
    R.pony1 = [0.05 * Math.sin(w), 0, 0.06 * Math.sin(w + 0.5)]; R.pony2 = [0.06 * Math.sin(w - 0.6), 0, 0.08 * Math.sin(w - 0.2)]; R.pony3 = [0.08 * Math.sin(w - 1.2), 0, 0.1 * Math.sin(w - 0.9)];
  } else {
    const run = kind === "run", A = run ? 0.75 : 0.42;
    for (const [sd, x] of [["L", 1], ["R", -1]]) {
      const ss = s * x, cc = c * x;
      R["thigh" + sd] = [-A * ss - (run ? 0.25 : 0.03), 0, 0];
      R["shin" + sd] = [(run ? 0.35 : 0.08) + (run ? 1.3 : 0.65) * Math.max(0, cc) ** 1.5, 0, 0];
      R["foot" + sd] = [run ? -0.25 * ss : -0.18 * ss, 0, 0];
      R["upperArm" + sd] = [(run ? 0.55 : 0.32) * ss - (run ? 0.1 : 0), 0, run ? -0.12 * x : 0];
      R["forearm" + sd] = [run ? -1.35 : -0.22 - 0.12 * Math.max(0, -ss), 0, 0];
    }
    const s2 = Math.cos(2 * w);
    hipY += run ? -0.05 + 0.03 * s2 : -0.012 + 0.012 * s2;
    R.hips = [0, (run ? 0.12 : 0.09) * s, 0.03 * c]; R.spine = [run ? 0.12 : 0.03, 0, 0]; R.chest = [run ? 0.06 : 0.01, -(run ? 0.22 : 0.14) * s, 0];
    R.head = [run ? -0.15 : -0.03, 0.05 * s, 0];
    const g = run ? 1.8 : 1;
    R.pony1 = [0.1 * g * Math.sin(2 * w - 1), 0, 0.12 * g * Math.sin(w - 0.6)]; R.pony2 = [0.12 * g * Math.sin(2 * w - 1.7), 0, 0.15 * g * Math.sin(w - 1.2)];
    R.pony3 = [0.14 * g * Math.sin(2 * w - 2.4), 0, 0.18 * g * Math.sin(w - 1.8)]; if (run) R.pony1[0] += 0.35;
  }
  return { R, hipY };
}
const CLIPS = [["idle", 3.0], ["walk", 1.1], ["run", 0.7]];
const FR = 30;

// ---------- GLB writer ----------
const bufs = []; let off = 0; const views = [], accs = [];
function addView(buf, target) { const pad = (4 - (off % 4)) % 4; if (pad) { bufs.push(Buffer.alloc(pad)); off += pad; }
  views.push({ buffer: 0, byteOffset: off, byteLength: buf.length, ...(target ? { target } : {}) }); bufs.push(buf); off += buf.length; return views.length - 1; }
function addAcc(arr, type, ctype, target, mm) { const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
  const comp = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[type]; const a = { bufferView: addView(b, target), componentType: ctype, count: arr.length / comp, type };
  if (mm) { const mn = Array(comp).fill(Infinity), mx = Array(comp).fill(-Infinity); for (let i = 0; i < arr.length; i++) { mn[i % comp] = Math.min(mn[i % comp], arr[i]); mx[i % comp] = Math.max(mx[i % comp], arr[i]); } a.min = mn; a.max = mx; }
  accs.push(a); return accs.length - 1; }
function primitive(verts, material) { // dedupe identical verts -> indexed
  const map = new Map(), pos = [], nrm = [], uv = [], jn = [], wt = [], ind = [];
  for (const v of verts) { const key = v.p.join() + "|" + v.uv.map((x) => x.toFixed(5)).join(); let i = map.get(key);
    if (i === undefined) { i = pos.length / 3; map.set(key, i); pos.push(...v.p); nrm.push(...v.n); uv.push(v.uv[0], 1 - v.uv[1]); jn.push(...v.j); wt.push(...v.w); } ind.push(i); }
  return { attributes: { POSITION: addAcc(new Float32Array(pos), "VEC3", 5126, 34962, true), NORMAL: addAcc(new Float32Array(nrm), "VEC3", 5126, 34962),
    TEXCOORD_0: addAcc(new Float32Array(uv), "VEC2", 5126, 34962), JOINTS_0: addAcc(new Uint8Array(jn), "VEC4", 5121, 34962), WEIGHTS_0: addAcc(new Float32Array(wt), "VEC4", 5126, 34962) },
    indices: addAcc(new Uint16Array(ind), "SCALAR", 5123, 34963), material };
}
const matNames = ["skin", "face", "cloth", "hair"], texs = [skinTex, faceTex, clothTex, hairTex];
const images = texs.map((t) => ({ mimeType: "image/png", bufferView: addView(png(t)) }));
const materials = matNames.map((n, i) => ({ name: n, pbrMetallicRoughness: { baseColorTexture: { index: i }, metallicFactor: 0, roughnessFactor: n === "hair" ? 0.55 : n === "cloth" ? 0.85 : 0.7 } }));
const bodyPrims = matNames.map((n, i) => primitive(prims[n], i));
const ponyPrim = primitive(pony, 3);
// nodes: 0 = root "Female", 1 = body mesh, 2 = ponytail mesh, 3.. = bones
const nodes = [{ name: "Female", children: [1, 2, 3] }, { name: "Body", mesh: 0, skin: 0 }, { name: "Ponytail", mesh: 1, skin: 0 }];
BONES.forEach(([n, par]) => { const t = par ? sub(J[n], J[par]) : J[n]; nodes.push({ name: n, translation: t, children: [] }); });
BONES.forEach(([n, par], i) => { if (par) nodes[3 + BI[par]].children.push(3 + i); });
nodes.forEach((n) => { if (n.children && !n.children.length) delete n.children; });
const ibm = new Float32Array(BONES.length * 16); BONES.forEach(([n], i) => { const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -J[n][0], -J[n][1], -J[n][2], 1]; ibm.set(m, i * 16); });
const skin = { joints: BONES.map((_, i) => 3 + i), skeleton: 3, inverseBindMatrices: addAcc(ibm, "MAT4", 5126) };
const animations = CLIPS.map(([name, T]) => {
  const n = Math.round(T * FR), times = new Float32Array(n + 1).map((_, i) => (i / n) * T); const tAcc = addAcc(times, "SCALAR", 5126, undefined, true);
  const samplers = [], channels = [];
  const poses = Array.from({ length: n + 1 }, (_, i) => pose(name, (i % n) / n));
  BONES.forEach(([bn], bi) => { if (!poses.some((p) => p.R[bn])) return;
    const q = new Float32Array((n + 1) * 4); poses.forEach((p, i) => q.set(quat(...(p.R[bn] || [0, 0, 0])), i * 4));
    samplers.push({ input: tAcc, output: addAcc(q, "VEC4", 5126), interpolation: "LINEAR" }); channels.push({ sampler: samplers.length - 1, target: { node: 3 + bi, path: "rotation" } }); });
  const tr = new Float32Array((n + 1) * 3); poses.forEach((p, i) => tr.set([0, p.hipY, 0], i * 3));
  samplers.push({ input: tAcc, output: addAcc(tr, "VEC3", 5126), interpolation: "LINEAR" }); channels.push({ sampler: samplers.length - 1, target: { node: 3, path: "translation" } });
  return { name, samplers, channels };
});
const bin = Buffer.concat(bufs); const binPad = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
const gltf = { asset: { version: "2.0", generator: "island-demo build_body.mjs" }, scene: 0, scenes: [{ name: "Female", nodes: [0] }], nodes,
  meshes: [{ name: "Body", primitives: bodyPrims }, { name: "Ponytail", primitives: [ponyPrim] }], skins: [skin], materials,
  textures: texs.map((_, i) => ({ source: i, sampler: 0 })), samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }], images, animations,
  accessors: accs, bufferViews: views, buffers: [{ byteLength: binPad.length }] };
let js = Buffer.from(JSON.stringify(gltf)); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const hdr = Buffer.alloc(12); hdr.writeUInt32BE(0x676c5446, 0); hdr.writeUInt32LE(0x46546c67, 0); hdr.writeUInt32LE(2, 4); hdr.writeUInt32LE(12 + 8 + js.length + 8 + binPad.length, 8);
const ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; };
writeFileSync(OUT, Buffer.concat([hdr, ch(js.length, 0x4e4f534a), js, ch(binPad.length, 0x004e4942), binPad]));
const tris = TRI.length + pony.length / 3;
console.log(`body tris ${TRI.length}, ponytail tris ${pony.length / 3}, total ${tris}; regions`, Object.fromEntries(matNames.map((n) => [n, prims[n].length / 3])), `size ${(12 + 16 + js.length + binPad.length) / 1024 | 0} KB`);
