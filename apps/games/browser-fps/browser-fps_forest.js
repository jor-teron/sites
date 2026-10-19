/**
 * Browser FPS — Forest map (?map=forest): procedural 1 × 1 km summer forest. Same interface as buildIsland / buildSnow:
 * buildForest(scene, cfg, assets, renderer) -> { R, wadeR, beachIn, start, startYaw, heightAt, terrainHeight, inWater,
 *   onLand, colliders, bushes, randomSpot, clampPos, surfaceAt, update(t, camPos), counts, windTime, wind, isOpen,
 *   setFollow(pos), stats(), river, tracks, bridges }
 *
 * Everything comes from cfg.seed: value-noise hills, a winding rivulet (shallow channel, sandy banks, see-through water,
 * slower walking), 2 dirt tracks with a small wooden bridge where each crosses the stream, clustered pines / broadleaf
 * trees / bushes / rocks (kept off the water and tracks), boundary hills + a post-and-rail fence, fog.
 *
 * Terrain: square chunks (cfg.chunk m) with distance LOD (cfg.lod: finer cells near the camera). Each chunk builds a LOD
 * mesh on demand (cfg.buildPerFrame per frame, nearest first), shows the closest available level meanwhile, hides beyond
 * cfg.viewDist and frees fine levels it no longer needs. Skirts hide cracks between levels. Normals come from the height
 * function, so chunk edges match.
 * Props: instanced per square tile (cfg.propTile m) so whole tiles past the fog are skipped (few draw calls).
 *
 * Hooks for vehicles / other systems:
 *   heightAt(x, z)      walkable height (terrain, or a bridge deck on top of it)
 *   terrainHeight(x, z) bare terrain (no bridge decks)
 *   inWater(x, z)       true in the stream (not on a bridge)
 *   colliders           AABBs [{ min, max, prop }] of trunks, rocks and bridge rails (static)
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;

/** Seeded 2D value noise in [0, 1] and a few-octave fbm. */
function makeNoise(seed) {
  const S = (seed * 2654435761) | 0;
  const hash = (i, j) => { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + S) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  function noise(x, z) {
    const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j;
    const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, z, oct = 4) {
    let s = 0, amp = 0.5, f = 1, n = 0;
    for (let o = 0; o < oct; o++) { s += amp * noise(x * f + o * 17.1, z * f - o * 9.3); n += amp; amp *= 0.5; f *= 2.03; }
    return s / n;
  }
  return { noise, fbm, hash };
}

/** Give every vertex of g the colour c (for merged multi-colour props drawn with one material). */
function paint(g, c) {
  const col = new THREE.Color(c), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
/** Low-poly pine: trunk + 3 cone tiers. Feet at y = 0, ~6.3 m tall at scale 1. */
function pineGeometry() {
  const parts = [paint(new THREE.CylinderGeometry(0.13, 0.22, 2.2, 6).translate(0, 1.1, 0), 0x5b4130)];
  for (let i = 0; i < 3; i++) {
    const r = 1.85 - i * 0.5, h = 2.5 - i * 0.3, y = 1.35 + i * 1.45;
    const c = new THREE.ConeGeometry(r, h, 7, 1).translate(0, y + h / 2, 0);
    paint(c, [0x2c5530, 0x31603a, 0x386a3f][i]); parts.push(c);
  }
  return mergeGeometries(parts);
}
/** Low-poly broadleaf: trunk + 3 lumpy leaf balls. Feet at y = 0, ~5.4 m tall at scale 1. */
function broadleafGeometry() {
  const lump = (g, k) => {   // dent by position so shared corners stay together (no cracks)
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), s = 1 + 0.16 * Math.sin(x * 7.1 + y * 5.3 + z * 9.7 + k); p.setXYZ(i, x * s, y * s * 0.86, z * s); }
    return g;
  };
  const parts = [
    paint(new THREE.CylinderGeometry(0.15, 0.27, 2.8, 6).translate(0, 1.4, 0).toNonIndexed(), 0x6a4a32),
    paint(lump(new THREE.IcosahedronGeometry(1.55, 0), 1).translate(0, 3.9, 0), 0x4f8a3a),
    paint(lump(new THREE.IcosahedronGeometry(1.15, 0), 2).translate(0.85, 3.25, 0.35), 0x5a9642),
    paint(lump(new THREE.IcosahedronGeometry(1.2, 0), 3).translate(-0.75, 3.4, -0.45), 0x467e34),
  ];
  return mergeGeometries(parts);
}

/** Flowing-water ripple texture (tiles; scrolled along the stream in update). */
function waterTexture(rand) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 140; i++) {
    const x = rand() * S, y = rand() * S, w = 10 + rand() * 40;
    g.strokeStyle = `rgba(150,190,200,${(0.25 + rand() * 0.35).toFixed(2)})`; g.lineWidth = 1 + rand() * 2;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y + (rand() - 0.5) * 6, x + w, y); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** Sky-gradient env map so the water reflects a little sky. */
function skyEnv(top, hor) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d'), grd = g.createLinearGradient(0, 0, 0, 64);
  grd.addColorStop(0, '#' + new THREE.Color(top).getHexString()); grd.addColorStop(0.5, '#' + new THREE.Color(hor).getHexString()); grd.addColorStop(1, '#4a5a3a');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 64);
  const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildForest(scene, cfg, assets, renderer) {
  const H = cfg.half, EXT = H + cfg.apron, rand = mulberry32(cfg.seed);
  const N = makeNoise(cfg.seed), Nc = makeNoise(cfg.seed + 101), Nv = makeNoise(cfg.seed + 202);
  const edge = (x, z) => Math.max(Math.abs(x), Math.abs(z));

  // ── Stream: centre line x = rx(z), half width rw(z) ──
  const RV = cfg.river, rp = [rand() * TAU, rand() * TAU, rand() * TAU];
  const k1 = TAU / RV.len1, k2 = TAU / RV.len2;
  const rx = (z) => RV.amp1 * Math.sin(z * k1 + rp[0]) + RV.amp2 * Math.sin(z * k2 + rp[1]) + RV.x;
  const rdx = (z) => RV.amp1 * k1 * Math.cos(z * k1 + rp[0]) + RV.amp2 * k2 * Math.cos(z * k2 + rp[1]);
  const rw = (z) => RV.width + RV.widthVar * Math.sin(z * 0.027 + rp[2]);
  const riverDist = (x, z) => { const s = rdx(z); return Math.abs(x - rx(z)) / Math.sqrt(1 + s * s); };

  // ── Dirt tracks: centre line z = tz(x) (east-west), each crosses the stream once ──
  const tracks = cfg.tracks.map((t) => ({ ...t, ph: rand() * TAU, k: TAU / t.len }));
  const tz = (t, x) => t.z + t.amp * Math.sin(x * t.k + t.ph);
  const tdz = (t, x) => t.amp * t.k * Math.cos(x * t.k + t.ph);
  const trackDist = (t, x, z) => { const s = tdz(t, x); return Math.abs(z - tz(t, x)) / Math.sqrt(1 + s * s); };
  const nearTrack = (x, z, pad = 0) => tracks.some((t) => trackDist(t, x, z) < t.w + pad);

  // ── Height ──
  const HL = cfg.hills, BD = cfg.boundary;
  function terrainHeight(x, z) {
    let h = RV.floor + HL.height * N.fbm(x / HL.scale + 50, z / HL.scale + 50, HL.octaves);
    const d = riverDist(x, z), w = rw(z);
    h = RV.floor + (h - RV.floor) * smooth(w + RV.bank, w + RV.valley, d);          // hills ease down into a valley
    if (d < w) h = RV.edgeY - RV.depth * (1 - (d / w) * (d / w));                    // shallow channel
    else if (d < w + RV.bank) h = RV.edgeY + (RV.floor - RV.edgeY) * smooth(w, w + RV.bank, d);   // sandy bank
    const e = edge(x, z);
    if (e > BD.start) { const u = (e - BD.start) / (EXT - BD.start); h += BD.height * u * u * (1 + 0.25 * Math.sin(x * 0.043 + z * 0.061)); }
    return h;
  }

  // ── Bridges: where each track crosses the stream (aligned with x, so colliders stay axis-aligned) ──
  const bridges = [];
  for (const t of tracks) {
    let x = rx(t.z), z = t.z;
    for (let i = 0; i < 30; i++) { z = tz(t, x); x = rx(z); }
    const s = rdx(z), w = rw(z), half = (w + RV.bank) * Math.sqrt(1 + s * s) + cfg.bridge.overhang;
    const y = Math.max(terrainHeight(x - half, z), terrainHeight(x + half, z), RV.floor) + cfg.bridge.lift;
    bridges.push({ x, z, half, hw: cfg.bridge.width / 2, y });
  }
  const bridgeAt = (x, z) => { for (const b of bridges) if (Math.abs(x - b.x) < b.half && Math.abs(z - b.z) < b.hw) return b; return null; };
  function heightAt(x, z) { const h = terrainHeight(x, z), b = bridgeAt(x, z); return b ? Math.max(h, b.y) : h; }
  const inWater = (x, z) => !bridgeAt(x, z) && terrainHeight(x, z) < RV.waterY - 0.12;
  const onLand = (x, z, m = 0) => edge(x, z) <= cfg.walkLimit - m;

  // ── Clearings (config + one around the start) ──
  const t0 = tracks[0], b0 = bridges[0];
  const sx = b0.x - cfg.startBack, start = [sx, tz(t0, sx)];
  const startYaw = Math.atan2(-1, -tdz(t0, sx));   // face along the track toward the bridge (+x); forward = (-sin yaw, -cos yaw)
  const clearings = [...cfg.clearings.map((c) => ({ x: c[0], z: c[1], r: c[2] })), { x: start[0], z: start[1], r: cfg.startClear }];
  const inClearing = (x, z) => clearings.some((c) => Math.hypot(x - c.x, z - c.z) < c.r);
  const isOpen = (x, z) => nearTrack(x, z, 1) || riverDist(x, z) < rw(z) + RV.bank || inClearing(x, z);

  // ── Terrain colours ──
  const C = cfg.colors, cc = {}; for (const k of Object.keys(C)) cc[k] = new THREE.Color(C[k]);
  const tmpC = new THREE.Color();
  function colourAt(x, z, h, ny, out) {
    const v = Nv.noise(x * 0.09, z * 0.09), grove = Nc.fbm(x / cfg.trees.clusterScale, z / cfg.trees.clusterScale, 3);
    out.copy(cc.grass).lerp(cc.grassDry, Math.max(0, N.noise(x * 0.021 + 7, z * 0.021) - 0.35) * 0.9);
    out.lerp(cc.forestFloor, smooth(cfg.trees.clusterAt - 0.08, cfg.trees.clusterAt + 0.08, grove) * 0.75);
    out.multiplyScalar(0.9 + v * 0.2);
    const d = riverDist(x, z), w = rw(z);
    if (d < w + RV.bank + 1.5) out.lerp(cc.sand, smooth(w + RV.bank + 1.5, w + RV.bank * 0.4, d));
    if (d < w) out.lerp(cc.bed, smooth(w * 0.9, w * 0.3, d));
    for (const t of tracks) { const td = trackDist(t, x, z); if (td < t.w + 0.8) out.lerp(tmpC.copy(cc.dirt).multiplyScalar(0.92 + v * 0.16), smooth(t.w + 0.8, t.w - 0.6, td) * 0.92); }
    if (ny < 0.86 || h > BD.height * 0.35) out.lerp(cc.rock, Math.max(smooth(0.86, 0.7, ny), smooth(BD.height * 0.35, BD.height * 0.8, h)) * 0.7);
    return out;
  }

  // ── Terrain chunks with distance LOD ──
  const CH = cfg.chunk, NC = Math.ceil((2 * EXT) / CH), O = -NC * CH / 2, LOD = cfg.lod;
  const tex = assets.textures && assets.textures.island ? assets.textures.island.make(renderer, {}) : null;
  const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, map: tex ? tex.map : null, side: THREE.DoubleSide });
  const terrain = new THREE.Group(); terrain.name = 'forest-terrain'; scene.add(terrain);
  const chunks = [];
  for (let j = 0; j < NC; j++) for (let i = 0; i < NC; i++) chunks.push({ x0: O + i * CH, z0: O + j * CH, meshes: [], shown: -1 });
  const col = new THREE.Color();
  function buildChunk(ch, lod) {
    const cell = LOD[lod].cell, n = Math.round(CH / cell), s = n + 3;   // heights with a 1-cell border (for normals)
    const hs = new Float32Array(s * s);
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) hs[j * s + i] = terrainHeight(ch.x0 + (i - 1) * cell, ch.z0 + (j - 1) * cell);
    const nv = (n + 1) * (n + 1), nSk = 4 * n, total = nv + nSk;
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), cols = new Float32Array(total * 3), uv = new Float32Array(total * 2);
    const ts = tex ? tex.tile[0] : 3;
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const k = j * (n + 1) + i, x = ch.x0 + i * cell, z = ch.z0 + j * cell, h = hs[(j + 1) * s + i + 1];
      const dx = hs[(j + 1) * s + i + 2] - hs[(j + 1) * s + i], dz = hs[(j + 2) * s + i + 1] - hs[j * s + i + 1];
      const nx = -dx, ny = 2 * cell, nz = -dz, l = Math.hypot(nx, ny, nz);
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      nor[k * 3] = nx / l; nor[k * 3 + 1] = ny / l; nor[k * 3 + 2] = nz / l;
      colourAt(x, z, h, ny / l, col); cols[k * 3] = col.r; cols[k * 3 + 1] = col.g; cols[k * 3 + 2] = col.b;
      uv[k * 2] = x / ts; uv[k * 2 + 1] = z / ts;
    }
    const idx = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    // skirts: perimeter (in order) copied down by the skirt depth, joined to the edge
    const per = [];
    for (let i = 0; i < n; i++) per.push(i);                                // north edge  (j = 0)
    for (let j = 0; j < n; j++) per.push(j * (n + 1) + n);                  // east edge   (i = n)
    for (let i = n; i > 0; i--) per.push(n * (n + 1) + i);                  // south edge  (j = n)
    for (let j = n; j > 0; j--) per.push(j * (n + 1));                      // west edge   (i = 0)
    const drop = cfg.skirt * cell + 0.3;
    per.forEach((v, q) => {
      const k = nv + q;
      pos[k * 3] = pos[v * 3]; pos[k * 3 + 1] = pos[v * 3 + 1] - drop; pos[k * 3 + 2] = pos[v * 3 + 2];
      nor.copyWithin(k * 3, v * 3, v * 3 + 3); cols.copyWithin(k * 3, v * 3, v * 3 + 3); uv.copyWithin(k * 2, v * 2, v * 2 + 2);
    });
    for (let q = 0; q < per.length; q++) {
      const a = per[q], b = per[(q + 1) % per.length], a2 = nv + q, b2 = nv + (q + 1) % per.length;
      idx.push(a, b, b2, a, b2, a2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeBoundingSphere(); g.computeBoundingBox();
    const m = new THREE.Mesh(g, terrainMat); m.receiveShadow = true; m.castShadow = false; m.visible = false; m.matrixAutoUpdate = false;
    terrain.add(m); ch.meshes[lod] = m; stats.built++;
    return m;
  }
  const stats = { built: 0, freed: 0, lodCounts: LOD.map(() => 0), visibleChunks: 0, queue: 0, visibleTiles: 0 };
  const chunkDist = (ch, px, pz) => Math.hypot(Math.max(ch.x0 - px, 0, px - (ch.x0 + CH)), Math.max(ch.z0 - pz, 0, pz - (ch.z0 + CH)));
  const wantLod = (d) => { for (let l = 0; l < LOD.length; l++) if (d < LOD[l].dist) return l; return LOD.length - 1; };
  let lastPX = 1e9, lastPZ = 1e9, queue = [];
  /** Pick each chunk's level, build missing levels (budgeted), show the best available one, free unused fine levels. */
  function updateTerrain(px, pz, force) {
    if (!force && Math.abs(px - lastPX) < 2 && Math.abs(pz - lastPZ) < 2 && queue.length === 0) return;   // nothing to do
    lastPX = px; lastPZ = pz;
    queue = [];
    for (const ch of chunks) {
      const d = chunkDist(ch, px, pz), vis = d < cfg.viewDist;
      const want = wantLod(d);
      if (vis && !ch.meshes[want]) queue.push({ ch, want, d });
      let show = -1;
      if (vis) {
        if (ch.meshes[want]) show = want;
        else { for (let l = want + 1; l < LOD.length && show < 0; l++) if (ch.meshes[l]) show = l; for (let l = want - 1; l >= 0 && show < 0; l--) if (ch.meshes[l]) show = l; }
      }
      if (show !== ch.shown) { if (ch.shown >= 0 && ch.meshes[ch.shown]) ch.meshes[ch.shown].visible = false; if (show >= 0) ch.meshes[show].visible = true; ch.shown = show; }
      // free fine levels far from the player (memory on 4 GB machines)
      for (let l = 0; l < LOD.length - 1; l++) {
        const m = ch.meshes[l];
        if (m && l !== show && d > LOD[l].dist * cfg.freeFactor + CH) { terrain.remove(m); m.geometry.dispose(); ch.meshes[l] = null; stats.freed++; }
      }
    }
    queue.sort((a, b) => a.d - b.d);
    // build nearest first: at least buildPerFrame chunks, more while under buildMs (all of them on the first call)
    const t0 = performance.now(); let k = 0;
    for (; k < queue.length; k++) {
      if (!force && k >= cfg.buildPerFrame && performance.now() - t0 > cfg.buildMs) break;
      const { ch, want } = queue[k];
      buildChunk(ch, want);
      if (ch.shown >= 0 && ch.meshes[ch.shown]) ch.meshes[ch.shown].visible = false;
      ch.meshes[want].visible = true; ch.shown = want;
    }
    queue = queue.slice(k);
    stats.queue = queue.length;
    stats.lodCounts.fill(0); stats.visibleChunks = 0;
    for (const ch of chunks) if (ch.shown >= 0) { stats.visibleChunks++; stats.lodCounts[ch.shown]++; }
  }

  // ── Water ribbon along the stream (semi-transparent, sky reflection, ripples drift downstream) ──
  const wtex = waterTexture(rand); wtex.repeat.set(1, 1);
  const wsteps = Math.ceil((2 * EXT) / 4), wpos = [], wuv = [], widx = [];
  for (let s = 0; s <= wsteps; s++) {
    const z = -EXT + s * 4, c = rx(z), hw = (rw(z) + 0.7) * Math.sqrt(1 + rdx(z) ** 2);
    wpos.push(c - hw, RV.waterY, z, c + hw, RV.waterY, z); wuv.push(0, z / 7, 1, z / 7);
    if (s < wsteps) { const a = s * 2; widx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const wgeo = new THREE.BufferGeometry();
  wgeo.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3)); wgeo.setAttribute('uv', new THREE.Float32BufferAttribute(wuv, 2));
  wgeo.setIndex(widx); wgeo.computeVertexNormals();
  const W = cfg.water;
  const water = new THREE.Mesh(wgeo, new THREE.MeshStandardMaterial({ color: W.color, map: wtex, transparent: true, opacity: W.opacity, roughness: W.roughness, metalness: 0.05,
    envMap: skyEnv(W.skyTop, W.skyHorizon), envMapIntensity: W.reflect, depthWrite: false, side: THREE.DoubleSide }));
  water.renderOrder = 2; water.receiveShadow = true; scene.add(water);

  // ── Wind sway (height-weighted, per-instance phase; same idea as the island / snow maps) ──
  const windTime = { value: 0 }, WD = cfg.wind;
  function addWind(mat, strength, height) {
    if (!(strength > 0)) return;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uWindT = windTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWindT;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float hw = clamp(transformed.y / ${height.toFixed(3)}, 0.0, 1.0); hw *= hw;
          float ph = ip.x * 0.37 + ip.z * 0.53, t = uWindT * ${(+WD.speed).toFixed(3)};
          float a = ${strength.toFixed(3)} * hw * (1.0 + ${(+WD.gust).toFixed(3)} * sin(t * 0.23 + ip.x * 0.05));
          transformed.x += (sin(t + ph) * 0.8 + sin(t * 2.3 + ph * 1.7) * 0.2) * a;
          transformed.z += cos(t * 0.8 + ph * 1.3) * a * 0.5;
        }`);
    };
    mat.customProgramCacheKey = () => 'forestwind' + strength + '_' + height;
  }

  // ── Placement (spatial grid for spacing) ──
  const colliders = [], bushes = [];
  const PG = 8, placed = new Map();
  const pkey = (i, j) => (i + 4096) * 8192 + (j + 4096);
  function addPlaced(x, z, gap) { const k = pkey(Math.floor(x / PG), Math.floor(z / PG)); let l = placed.get(k); if (!l) placed.set(k, (l = [])); l.push({ x, z, gap }); }
  function crowded(x, z, gap) {
    const i0 = Math.floor(x / PG), j0 = Math.floor(z / PG);
    for (let j = j0 - 1; j <= j0 + 1; j++) for (let i = i0 - 1; i <= i0 + 1; i++) {
      const l = placed.get(pkey(i, j)); if (!l) continue;
      for (const p of l) if (Math.hypot(p.x - x, p.z - z) < gap + p.gap) return true;
    }
    return false;
  }
  const grove = (x, z) => Nc.fbm(x / cfg.trees.clusterScale, z / cfg.trees.clusterScale, 3);
  function freeSpot(x, z, gap, waterPad = 2) {
    if (riverDist(x, z) < rw(z) + RV.bank + waterPad || nearTrack(x, z, 2.2) || inClearing(x, z) || bridgeAt(x, z)) return false;
    for (const b of bridges) if (Math.abs(x - b.x) < b.half + 4 && Math.abs(z - b.z) < b.hw + 4) return false;
    return !crowded(x, z, gap);
  }
  // per-tile instance lists: kind -> tileIndex -> [{ m, c }]
  const PT = cfg.propTile, NT = Math.ceil((2 * EXT) / PT), TO = -NT * PT / 2;
  const tileOf = (x, z) => Math.max(0, Math.min(NT - 1, Math.floor((x - TO) / PT))) + NT * Math.max(0, Math.min(NT - 1, Math.floor((z - TO) / PT)));
  const kinds = {};
  function addInst(kind, x, y, z, yaw, s, tilt = 0, sy = s, tint = 1) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler((rand() - 0.5) * tilt, yaw, (rand() - 0.5) * tilt)), new THREE.Vector3(s, sy, s));
    (kinds[kind].tiles[tileOf(x, z)] ||= []).push({ m, tint });
  }
  const pineMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, flatShading: true });
  const broadMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
  addWind(pineMat, WD.strength, 6.3); addWind(broadMat, WD.strength * 1.2, 5.4);
  const rockDef = assets.rock.build(), bushDef = assets.bush.build();
  const bushMat = bushDef.parts[0].material.clone(); bushMat.color.setHex(C.bush); addWind(bushMat, WD.bushStrength, 1.3);
  const woodMat = new THREE.MeshStandardMaterial({ color: C.wood, roughness: 0.9 });
  kinds.pine = { geo: pineGeometry(), mat: pineMat, shadow: true, tiles: {} };
  kinds.broad = { geo: broadleafGeometry(), mat: broadMat, shadow: true, tiles: {} };
  kinds.bush = { geo: bushDef.parts[0].geometry, mat: bushMat, shadow: false, tiles: {} };
  kinds.rock = { geo: rockDef.parts[0].geometry, mat: rockDef.parts[0].material, shadow: true, tiles: {} };
  kinds.post = { geo: new THREE.BoxGeometry(0.16, 1.3, 0.16).translate(0, 0.55, 0), mat: woodMat, shadow: false, tiles: {} };
  kinds.rail = { geo: new THREE.BoxGeometry(1, 0.1, 0.07), mat: woodMat, shadow: false, tiles: {} };

  const T = cfg.trees, lim = cfg.walkLimit - 2;
  function scatterTrees(kind, count, gap, sMin, sMax, rTrunk, hTrunk, prop) {
    let n = 0;
    for (let tries = 0; n < count && tries < count * 60; tries++) {
      const x = (rand() * 2 - 1) * lim, z = (rand() * 2 - 1) * lim, g = grove(x, z);
      if (rand() > smooth(T.clusterAt - 0.1, T.clusterAt + 0.12, g) * 0.97 + T.loneChance) continue;   // groves + a few lone trees
      if (!freeSpot(x, z, gap)) continue;
      const sc = sMin + rand() * (sMax - sMin), y = terrainHeight(x, z) - 0.08;
      addInst(kind, x, y, z, rand() * TAU, sc, 0.06, sc * (0.9 + rand() * 0.25), 0.85 + rand() * 0.3);
      addPlaced(x, z, gap * 0.5);
      const r = rTrunk * sc; colliders.push({ min: new THREE.Vector3(x - r, y, z - r), max: new THREE.Vector3(x + r, y + hTrunk * sc, z + r), prop });
      n++;
    }
    return n;
  }
  const counts = {};
  counts.pines = scatterTrees('pine', T.pines, 2.6, 0.8, 1.35, 0.24, 6, 'pine_tree');
  counts.broadleaf = scatterTrees('broad', T.broadleaf, 3.2, 0.8, 1.3, 0.3, 5, 'broadleaf_tree');
  // bushes: grove edges + near the bank, conceal (no collision)
  counts.bushes = 0;
  for (let tries = 0; counts.bushes < T.bushes && tries < T.bushes * 40; tries++) {
    const x = (rand() * 2 - 1) * lim, z = (rand() * 2 - 1) * lim, g = grove(x, z), d = riverDist(x, z) - rw(z);
    const want = smooth(T.clusterAt - 0.2, T.clusterAt, g) * 0.8 + (d > RV.bank + 1 && d < RV.bank + 10 ? 0.5 : 0);
    if (rand() > want) continue;
    if (!freeSpot(x, z, 1.3, 1)) continue;
    const sc = 0.75 + rand() * 0.7, y = terrainHeight(x, z) - 0.05;
    addInst('bush', x, y, z, rand() * TAU, sc, 0.1, sc, 0.85 + rand() * 0.3); addPlaced(x, z, 0.7);
    bushes.push({ x, y: y + bushDef.conceal.y * sc, z, r: bushDef.conceal.r * sc }); counts.bushes++;
  }
  // rocks: some on the banks and hills, solid cover
  counts.rocks = 0;
  for (let tries = 0; counts.rocks < T.rocks && tries < T.rocks * 40; tries++) {
    const x = (rand() * 2 - 1) * lim, z = (rand() * 2 - 1) * lim, d = riverDist(x, z) - rw(z);
    if (rand() > (d < RV.bank + 14 ? 0.7 : 0.25)) continue;
    if (!freeSpot(x, z, 1.6, 0.6)) continue;
    const sc = 0.7 + rand() * 1.4, y = terrainHeight(x, z) - 0.1;
    addInst('rock', x, y, z, rand() * TAU, sc, 0.35, sc * (0.7 + rand() * 0.4), 0.8 + rand() * 0.35); addPlaced(x, z, 1.1 * sc);
    const r = rockDef.solid.r * sc; colliders.push({ min: new THREE.Vector3(x - r, y, z - r), max: new THREE.Vector3(x + r, y + rockDef.solid.h * sc, z + r), prop: 'rock_boulder' });
    counts.rocks++;
  }
  // scenery pines on the boundary hills (outside the fence, no colliders)
  for (let i = 0; i < T.boundaryPines; i++) {
    const side = (rand() * 4) | 0, t = (rand() * 2 - 1) * (EXT - 10), o = cfg.fence + 4 + rand() * (EXT - cfg.fence - 14);
    const x = side < 2 ? t : (side === 2 ? o : -o), z = side < 2 ? (side === 0 ? o : -o) : t;
    if (riverDist(x, z) < rw(z) + 3) continue;
    const sc = 0.9 + rand() * 0.6; addInst(rand() < 0.75 ? 'pine' : 'broad', x, terrainHeight(x, z) - 0.1, z, rand() * TAU, sc, 0.06, sc, 0.8 + rand() * 0.3);
  }
  // fence: posts every fence.step m + 2 rails, all round the square
  const F = cfg.fence, FS = cfg.fenceStep;
  for (let side = 0; side < 4; side++) for (let s = -F; s < F; s += FS) {
    const pt = (u) => (side === 0 ? [u, -F] : side === 1 ? [u, F] : side === 2 ? [-F, u] : [F, u]);
    const [x, z] = pt(s), [x2, z2] = pt(s + FS), y = terrainHeight(x, z), y2 = terrainHeight(x2, z2);
    addInst('post', x, y, z, 0, 1, 0.04);
    const mx = (x + x2) / 2, mz = (z + z2) / 2, yaw = side < 2 ? 0 : Math.PI / 2, len = Math.hypot(FS, y2 - y), pitchA = Math.atan2(y2 - y, FS);
    for (const hh of [0.55, 1.0]) {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(mx, (y + y2) / 2 + hh, mz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, side < 2 ? pitchA : -pitchA, 'YXZ')), new THREE.Vector3(len, 1, 1));
      (kinds.rail.tiles[tileOf(mx, mz)] ||= []).push({ m, tint: 1 });
    }
  }
  // build the instanced meshes per tile
  const tiles = [];
  const tint = new THREE.Color();
  for (const [name, k] of Object.entries(kinds)) {
    for (const [ti, list] of Object.entries(k.tiles)) {
      const im = new THREE.InstancedMesh(k.geo, k.mat, list.length);
      list.forEach((it, i) => { im.setMatrixAt(i, it.m); im.setColorAt(i, tint.setScalar(it.tint)); });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = k.shadow && cfg.propShadows; im.receiveShadow = true; im.computeBoundingSphere(); im.name = 'forest-' + name;
      const i = +ti % NT, j = Math.floor(+ti / NT);
      scene.add(im); tiles.push({ im, cx: TO + (i + 0.5) * PT, cz: TO + (j + 0.5) * PT });
    }
  }

  // ── Bridges: deck planks, rails, posts, log piles (rails are solid) ──
  const deckMat = new THREE.MeshStandardMaterial({ color: C.deck, roughness: 0.9 }), railMat = woodMat;
  for (const b of bridges) {
    const g = new THREE.Group(), L = b.half * 2, Wd = b.hw * 2;
    const planks = [];
    for (let x = -b.half + 0.25; x < b.half; x += 0.5) planks.push(new THREE.BoxGeometry(0.44, 0.12, Wd).translate(x, -0.06, 0));
    g.add(new THREE.Mesh(mergeGeometries(planks), deckMat));
    const beams = new THREE.Mesh(new THREE.BoxGeometry(L, 0.2, 0.25), railMat); beams.position.set(0, -0.22, b.hw - 0.3); g.add(beams);
    const beams2 = beams.clone(); beams2.position.z = -b.hw + 0.3; g.add(beams2);
    for (const sz of [-1, 1]) {
      for (const hh of [0.5, 0.95]) { const r = new THREE.Mesh(new THREE.BoxGeometry(L, 0.09, 0.09), railMat); r.position.set(0, hh, sz * (b.hw - 0.05)); g.add(r); }
      for (let x = -b.half; x <= b.half + 0.01; x += L / Math.max(2, Math.round(L / 2.5))) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.1, 0.14), railMat); p.position.set(x, 0.5, sz * (b.hw - 0.05)); g.add(p); }
      colliders.push({ min: new THREE.Vector3(b.x - b.half, b.y - 0.2, b.z + sz * b.hw - 0.12), max: new THREE.Vector3(b.x + b.half, b.y + 1.05, b.z + sz * b.hw + 0.12), prop: 'bridge' });
    }
    for (const px of [-b.half * 0.45, b.half * 0.45]) for (const sz of [-1, 1]) {
      const ground = terrainHeight(b.x + px, b.z + sz * (b.hw - 0.3)), hgt = b.y - ground + 0.3;
      const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, hgt, 6), railMat); pile.position.set(px, -hgt / 2, sz * (b.hw - 0.3)); g.add(pile);
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.position.set(b.x, b.y, b.z); scene.add(g);
  }

  // ── Runtime ──
  let follow = null;
  /** Enemy spawns: a ring around the followed position (the player), on land, out of the water. */
  function randomSpot(rnd = Math.random, { margin = 1.5 } = {}) {
    const c = follow || { x: start[0], z: start[1] }, [r0, r1] = cfg.spawnRing;
    for (let n = 0; n < 40; n++) {
      const a = rnd() * TAU, r = r0 + rnd() * (r1 - r0), x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (onLand(x, z, margin) && !inWater(x, z) && !bridgeAt(x, z)) return [x, z];
    }
    return [c.x, c.z];
  }
  function clampPos(p) { const l = cfg.walkLimit; p.x = Math.max(-l, Math.min(l, p.x)); p.z = Math.max(-l, Math.min(l, p.z)); }
  function surfaceAt(p) {
    if (bridgeAt(p.x, p.z) && p.y > terrainHeight(p.x, p.z) + 0.2) return 'wood';
    const d = riverDist(p.x, p.z), w = rw(p.z);
    if (d < w + RV.bank + 1) return 'sand';
    if (nearTrack(p.x, p.z, 0.4)) return 'dirt';
    return 'grass';
  }
  let tileT = 0;
  function update(t, cam) {
    windTime.value = t;
    wtex.offset.y = -t * W.flow;
    if (!cam) return;
    updateTerrain(cam.x, cam.z, false);
    if (t - tileT > 0.25 || t < tileT) {   // prop tiles past the view distance are skipped
      tileT = t; let v = 0;
      const R2 = cfg.propViewDist + PT * 0.71;
      for (const tl of tiles) { const vis = Math.hypot(tl.cx - cam.x, tl.cz - cam.z) < R2; tl.im.visible = vis; if (vis) v++; }
      stats.visibleTiles = v;
    }
  }
  // the coarsest level of every chunk is built up front and kept: a moving player never sees a hole while finer levels build
  for (const ch of chunks) buildChunk(ch, LOD.length - 1);
  updateTerrain(start[0], start[1], true);
  update(0, { x: start[0], z: start[1] });
  counts.tiles = tiles.length; counts.chunks = chunks.length; counts.colliders = colliders.length; counts.bridges = bridges.length;

  return {
    R: H, wadeR: H, beachIn: H * 2, windTime, wind: WD, isOpen, start, startYaw, heightAt, terrainHeight, inWater, onLand, colliders, bushes,
    randomSpot, clampPos, surfaceAt, update, counts, terrain, water, bridges, tracks, river: { x: rx, halfWidth: rw, dist: riverDist },
    setFollow(p) { follow = p; }, stats: () => ({ ...stats, lodCounts: [...stats.lodCounts] }),
  };
}
