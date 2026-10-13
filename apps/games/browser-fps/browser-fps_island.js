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

/**
 * 'reflect' water quality: MeshStandardMaterial with a generated sky (equirect gradient + sun) as its env map, so the
 * low roughness gives fresnel sky reflection + a sun glint; plus a cheap animated normal shimmer in the fragment shader.
 */
function reflectWater(color, w, R) {
  const W = 256, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, H);
  const top = '#' + new THREE.Color(w.skyTop).getHexString(), hor = '#' + new THREE.Color(w.skyHorizon).getHexString();
  grd.addColorStop(0, top); grd.addColorStop(0.48, hor); grd.addColorStop(0.52, hor); grd.addColorStop(1, '#2a6f86');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  // sun (equirect: u = atan2(dir.z, dir.x), v = acos(dir.y))
  const [sx, sy, sz] = w.sunDir, l = Math.hypot(sx, sy, sz);
  const u = (0.5 + Math.atan2(sz / l, sx / l) / (2 * Math.PI)) * W, v = (Math.acos(sy / l) / Math.PI) * H;
  const sg = g.createRadialGradient(u, v, 0, u, v, 18);
  sg.addColorStop(0, 'rgba(255,250,230,1)'); sg.addColorStop(1, 'rgba(255,250,230,0)');
  g.fillStyle = sg; g.fillRect(0, 0, W, H);
  const env = new THREE.CanvasTexture(c);
  env.mapping = THREE.EquirectangularReflectionMapping;
  env.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshStandardMaterial({ color, envMap: env, envMapIntensity: w.reflect ?? 0.5, roughness: w.roughness, metalness: 0.0, transparent: true, opacity: w.opacity });
  const time = { value: 0 };
  m.userData.time = time;
  const C3 = (h) => { const c = new THREE.Color(h); return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`; };
  const f = (v) => (+v).toFixed(4);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform float uTime;\nfloat vFoam;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float dr = length(vWPos.xz) - ${f(R)};                       // metres out from the shoreline
          float dd = clamp(dr / ${f(w.deepDist)}, 0.0, 1.0);
          diffuseColor.rgb = mix(${C3(w.shallow)}, ${C3(w.deep)}, smoothstep(0.0, 1.0, sqrt(dd)));
          diffuseColor.a = mix(${f(w.shoreAlpha)}, ${f(w.opacity)}, smoothstep(0.0, 0.35, dd));
          // shoreline foam: a broken, sliding band at the waterline + a second fainter wave line further out
          float ang = atan(vWPos.z, vWPos.x);
          float n = sin(ang * 37.0 + uTime * 0.7) * 0.5 + sin(ang * 91.0 - uTime * 1.3) * 0.3 + sin(ang * 13.0 + uTime * 0.4) * 0.2;
          float lap = sin(uTime * 1.1) * 0.35;
          float band = 1.0 - smoothstep(0.0, ${f(w.foamWidth)} * (0.75 + 0.25 * n), abs(dr - lap + 0.2));
          float wave2 = (1.0 - smoothstep(0.0, 0.35, abs(dr - 2.6 - sin(uTime * 0.8 + ang * 3.0) * 0.6))) * (0.5 + 0.5 * n);
          vFoam = clamp(band * (0.65 + 0.35 * n) + wave2 * 0.35, 0.0, 1.0) * ${f(w.foam)};
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.97, 0.99, 1.0), vFoam);
          diffuseColor.a = max(diffuseColor.a, vFoam);
        }`)
      .replace('#include <opaque_fragment>', `{
          vec3 V = normalize(vViewPosition);
          float fr = pow(1.0 - clamp(dot(normal, V), 0.0, 1.0), 4.0) * ${f(w.fresnel)} * (1.0 - vFoam);
          outgoingLight = mix(outgoingLight, ${C3(w.skyHorizon)} * 1.15, fr);
          diffuseColor.a = max(diffuseColor.a, fr);
        }
        #include <opaque_fragment>`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float t = uTime * ${w.shimmerSpeed.toFixed(3)};
          vec2 p = vWPos.xz;
          vec2 d = vec2(sin(p.x * 1.7 + t * 1.3) + sin(p.y * 2.3 - t * 1.7) * 0.7 + sin((p.x + p.y) * 4.1 + t * 2.9) * 0.35,
                        cos(p.y * 1.9 + t * 1.1) + cos(p.x * 2.7 + t * 1.5) * 0.7 + cos((p.x - p.y) * 3.7 - t * 2.3) * 0.35);
          d += vec2(sin(p.x * 7.3 - p.y * 5.1 + t * 3.7), cos(p.y * 6.7 + p.x * 4.3 - t * 3.1)) * 0.25;
          vec3 nW = normalize(vec3(d.x * ${w.shimmer.toFixed(3)}, 1.0, d.y * ${w.shimmer.toFixed(3)}));
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }`);
  };
  return m;
}

export function buildIsland(scene, cfg, assets, renderer, opt = {}) {
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
  const water = new THREE.Mesh(wgeo, opt.waterFx ? reflectWater(cfg.colors.water, opt.waterFx, R) : new THREE.MeshStandardMaterial({ color: cfg.colors.water, transparent: true, opacity: 0.82, roughness: 0.25, metalness: 0.1 }));
  water.position.y = cfg.waterLevel;
  scene.add(water);
  const foam = new THREE.Mesh(new THREE.RingGeometry(R - 0.5, R + 0.7, 96, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
  foam.visible = !opt.waterFx;   // 'reflect' water draws its own shader foam
  foam.rotation.x = -Math.PI / 2;
  foam.position.y = cfg.waterLevel + 0.03;
  scene.add(foam);

  // ── Props (seeded, instanced) ──
  const colliders = [], bushes = [], placed = [];
  const start = [0, R * cfg.startFrac];
  const clear = (cfg.clearings || []).map((c) => ({ x: c.x * R, z: c.z * R, r: c.r * R }));
  const paths = (cfg.paths || []).map((p) => ({ ax: p.from[0] * R, az: p.from[1] * R, bx: p.to[0] * R, bz: p.to[1] * R, w: p.w }));
  /** Inside a clearing or on a path (no palms / bushes there). */
  function isOpen(x, z) {
    if (clear.some((c) => Math.hypot(x - c.x, z - c.z) < c.r)) return true;
    for (const p of paths) {
      const dx = p.bx - p.ax, dz = p.bz - p.az, L2 = dx * dx + dz * dz || 1;
      const u = Math.max(0, Math.min(1, ((x - p.ax) * dx + (z - p.az) * dz) / L2));
      if (Math.hypot(x - p.ax - dx * u, z - p.az - dz * u) < p.w * 0.5 + 0.6) return true;
    }
    return false;
  }
  function sample(weightFn, minGap, tries = 40, open = false) {
    for (let n = 0; n < tries; n++) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * (R - 1.2);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (rand() > weightFn(r / R)) continue;
      if (!open && isOpen(x, z)) continue;
      if (Math.hypot(x - start[0], z - start[1]) < cfg.startClear) continue;
      if ((cfg.keepClear || []).some((k) => Math.hypot(x - k[0], z - k[1]) < k[2])) continue;
      if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < minGap + p.gap)) continue;
      return [x, z];
    }
    return null;
  }
  const area = Math.PI * R * R;
  // ── Wind sway: vertex shader bend (height-weighted, per-instance phase from the instance position) ──
  const windTime = { value: 0 };
  const W = cfg.wind || { strength: 0 };
  function addWind(mat, strength, height) {
    if (!(strength > 0)) return;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uWindT = windTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWindT;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          #else
            vec3 ip = vec3(0.0);
          #endif
          float hw = clamp(transformed.y / ${height.toFixed(3)}, 0.0, 1.0); hw *= hw;
          float ph = ip.x * 0.37 + ip.z * 0.53;
          float t = uWindT * ${(+W.speed).toFixed(3)};
          float g = 1.0 + ${(+W.gust).toFixed(3)} * sin(t * 0.23 + ip.x * 0.05);
          float a = ${strength.toFixed(3)} * hw * g;
          transformed.x += (sin(t + ph) * 0.8 + sin(t * 2.3 + ph * 1.7) * 0.2) * a;
          transformed.z += cos(t * 0.8 + ph * 1.3) * a * 0.5;
        }`);
    };
    mat.customProgramCacheKey = () => 'wind' + strength + '_' + height;
  }
  function scatter(asset, count, weightFn, gap, sMin, sMax, tilt, wind = null) {
    const def = asset.build(), mats = [];
    if (wind) for (const part of def.parts) addWind(part.material, wind.strength, wind.height);
    let n = 0;
    for (let i = 0; i < count; i++) {
      const s = sample(weightFn, gap, 40, !wind); if (!s) continue;
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
      im.castShadow = (!!part.castShadow || !!cfg.look) && cfg.propShadows;
      im.receiveShadow = true;
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      scene.add(im);
    }
    return n;
  }
  const counts = {
    palms: scatter(assets.palm, Math.round(area * cfg.palmDensity), (u) => (u < cfg.beachFrac * 0.85 ? 1 : 0.35), 2.4, 0.85, 1.25, 0.12, { strength: W.strength || 0, height: 3.8 }),
    rocks: scatter(assets.rock, Math.round(area * cfg.rockDensity), () => 1, 2.2, 0.8, 1.7, 0.4),
    bushes: scatter(assets.bush, Math.round(area * cfg.bushDensity), (u) => (u < cfg.beachFrac * 0.9 ? 1 : 0.15), 1.6, 0.8, 1.4, 0.1, { strength: W.bushStrength || 0, height: 1.3 }),
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
    if (water.material.userData.time) water.material.userData.time.value = t;
    windTime.value = t;
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

  return { R, wadeR, beachIn, windTime, wind: W, isOpen, start, heightAt, onLand, colliders, bushes, randomSpot, update, counts, terrain, water };
}
