/**
 * Browser FPS — Snow map: ~100×100 m snowy valley. Same interface as buildIsland (see browser-fps_island.js):
 * buildSnow(scene, cfg, assets, renderer) -> { R, wadeR, beachIn, start, heightAt, onLand, colliders, bushes,
 *   randomSpot, clampPos(pos), surfaceAt(p), update(t, camPos), counts, windTime, wind, isOpen, terrain, ice }
 * Soft boundary: the ground rises into snow banks / cliffs past cfg.half - cfg.bankWidth (plus fog), the player is
 * clamped a little inside the bank top. Content: rolling hills, snow-laden pines (instanced, wind sway), frozen lake
 * (reflective ice), small log cabins (solid), snow-capped rocks, falling snow particles around the camera.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Snow-laden pine: trunk + 4 stacked cones (dark green) with white snow cones on top of each tier. Feet at y=0. */
function pineParts() {
  const trunk = new THREE.CylinderGeometry(0.12, 0.2, 1.6, 6); trunk.translate(0, 0.8, 0);
  const green = [], snow = [];
  for (let i = 0; i < 4; i++) {
    const r = 1.55 - i * 0.32, h = 1.7 - i * 0.18, y = 1.1 + i * 1.0;
    const c = new THREE.ConeGeometry(r, h, 8, 1); c.translate(0, y + h / 2, 0);
    const p = c.attributes.position; for (let k = 0; k < p.count; k++) { const a = Math.atan2(p.getZ(k), p.getX(k)); if (p.getY(k) < y + 0.05) p.setY(k, p.getY(k) - 0.12 * (1 + Math.sin(a * 4 + i))); }   // droopy rim
    c.computeVertexNormals(); green.push(c);
    const s = new THREE.ConeGeometry(r * 0.82, h * 0.62, 8, 1); s.translate(0, y + h * 0.69, 0); snow.push(s);
  }
  return [
    { geometry: trunk, material: new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.9 }), castShadow: true },
    { geometry: mergeGeometries(green), material: new THREE.MeshStandardMaterial({ color: 0x24452f, roughness: 0.85, flatShading: true }), castShadow: true },
    { geometry: mergeGeometries(snow), material: new THREE.MeshStandardMaterial({ color: 0xf2f6fb, roughness: 0.75, flatShading: true }), castShadow: true },
  ];
}

/** Sky-gradient env map for the ice (equirect canvas). */
function skyEnv(top, hor) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d'), grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, '#' + new THREE.Color(top).getHexString()); grd.addColorStop(0.5, '#' + new THREE.Color(hor).getHexString()); grd.addColorStop(1, '#c8d4dc');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 128);
  const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** Ice surface texture: pale blue with darker patches, white cracks and frost speckle. */
function iceTexture(rand) {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#9fc9dc'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) { const x = rand() * S, y = rand() * S, r = 30 + rand() * 90, grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, rand() < 0.5 ? 'rgba(40,90,120,0.35)' : 'rgba(230,245,255,0.35)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(0, 0, S, S); }
  g.strokeStyle = 'rgba(245,252,255,0.7)';
  for (let i = 0; i < 26; i++) { let x = rand() * S, y = rand() * S, a = rand() * 6.28; g.lineWidth = 0.6 + rand() * 1.4; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 8; k++) { a += (rand() - 0.5) * 1.2; x += Math.cos(a) * 14; y += Math.sin(a) * 14; g.lineTo(x, y); } g.stroke(); }
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(255,255,255,${(rand() * 0.25).toFixed(2)})`; g.fillRect(rand() * S, rand() * S, 1.5, 1.5); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export function buildSnow(scene, cfg, assets, renderer) {
  const H = cfg.half, rand = mulberry32(cfg.seed);
  const R = H;                                                    // "radius" for shared code (world box / spawn margins)
  const bankIn = H - cfg.bankWidth;
  const lake = { x: cfg.lake.x, z: cfg.lake.z, r: cfg.lake.r };
  const waves = [];
  for (let i = 0; i < 4; i++) { const a = rand() * 6.28, k = (Math.PI * 2 / 100) * (1.2 + i * 0.9 + rand() * 0.5); waves.push({ kx: Math.cos(a) * k, kz: Math.sin(a) * k, ph: rand() * 6.28, w: 1 / (i + 1) }); }
  const wsum = waves.reduce((s, w) => s + w.w, 0);
  const edge = (x, z) => Math.max(Math.abs(x), Math.abs(z));      // square distance from centre

  function heightAt(x, z) {
    let n = 0; for (const w of waves) n += Math.sin(x * w.kx + z * w.kz + w.ph) * w.w;
    n = 0.5 + 0.5 * n / wsum;
    let h = cfg.hillHeight * n;
    const dl = Math.hypot(x - lake.x, z - lake.z);
    h *= smooth(lake.r, lake.r + cfg.lake.shore, dl);              // flatten into the lake basin
    if (dl < lake.r) h = cfg.lake.iceY - 0.15;                     // lake bed just under the ice (ice is the ground)
    for (const c of cfg.cabins) { const d = Math.hypot(x - c.x, z - c.z); h = h * smooth(4.5, 9, d) + flatAt(c) * (1 - smooth(4.5, 9, d)); }
    const e = edge(x, z);
    if (e > bankIn) { const u = Math.min(1.6, (e - bankIn) / cfg.bankWidth) + Math.max(0, e - bankIn - 1.6 * cfg.bankWidth) * 0.02; h += cfg.bankHeight * u * u * (1 + 0.25 * Math.sin(x * 0.7 + z * 0.9)); }   // soft snow banks / cliffs
    return h;
  }
  const flatCache = new Map();
  function flatAt(c) {   // base height of a cabin pad (hills only, evaluated once)
    const k = c.x + ',' + c.z; if (flatCache.has(k)) return flatCache.get(k);
    let n = 0; for (const w of waves) n += Math.sin(c.x * w.kx + c.z * w.kz + w.ph) * w.w; const v = cfg.hillHeight * (0.5 + 0.5 * n / wsum);
    flatCache.set(k, v); return v;
  }
  const onIce = (x, z) => Math.hypot(x - lake.x, z - lake.z) < lake.r;
  const surfH = (x, z) => (onIce(x, z) ? cfg.lake.iceY : heightAt(x, z));
  const onLand = (x, z, m = 0) => edge(x, z) <= H - m;

  // ── Terrain (vertex colours: snow white, blue shade in hollows, a little rock on the steep banks) ──
  const size = 2 * (H + cfg.apron), seg = Math.round(size / cfg.terrainCell);
  const geo = new THREE.PlaneGeometry(size, size, seg, seg); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, cols = new Float32Array(pos.count * 3);
  const cSnow = new THREE.Color(cfg.colors.snow), cShade = new THREE.Color(cfg.colors.snowShade), cRock = new THREE.Color(cfg.colors.cliff), col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = heightAt(x, z); pos.setY(i, h);
    const j = (Math.sin(x * 1.3 + z * 0.7) * Math.sin(x * 0.4 - z * 1.7)) * 0.5 + 0.5;
    col.copy(cSnow).lerp(cShade, (1 - Math.min(1, h / (cfg.hillHeight + 0.01))) * 0.45 + j * 0.12);
    const e = edge(x, z); if (e > bankIn + 2) col.lerp(cRock, smooth(bankIn + 2, H + 6, e) * (0.35 + 0.4 * j));
    cols[i * 3] = col.r; cols[i * 3 + 1] = col.g; cols[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
  terrain.receiveShadow = true; scene.add(terrain);

  // ── Frozen lake: reflective ice disc ──
  const ice = new THREE.Mesh(new THREE.CircleGeometry(lake.r + 0.4, 64), new THREE.MeshStandardMaterial({
    map: iceTexture(rand), envMap: skyEnv(cfg.ice.skyTop, cfg.ice.skyHorizon), envMapIntensity: cfg.ice.reflect,
    roughness: cfg.ice.roughness, metalness: 0.05, color: cfg.ice.color }));
  ice.material.map.repeat.set(cfg.ice.texRepeat, cfg.ice.texRepeat);
  ice.rotation.x = -Math.PI / 2; ice.position.set(lake.x, cfg.lake.iceY, lake.z); ice.receiveShadow = true;
  scene.add(ice);

  // ── Wind sway (same idea as the island: height-weighted, per-instance phase) ──
  const windTime = { value: 0 }, W = cfg.wind;
  function addWind(mat, strength, height) {
    if (!(strength > 0)) return;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uWindT = windTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWindT;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float hw = clamp(transformed.y / ${height.toFixed(3)}, 0.0, 1.0); hw *= hw;
          float ph = ip.x * 0.37 + ip.z * 0.53, t = uWindT * ${(+W.speed).toFixed(3)};
          float a = ${strength.toFixed(3)} * hw * (1.0 + ${(+W.gust).toFixed(3)} * sin(t * 0.23 + ip.x * 0.05));
          transformed.x += (sin(t + ph) * 0.8 + sin(t * 2.3 + ph * 1.7) * 0.2) * a;
          transformed.z += cos(t * 0.8 + ph * 1.3) * a * 0.5;
        }`);
    };
    mat.customProgramCacheKey = () => 'snowwind' + strength;
  }

  // ── Placement ──
  const colliders = [], placed = [];
  const start = [0, H * cfg.startFrac];
  const blocked = (x, z, gap) => Math.hypot(x - start[0], z - start[1]) < cfg.startClear
    || Math.hypot(x - lake.x, z - lake.z) < lake.r + 1.2
    || cfg.cabins.some((c) => Math.hypot(x - c.x, z - c.z) < 5)
    || placed.some((p) => Math.hypot(p.x - x, p.z - z) < gap + p.gap);
  const isOpen = (x, z) => onIce(x, z);
  function spot(gap, lim) {
    for (let n = 0; n < 40; n++) { const x = (rand() * 2 - 1) * lim, z = (rand() * 2 - 1) * lim; if (!blocked(x, z, gap)) return [x, z]; }
    return null;
  }
  function instanced(parts, mats) {
    for (const part of parts) {
      const im = new THREE.InstancedMesh(part.geometry, part.material, Math.max(1, mats.length));
      im.count = mats.length; mats.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = !!part.castShadow && cfg.propShadows; im.receiveShadow = true;
      im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); scene.add(im);
    }
  }
  const M = (x, y, z, yaw, s, tilt = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler((rand() - 0.5) * tilt, yaw, (rand() - 0.5) * tilt)), new THREE.Vector3(s, s, s));

  // cabins (solid boxes for collision; simple log look)
  const logMat = new THREE.MeshStandardMaterial({ color: 0x7a5232, roughness: 0.9 }), endMat = new THREE.MeshStandardMaterial({ color: 0x5e3e24, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xf4f7fb, roughness: 0.8 }), eaveMat = new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 0.9 });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x3a2716, roughness: 0.9 }), winMat = new THREE.MeshStandardMaterial({ color: 0xffd58a, emissive: 0xffb050, emissiveIntensity: 0.6 });
  for (const c of cfg.cabins) {
    const g = new THREE.Group(), w = c.w, d = c.d, wallH = 2.4, y0 = flatAt(c);
    const logs = Math.round(wallH / 0.3);
    const logGeoX = new THREE.CylinderGeometry(0.16, 0.16, w + 0.5, 8); logGeoX.rotateZ(Math.PI / 2);
    const logGeoZ = new THREE.CylinderGeometry(0.16, 0.16, d + 0.5, 8); logGeoZ.rotateX(Math.PI / 2);
    for (let i = 0; i < logs; i++) {
      const y = 0.16 + i * 0.3;
      for (const s of [-1, 1]) {
        const a = new THREE.Mesh(logGeoX, logMat); a.position.set(0, y + (i % 2) * 0.0, s * d / 2); g.add(a);
        const b = new THREE.Mesh(logGeoZ, endMat); b.position.set(s * w / 2, y + 0.15, 0); g.add(b);
      }
    }
    const fill = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, wallH, d - 0.1), logMat); fill.position.y = wallH / 2; g.add(fill);
    // gable roof: two slabs covered in snow
    const rise = 1.4, half = d / 2 + 0.6, slope = Math.hypot(half, rise), ang = Math.atan2(rise, half);
    for (const s of [-1, 1]) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 1.0, 0.18, slope), eaveMat);
      slab.position.set(0, wallH + rise / 2, s * half / 2); slab.rotation.x = s * ang; g.add(slab);
      const sn = new THREE.Mesh(new THREE.BoxGeometry(w + 1.05, 0.22, slope * 0.98), roofMat);
      sn.position.set(0, wallH + rise / 2 + 0.16, s * half / 2 - s * 0.02); sn.rotation.x = s * ang; g.add(sn);
    }
    const gable = new THREE.BufferGeometry();
    const gx = w / 2 + 0.02; gable.setAttribute('position', new THREE.Float32BufferAttribute([gx, wallH, -d / 2, gx, wallH, d / 2, gx, wallH + rise, 0, -gx, wallH, d / 2, -gx, wallH, -d / 2, -gx, wallH + rise, 0], 3)); gable.computeVertexNormals();
    g.add(new THREE.Mesh(gable, new THREE.MeshStandardMaterial({ color: 0x6a4628, roughness: 0.9, side: THREE.DoubleSide })));
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.8, 0.12), doorMat); door.position.set(-w * 0.2, 0.9, d / 2 + 0.2); g.add(door);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.1), winMat); win.position.set(w * 0.22, 1.4, d / 2 + 0.2); g.add(win);
    const chim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, 0.5), new THREE.MeshStandardMaterial({ color: 0x777069, roughness: 1 })); chim.position.set(w * 0.3, wallH + rise * 0.8, -d * 0.15); g.add(chim);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.position.set(c.x, y0 - 0.1, c.z); g.rotation.y = c.yaw || 0;
    scene.add(g);
    // collider: AABB of the rotated footprint (yaw is multiple of 90° in config)
    const swap = Math.abs(Math.sin(c.yaw || 0)) > 0.5, hx = (swap ? d : w) / 2 + 0.25, hz = (swap ? w : d) / 2 + 0.25;
    colliders.push({ min: new THREE.Vector3(c.x - hx, y0 - 0.2, c.z - hz), max: new THREE.Vector3(c.x + hx, y0 + wallH + rise, c.z + hz), prop: 'cabin' });
    placed.push({ x: c.x, z: c.z, gap: 4 });
  }

  // pines
  const pineM = [];
  const nPines = Math.round(100 * 100 * cfg.pineDensity);
  for (let i = 0; i < nPines; i++) {
    const s = spot(2.6, H - 2); if (!s) continue;
    const sc = 0.8 + rand() * 0.55, y = heightAt(s[0], s[1]) - 0.05;
    pineM.push(M(s[0], y, s[1], rand() * 6.28, sc, 0.06)); placed.push({ x: s[0], z: s[1], gap: 1.3 });
    const r = 0.25 * sc; colliders.push({ min: new THREE.Vector3(s[0] - r, y, s[1] - r), max: new THREE.Vector3(s[0] + r, y + 5.5 * sc, s[1] + r), prop: 'pine_tree' });
  }
  // extra pines on the banks (outside the play area, scenery only)
  for (let i = 0; i < cfg.bankPines; i++) {
    const side = (rand() * 4) | 0, t = (rand() * 2 - 1) * (H + 8), o = H - 1 + rand() * 12;
    const x = side < 2 ? t : (side === 2 ? o : -o), z = side < 2 ? (side === 0 ? o : -o) : t;
    pineM.push(M(x, heightAt(x, z) - 0.1, z, rand() * 6.28, 0.9 + rand() * 0.6, 0.06));
  }
  const pp = pineParts(); for (const p of pp) addWind(p.material, W.strength, 5.8);
  instanced(pp, pineM);

  // rocks with snow caps (rock asset + a squashed white cap on the same matrix)
  const rockDef = assets.rock.build(), rockM = [];
  for (let i = 0; i < Math.round(100 * 100 * cfg.rockDensity); i++) {
    const s = spot(2.2, H - 2); if (!s) continue;
    const sc = 0.8 + rand() * 1.0, y = heightAt(s[0], s[1]) - 0.08;
    rockM.push(M(s[0], y, s[1], rand() * 6.28, sc, 0.3)); placed.push({ x: s[0], z: s[1], gap: 1.1 });
    const r = rockDef.solid.r * sc; colliders.push({ min: new THREE.Vector3(s[0] - r, y, s[1] - r), max: new THREE.Vector3(s[0] + r, y + rockDef.solid.h * sc, s[1] + r), prop: 'rock_boulder' });
  }
  const cap = rockDef.parts[0].geometry.clone(); cap.scale(1.04, 0.55, 1.04); cap.translate(0, 0.5, 0);
  { const p = cap.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) < 0.62) p.setY(i, 0.62 + (p.getY(i) - 0.62) * 0.2); cap.computeVertexNormals(); }
  const rockMats = rockDef.parts.map((p) => { const m = p.material.clone(); m.color.setHex(cfg.colors.rock); return { ...p, material: m }; });
  instanced([...rockMats, { geometry: cap, material: new THREE.MeshStandardMaterial({ color: 0xf3f7fc, roughness: 0.8, flatShading: true }), castShadow: false }], rockM);

  // ── Falling snow: points in a box that wraps around the camera (all motion in the vertex shader) ──
  let flakes = null;
  const F = cfg.snowfall;
  if (F.enabled && F.count > 0) {
    const fp = new Float32Array(F.count * 3), fr = new Float32Array(F.count);
    for (let i = 0; i < F.count; i++) { fp[i * 3] = rand() * F.box[0]; fp[i * 3 + 1] = rand() * F.box[1]; fp[i * 3 + 2] = rand() * F.box[2]; fr[i] = rand(); }
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(fp, 3)); fg.setAttribute('rnd', new THREE.BufferAttribute(fr, 1));
    const c = document.createElement('canvas'); c.width = c.height = 32; const g2 = c.getContext('2d'), grd = g2.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g2.fillStyle = grd; g2.fillRect(0, 0, 32, 32);
    flakes = new THREE.Points(fg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uT: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(...F.box) }, map: { value: new THREE.CanvasTexture(c) }, uSize: { value: F.size * window.innerHeight * 0.5 } },
      vertexShader: `attribute float rnd; uniform float uT, uSize; uniform vec3 uCam, uBox; varying float vA;
        void main() {
          vec3 p = position + vec3(sin(uT * 0.6 + rnd * 20.0) * 0.6 + uT * ${F.drift.toFixed(3)}, -uT * (${F.speed.toFixed(3)} * (0.7 + 0.6 * rnd)), cos(uT * 0.5 + rnd * 17.0) * 0.5);
          p = mod(p - uCam + uBox * 0.5, uBox) + uCam - uBox * 0.5;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float d = -mv.z; vA = smoothstep(0.3, 1.5, d) * (1.0 - smoothstep(uBox.x * 0.35, uBox.x * 0.5, length(p.xz - uCam.xz)));
          gl_PointSize = uSize * (0.6 + 0.8 * rnd) / max(d, 0.1); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying float vA; void main() { vec4 t = texture2D(map, gl_PointCoord); float a = t.a * vA * ${F.alpha.toFixed(3)}; if (a < 0.02) discard; gl_FragColor = vec4(1.0, 1.0, 1.0, a); }`,
    }));
    flakes.frustumCulled = false; flakes.renderOrder = 3; scene.add(flakes);
    window.addEventListener('resize', () => { flakes.material.uniforms.uSize.value = F.size * window.innerHeight * 0.5; });
  }

  function randomSpot(rnd = Math.random, { zMax = Infinity, margin = 1.5 } = {}) {
    const lim = bankIn - margin;
    for (let n = 0; n < 40; n++) { const x = (rnd() * 2 - 1) * lim, z = (rnd() * 2 - 1) * lim; if (z <= zMax && !onIce(x, z)) return [x, z]; }
    return [0, Math.min(0, zMax)];
  }
  /** Soft square boundary: clamp a bit up the snow bank. */
  function clampPos(p) { const lim = bankIn + cfg.walkIntoBank; p.x = Math.max(-lim, Math.min(lim, p.x)); p.z = Math.max(-lim, Math.min(lim, p.z)); }
  function surfaceAt(p) { return onIce(p.x, p.z) && p.y < cfg.lake.iceY + 0.3 ? 'ice' : 'snow'; }
  function update(t, cam) {
    windTime.value = t;
    if (flakes) { flakes.material.uniforms.uT.value = t; if (cam) flakes.material.uniforms.uCam.value.copy(cam); }
  }
  const counts = { pines: pineM.length, rocks: rockM.length, cabins: cfg.cabins.length, flakes: flakes ? F.count : 0 };
  return { R, wadeR: H, beachIn: bankIn, windTime, wind: W, isOpen, start, heightAt: surfH, onLand, colliders, bushes: [], randomSpot, clampPos, surfaceAt, update, counts, terrain, ice, onIce };
}
