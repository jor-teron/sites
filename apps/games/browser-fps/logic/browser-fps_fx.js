/**
 * Browser FPS — effects: pooled particles (impacts, hit puffs, muzzle smoke), bullet marks, enemy muzzle lights.
 *
 * createFx(scene, cfg) with cfg = resolved CONFIG.fx (quality preset already merged). Returns {
 *   impact(point, normal, surface, dir)   surface: 'sand' | 'dirt' | 'grass' | 'rock' | 'concrete' | 'brick' | 'wood'
 *   enemyHit(point, dir, head)            small non-gore puff (headshot: brighter, with a quick spark ring)
 *   muzzleSmoke(point, dir)               wisp at the player's / an enemy's barrel
 *   enemyFlash(point)                     brief point light at an enemy muzzle (pooled lights, never added/removed)
 *   update(dt), reset(), stats() }
 * Everything is allocated once: one THREE.Points buffer (ring of cfg.maxParticles), a ring of cfg.maxDecals marks,
 * cfg.enemyLights point lights kept in the scene at intensity 0 (no shader recompiles).
 */
import * as THREE from 'three';

function softDot() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'), grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.45, 'rgba(255,255,255,0.7)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export function createFx(scene, cfg) {
  const N = cfg.maxParticles;
  // ── particle pool (struct-of-arrays) ──
  const P = {
    pos: new Float32Array(N * 3), vel: new Float32Array(N * 3), col: new Float32Array(N * 3),
    size: new Float32Array(N), alpha: new Float32Array(N), life: new Float32Array(N), max: new Float32Array(N),
    grav: new Float32Array(N), drag: new Float32Array(N), grow: new Float32Array(N), size0: new Float32Array(N), a0: new Float32Array(N),
  };
  let head = 0, alive = 0;
  const geo = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(P.pos, 3).setUsage(THREE.DynamicDrawUsage);
  const aCol = new THREE.BufferAttribute(P.col, 3).setUsage(THREE.DynamicDrawUsage);
  const aSize = new THREE.BufferAttribute(P.size, 1).setUsage(THREE.DynamicDrawUsage);
  const aAlpha = new THREE.BufferAttribute(P.alpha, 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', aPos); geo.setAttribute('color', aCol); geo.setAttribute('size', aSize); geo.setAttribute('alpha', aAlpha);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: softDot() }, scale: { value: window.innerHeight * 0.5 } },
    vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA;
      uniform float scale;
      void main() { vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = alpha > 0.0 ? size * scale / -mv.z : 0.0; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA;
      void main() { vec4 t = texture2D(map, gl_PointCoord); if (t.a * vA < 0.02) discard; gl_FragColor = vec4(vC, t.a * vA); }`,
    transparent: true, depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 2;
  scene.add(points);
  window.addEventListener('resize', () => { mat.uniforms.scale.value = window.innerHeight * 0.5; });

  const tmpC = new THREE.Color();
  /** Emit one particle into the ring (oldest overwritten when full). */
  function emit(x, y, z, vx, vy, vz, color, size, life, grav, drag, grow, a = 1) {
    const i = head; head = (head + 1) % N;
    if (P.life[i] <= 0) alive++;
    P.pos[i * 3] = x; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z;
    P.vel[i * 3] = vx; P.vel[i * 3 + 1] = vy; P.vel[i * 3 + 2] = vz;
    tmpC.setHex(color); P.col[i * 3] = tmpC.r; P.col[i * 3 + 1] = tmpC.g; P.col[i * 3 + 2] = tmpC.b;
    P.size0[i] = P.size[i] = size; P.life[i] = P.max[i] = life; P.grav[i] = grav; P.drag[i] = drag; P.grow[i] = grow;
    P.a0[i] = P.alpha[i] = a;
  }
  const rnd = (a) => (Math.random() * 2 - 1) * a;
  /** Burst of n particles from p, spraying around normal nrm. */
  function burst(p, nrm, n, s) {
    n = Math.max(1, Math.round(n * cfg.particleMult));
    for (let k = 0; k < n; k++) {
      const sp = s.speed * (0.5 + Math.random() * 0.8);
      const vx = (nrm.x + rnd(s.spread)) * sp, vy = (nrm.y + rnd(s.spread) + (s.up || 0)) * sp, vz = (nrm.z + rnd(s.spread)) * sp;
      const col = s.colors[(Math.random() * s.colors.length) | 0];
      emit(p.x + nrm.x * 0.03, p.y + nrm.y * 0.03, p.z + nrm.z * 0.03, vx, vy, vz, col,
        s.size * (0.7 + Math.random() * 0.6), s.life * (0.7 + Math.random() * 0.6), s.gravity, s.drag, s.grow || 0, s.alpha ?? 1);
    }
  }

  // ── bullet marks (ring of small dark quads, shared geometry, per-mark material for fading) ──
  const decals = [];
  const dGeo = new THREE.CircleGeometry(cfg.decalSize, 8);
  for (let i = 0; i < cfg.maxDecals; i++) {
    const m = new THREE.Mesh(dGeo, new THREE.MeshBasicMaterial({ color: 0x1a1612, transparent: true, opacity: 0, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    m.visible = false; m.renderOrder = 1;
    scene.add(m);
    decals.push({ m, t: 0 });
  }
  let dHead = 0;
  const lookTmp = new THREE.Vector3();
  function mark(p, nrm, color, opacity) {
    if (!decals.length) return;
    const d = decals[dHead]; dHead = (dHead + 1) % decals.length;
    d.m.position.copy(p).addScaledVector(nrm, 0.01);
    d.m.lookAt(lookTmp.copy(d.m.position).add(nrm));
    d.m.rotation.z = Math.random() * 6.28;
    d.m.material.color.setHex(color); d.m.material.opacity = opacity; d.m.userData.o = opacity;
    d.m.scale.setScalar(0.7 + Math.random() * 0.6);
    d.m.visible = true; d.t = cfg.decalLife;
  }

  // ── enemy muzzle lights (pool, always in the scene) ──
  const lights = [];
  for (let i = 0; i < cfg.enemyLights; i++) { const l = new THREE.PointLight(cfg.enemyFlashColor, 0, cfg.enemyFlashRange, 2); scene.add(l); lights.push({ l, t: 0 }); }
  let lHead = 0;

  const S = cfg.surfaces;
  const counts = {};   // effects spawned per kind (debug / tests)
  function impact(p, nrm, surface, dir) {
    const s = S[surface] || S.dirt;
    counts[surface] = (counts[surface] || 0) + 1; api.lastImpact = surface;
    for (const layer of s.layers) burst(p, nrm, layer.count, layer);
    if (s.mark) mark(p, nrm, s.mark.color, s.mark.opacity);
  }
  const back = new THREE.Vector3();
  function enemyHit(p, dir, head) {
    back.copy(dir).multiplyScalar(-1);
    const h = head ? cfg.hit.head : cfg.hit.body;
    counts[head ? 'hitHead' : 'hitBody'] = (counts[head ? 'hitHead' : 'hitBody'] || 0) + 1;
    for (const layer of h) burst(p, back, layer.count, layer);
  }
  function muzzleSmoke(p, dir) { burst(p, dir, cfg.muzzleSmoke.count, cfg.muzzleSmoke); }
  function enemyFlash(p) {
    if (!lights.length) return;
    const L = lights[lHead]; lHead = (lHead + 1) % lights.length;
    L.l.position.copy(p); L.l.intensity = cfg.enemyFlashIntensity; L.t = cfg.enemyFlashTime;
  }

  function update(dt) {
    let live = 0;
    for (let i = 0; i < N; i++) {
      if (P.life[i] <= 0) continue;
      P.life[i] -= dt;
      if (P.life[i] <= 0) { P.alpha[i] = 0; continue; }
      live++;
      const k = i * 3, dr = Math.max(0, 1 - P.drag[i] * dt);
      P.vel[k] *= dr; P.vel[k + 1] = P.vel[k + 1] * dr - P.grav[i] * dt; P.vel[k + 2] *= dr;
      P.pos[k] += P.vel[k] * dt; P.pos[k + 1] += P.vel[k + 1] * dt; P.pos[k + 2] += P.vel[k + 2] * dt;
      const u = 1 - P.life[i] / P.max[i];
      P.size[i] = P.size0[i] * (1 + P.grow[i] * u);
      P.alpha[i] = P.a0[i] * (u < 0.15 ? 1 : 1 - (u - 0.15) / 0.85);
    }
    alive = live;
    aPos.needsUpdate = aSize.needsUpdate = aAlpha.needsUpdate = aCol.needsUpdate = true;
    for (const d of decals) {
      if (d.t <= 0) continue;
      d.t -= dt;
      if (d.t <= 0) d.m.visible = false;
      else if (d.t < 1.5) d.m.material.opacity = d.m.userData.o * d.t / 1.5;
    }
    for (const L of lights) if (L.t > 0) { L.t -= dt; if (L.t <= 0) L.l.intensity = 0; }
  }
  function reset() {
    P.life.fill(0); P.alpha.fill(0); alive = 0;
    for (const d of decals) { d.t = 0; d.m.visible = false; }
    for (const L of lights) { L.t = 0; L.l.intensity = 0; }
  }
  const stats = () => ({ particles: alive, particleCap: N, decals: decals.filter((d) => d.t > 0).length, decalCap: decals.length, lights: lights.length });
  const api = { impact, enemyHit, muzzleSmoke, enemyFlash, update, reset, stats, points, counts, lastImpact: null };
  return api;
}
