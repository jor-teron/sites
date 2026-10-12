/**
 * Browser FPS — Island map: round island (radius from config), heightfield terrain, ocean boundary, seeded props.
 *
 * buildIsland(scene, cfg, assets, renderer) -> {
 *   R, wadeR, start: [x, z], heightAt(x, z), onLand(x, z, margin), colliders (AABBs: rocks + palm trunks),
 *   bushes: [{ x, y, z, r }] (concealment spheres), randomSpot(rand, { zMax, margin }), update(t) }
 * Everything is placed / scaled by cfg.radius, so changing that one value resizes the whole map.
 * Look adapted from apps/lab/island-demo (sky, fog, turquoise water, palms, rocks).
 */
import * as THREE from 'three';

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function buildIsland(scene, cfg, assets, renderer) {
  const R = cfg.radius;
  const rand = mulberry32(cfg.seed);
  const beachIn = R * cfg.beachFrac;            // inner edge of the beach ring
  const wadeR = R + cfg.wade;                   // player can wade out to here
  // hill waves: frequencies scale with the radius (same look at any size)
  const waves = [];
  for (let i = 0; i < 4; i++) {
    const a = rand() * Math.PI * 2, k = (Math.PI * 2 / R) * (0.9 + i * 0.75 + rand() * 0.4);
    waves.push({ kx: Math.cos(a) * k, kz: Math.sin(a) * k, ph: rand() * 6.28, w: 1 / (i + 1) });
  }
  const wsum = waves.reduce((s, w) => s + w.w, 0);

  function heightAt(x, z) {
    const r = Math.hypot(x, z);
    if (r >= R) return -Math.min(cfg.seaDepth, (r - R) * cfg.seaSlope);           // under water
    if (r >= beachIn) return cfg.beachHeight * (R - r) / (R - beachIn);             // flat-ish beach
    let n = 0;
    for (const w of waves) n += Math.sin(x * w.kx + z * w.kz + w.ph) * w.w;
    n = 0.5 + 0.5 * n / wsum;                                                       // 0..1
    const t = smooth(beachIn, beachIn - R * 0.18, r);                               // fade hills in from the beach
    return cfg.beachHeight + cfg.hillHeight * n * t;
  }
  const onLand = (x, z, m = 0) => Math.hypot(x, z) <= R - m;

  // ── Terrain mesh (vertex colours × grain texture) ──
  const size = 2 * (R + cfg.seaApron), seg = Math.round(size / cfg.terrainCell);
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, cols = new Float32Array(pos.count * 3);
  const C = {
    sea: new THREE.Color(cfg.colors.seabed), wet: new THREE.Color(cfg.colors.wetSand), sand: new THREE.Color(cfg.colors.sand),
    grass: new THREE.Color(cfg.colors.grass), forest: new THREE.Color(cfg.colors.forest),
  };
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), r = Math.hypot(x, z), h = heightAt(x, z);
    pos.setY(i, h);
    const jitter = (Math.sin(x * 1.7 + z * 2.3) * Math.sin(x * 0.6 - z * 1.1)) * 0.5 + 0.5;
    if (r > R + 0.2) col.copy(C.wet).lerp(C.sea, smooth(R + 0.2, R + 4, r));
    else if (r > R - cfg.wetWidth) col.copy(C.sand).lerp(C.wet, smooth(R - cfg.wetWidth, R - 0.2, r));
    else if (r > beachIn - 1.5) col.copy(C.grass).lerp(C.sand, smooth(beachIn - 1.5, beachIn + 0.5, r));
    else col.copy(C.forest).lerp(C.grass, smooth(R * 0.35, beachIn - 1.5, r + jitter * R * 0.12));
    cols[i * 3] = col.r; cols[i * 3 + 1] = col.g; cols[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const tex = assets.textures.island ? assets.textures.island.make(renderer, {}) : null;
  if (tex) { tex.map.repeat.set(size / tex.tile[0], size / tex.tile[1]); }
  const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: tex ? tex.map : null, roughness: 0.95 }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  // ── Ocean: low-res plane with cheap CPU sine waves + pulsing shore foam ring ──
  const wsize = 2 * (R + cfg.oceanExtra), wseg = cfg.waterSegments;
  const wgeo = new THREE.PlaneGeometry(wsize, wsize, wseg, wseg);
  wgeo.rotateX(-Math.PI / 2);
  const wbase = Float32Array.from(wgeo.attributes.position.array);
  const water = new THREE.Mesh(wgeo, new THREE.MeshStandardMaterial({ color: cfg.colors.water, transparent: true, opacity: 0.82, roughness: 0.25, metalness: 0.1 }));
  water.position.y = cfg.waterLevel;
  scene.add(water);
  const foam = new THREE.Mesh(new THREE.RingGeometry(R - 0.5, R + 0.7, 96, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
  foam.rotation.x = -Math.PI / 2;
  foam.position.y = cfg.waterLevel + 0.03;
  scene.add(foam);

  // ── Props (seeded, instanced) ──
  const colliders = [], bushes = [], placed = [];
  const start = [0, R * cfg.startFrac];
  function sample(weightFn, minGap, tries = 40) {
    for (let n = 0; n < tries; n++) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * (R - 1.2);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (rand() > weightFn(r / R)) continue;
      if (Math.hypot(x - start[0], z - start[1]) < cfg.startClear) continue;
      if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < minGap + p.gap)) continue;
      return [x, z];
    }
    return null;
  }
  const area = Math.PI * R * R;
  function scatter(asset, count, weightFn, gap, sMin, sMax, tilt) {
    const def = asset.build(), mats = [];
    let n = 0;
    for (let i = 0; i < count; i++) {
      const s = sample(weightFn, gap); if (!s) continue;
      const sc = sMin + rand() * (sMax - sMin), yaw = rand() * 6.28, y = heightAt(s[0], s[1]) - 0.05;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(s[0], y, s[1]),
        new THREE.Quaternion().setFromEuler(new THREE.Euler((rand() - 0.5) * tilt, yaw, (rand() - 0.5) * tilt)), new THREE.Vector3(sc, sc, sc));
      mats.push(m);
      placed.push({ x: s[0], z: s[1], gap: gap * 0.5 });
      if (def.solid) { const r = def.solid.r * sc; colliders.push({ min: new THREE.Vector3(s[0] - r, y, s[1] - r), max: new THREE.Vector3(s[0] + r, y + def.solid.h * sc, s[1] + r), prop: asset.name }); }
      if (def.conceal) bushes.push({ x: s[0], y: y + def.conceal.y * sc, z: s[1], r: def.conceal.r * sc });
      n++;
    }
    for (const part of def.parts) {
      const im = new THREE.InstancedMesh(part.geometry, part.material, Math.max(1, n));
      im.count = n;
      mats.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = !!part.castShadow && cfg.propShadows;
      im.receiveShadow = true;
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      scene.add(im);
    }
    return n;
  }
  const counts = {
    palms: scatter(assets.palm, Math.round(area * cfg.palmDensity), (u) => (u < cfg.beachFrac * 0.85 ? 1 : 0.35), 2.4, 0.85, 1.25, 0.12),
    rocks: scatter(assets.rock, Math.round(area * cfg.rockDensity), () => 1, 2.2, 0.8, 1.7, 0.4),
    bushes: scatter(assets.bush, Math.round(area * cfg.bushDensity), (u) => (u < cfg.beachFrac * 0.9 ? 1 : 0.15), 1.6, 0.8, 1.4, 0.1),
  };

  /** Random land spot (uniform over the disk) with optional z limit. */
  function randomSpot(rnd = Math.random, { zMax = Infinity, margin = 1.5 } = {}) {
    for (let n = 0; n < 30; n++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (R - margin);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (z <= zMax) return [x, z];
    }
    return [0, Math.min(0, zMax)];
  }

  const wp = wgeo.attributes.position;
  function update(t) {
    const A = cfg.waveHeight;
    for (let i = 0; i < wp.count; i++) {
      const x = wbase[i * 3], z = wbase[i * 3 + 2];
      wp.array[i * 3 + 1] = Math.sin(x * 0.35 + t * 1.3) * A + Math.sin(z * 0.27 - t * 0.9) * A * 0.7;
    }
    wp.needsUpdate = true;
    const s = Math.sin(t * 1.1);
    foam.material.opacity = 0.22 + 0.18 * (0.5 + 0.5 * s);
    foam.scale.setScalar(1 + 0.006 * s);
  }

  return { R, wadeR, start, heightAt, onLand, colliders, bushes, randomSpot, update, counts, terrain, water };
}
