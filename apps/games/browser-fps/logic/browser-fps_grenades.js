/**
 * Browser FPS — thrown grenades: arcing physics, bounces off floor/walls/cover, fuse, explosion FX, radial damage.
 *
 * createGrenades(scene, cfg, model, hooks):
 *   cfg   = CONFIG.grenades;  model = grenade asset ({ build() -> Group })
 *   hooks = { solids(): AABB colliders [{min,max}],  onExplode(pos),  onBounce(pos),  groundAt(x, z) (floor height, default 0) }
 * Returns { throwFrom(origin, dir, inheritVel), predict(origin, dir, inheritVel, outF32, maxPts, restVec3) -> n, update(dt), reset(), live, blasts }.
 * Physics runs at a fixed step (cfg.simStep) so predict() follows exactly the same path as a live throw.
 */
import * as THREE from 'three';

function fireTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,220,1)');
  grd.addColorStop(0.25, 'rgba(255,200,80,0.95)');
  grd.addColorStop(0.6, 'rgba(230,90,20,0.6)');
  grd.addColorStop(1, 'rgba(80,30,10,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function createGrenades(scene, cfg, model, hooks) {
  const live = [];     // { mesh, pos, vel, t }
  const blasts = [];   // { sprite, smoke, light, t }
  const FIRE = fireTexture();
  const smokeGeo = new THREE.SphereGeometry(1, 16, 12);

  const STEP = cfg.simStep || 1 / 120;
  const FUSE_STEPS = Math.round(cfg.fuse / STEP);   // fixed physics step: live grenades and the aim preview run the identical sim

  /** Launch velocity for a throw (shared by throwFrom and predict so the preview matches). */
  function launchVel(dir, inherit, out) {
    out.copy(dir).multiplyScalar(cfg.throwSpeed);
    out.y += cfg.throwUp;
    if (inherit) { out.x += inherit.x * 0.5; out.z += inherit.z * 0.5; }
    return out;
  }

  function throwFrom(origin, dir, inherit) {
    const mesh = model.build();
    const vel = launchVel(dir, inherit, new THREE.Vector3());
    const g = { mesh, pos: origin.clone(), vel, t: 0, acc: 0, k: 0, spin: new THREE.Vector3(Math.random() * 8 - 4, Math.random() * 4, 6 + Math.random() * 4) };
    mesh.position.copy(g.pos);
    scene.add(mesh);
    live.push(g);
    return g;
  }

  /** Move one axis, bounce if it ends inside a solid box. */
  function moveAxis(g, axis, d, solids, onBounce) {
    const r = cfg.radius;
    g.pos[axis] += d;
    for (const c of solids) {
      if (g.pos.x + r <= c.min.x || g.pos.x - r >= c.max.x || g.pos.y + r <= c.min.y || g.pos.y - r >= c.max.y ||
          g.pos.z + r <= c.min.z || g.pos.z - r >= c.max.z) continue;
      g.pos[axis] = d > 0 ? c.min[axis] - r - 1e-4 : c.max[axis] + r + 1e-4;
      if (Math.abs(g.vel[axis]) > 1.2 && onBounce) onBounce(g.pos);
      g.vel[axis] = -g.vel[axis] * cfg.bounce;
      if (axis === 'y' && d < 0) {          // landed on top: rolling friction
        g.vel.x *= cfg.friction; g.vel.z *= cfg.friction;
        if (Math.abs(g.vel.y) < 0.6) g.vel.y = 0;
        g.spin.multiplyScalar(0.6);
      } else g.spin.multiplyScalar(0.8);
      return true;
    }
    return false;
  }

  /** One fixed physics step (gravity, axis-separated box bounces, terrain bounce). */
  function stepBody(g, dt, solids, onBounce) {
    // substeps so a fast grenade can't tunnel through thin walls
    const n = Math.max(1, Math.ceil(g.vel.length() * dt / (cfg.radius * 1.5)));
    const h = dt / n;
    for (let k = 0; k < n; k++) {
      g.vel.y -= cfg.gravity * h;
      moveAxis(g, 'x', g.vel.x * h, solids, onBounce);
      moveAxis(g, 'z', g.vel.z * h, solids, onBounce);
      moveAxis(g, 'y', g.vel.y * h, solids, onBounce);
      const gy = hooks.groundAt ? hooks.groundAt(g.pos.x, g.pos.z) : 0;
      if (g.pos.y < gy + cfg.radius) { if (g.vel.y < -1.2 && onBounce) onBounce(g.pos); g.pos.y = gy + cfg.radius; g.vel.y = Math.abs(g.vel.y) * cfg.bounce; g.vel.x *= cfg.friction; g.vel.z *= cfg.friction; if (g.vel.y < 0.6) g.vel.y = 0; }
    }
  }

  // Preview body (preallocated, reused every frame)
  const pb = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), spin: new THREE.Vector3() };
  /**
   * Predict a throw with the exact live sim. Writes up to maxPts xyz triples into out (Float32Array),
   * sampling every `every` steps until the fuse; rest receives the detonation point. Returns the point count.
   */
  function predict(origin, dir, inherit, out, maxPts, rest, solids = hooks.solids()) {
    pb.pos.copy(origin); launchVel(dir, inherit, pb.vel); pb.spin.set(0, 0, 0);
    const steps = FUSE_STEPS;
    const every = Math.max(1, Math.ceil(steps / Math.max(1, maxPts - 1)));
    let n = 0;
    for (let i = 0; i <= steps; i++) {
      if (i % every === 0 && n < maxPts) { out[n * 3] = pb.pos.x; out[n * 3 + 1] = pb.pos.y; out[n * 3 + 2] = pb.pos.z; n++; }
      if (i < steps) stepBody(pb, STEP, solids, null);
    }
    rest.copy(pb.pos);
    return n;
  }

  function explode(g) {
    const p = g.pos.clone();
    scene.remove(g.mesh);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: FIRE, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sprite.position.copy(p).setY(Math.max(p.y, 0.6));
    scene.add(sprite);
    const smoke = new THREE.Mesh(smokeGeo, new THREE.MeshBasicMaterial({ color: 0x4a4038, transparent: true, opacity: 0.55, depthWrite: false }));
    smoke.position.copy(sprite.position);
    scene.add(smoke);
    const light = new THREE.PointLight(0xffaa44, 40, cfg.blastRadius * 3, 2);
    light.position.copy(sprite.position);
    scene.add(light);
    blasts.push({ sprite, smoke, light, t: 0 });
    hooks.onExplode(p);
  }

  function update(dt) {
    const solids = hooks.solids();
    for (let i = live.length - 1; i >= 0; i--) {
      const g = live[i];
      g.acc += dt;
      while (g.acc >= STEP && g.k < FUSE_STEPS) { g.acc -= STEP; g.k++; stepBody(g, STEP, solids, hooks.onBounce); }
      g.t = g.k * STEP;
      g.mesh.position.copy(g.pos);
      g.mesh.rotation.x += g.spin.x * dt; g.mesh.rotation.y += g.spin.y * dt; g.mesh.rotation.z += g.spin.z * dt;
      if (g.k >= FUSE_STEPS) { live.splice(i, 1); explode(g); }
    }
    for (let i = blasts.length - 1; i >= 0; i--) {
      const b = blasts[i];
      b.t += dt;
      const u = b.t / cfg.fxTime;
      const s = cfg.blastRadius * (0.5 + 1.1 * Math.min(1, u * 2.5));
      b.sprite.scale.set(s * 1.6, s * 1.6, 1);
      b.sprite.material.opacity = Math.max(0, 1 - u * 1.4);
      b.smoke.scale.setScalar(cfg.blastRadius * (0.3 + 0.7 * Math.min(1, u * 1.5)));
      b.smoke.material.opacity = 0.55 * Math.max(0, 1 - u);
      b.smoke.position.y += dt * 0.8;
      b.light.intensity = 40 * Math.max(0, 1 - u * 2);
      if (u >= 1) {
        scene.remove(b.sprite, b.smoke, b.light);
        b.sprite.material.dispose(); b.smoke.material.dispose(); b.light.dispose();
        blasts.splice(i, 1);
      }
    }
  }

  function reset() {
    for (const g of live) scene.remove(g.mesh);
    live.length = 0;
    for (const b of blasts) scene.remove(b.sprite, b.smoke, b.light);
    blasts.length = 0;
  }

  /** Damage multiplier 0..1 for a point at distance d from the blast. */
  function falloff(d) {
    if (d >= cfg.blastRadius) return 0;
    if (d <= cfg.fullRadius) return 1;
    return 1 - (d - cfg.fullRadius) / (cfg.blastRadius - cfg.fullRadius);
  }

  return { throwFrom, predict, update, reset, falloff, live, blasts };
}
