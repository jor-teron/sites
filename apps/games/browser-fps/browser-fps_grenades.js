/**
 * Browser FPS — thrown grenades: arcing physics, bounces off floor/walls/cover, fuse, explosion FX, radial damage.
 *
 * createGrenades(scene, cfg, model, hooks):
 *   cfg   = CONFIG.grenades;  model = grenade asset ({ build() -> Group })
 *   hooks = { solids(): AABB colliders [{min,max}],  onExplode(pos) }
 * Returns { throwFrom(origin, dir, inheritVel), update(dt), reset(), live, blasts }.
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

  function throwFrom(origin, dir, inherit) {
    const mesh = model.build();
    const vel = dir.clone().multiplyScalar(cfg.throwSpeed);
    vel.y += cfg.throwUp;
    if (inherit) { vel.x += inherit.x * 0.5; vel.z += inherit.z * 0.5; }
    const g = { mesh, pos: origin.clone(), vel, t: 0, spin: new THREE.Vector3(Math.random() * 8 - 4, Math.random() * 4, 6 + Math.random() * 4) };
    mesh.position.copy(g.pos);
    scene.add(mesh);
    live.push(g);
    return g;
  }

  /** Move one axis, bounce if it ends inside a solid box. */
  function moveAxis(g, axis, d, solids) {
    const r = cfg.radius;
    g.pos[axis] += d;
    for (const c of solids) {
      if (g.pos.x + r <= c.min.x || g.pos.x - r >= c.max.x || g.pos.y + r <= c.min.y || g.pos.y - r >= c.max.y ||
          g.pos.z + r <= c.min.z || g.pos.z - r >= c.max.z) continue;
      g.pos[axis] = d > 0 ? c.min[axis] - r - 1e-4 : c.max[axis] + r + 1e-4;
      if (Math.abs(g.vel[axis]) > 1.2 && hooks.onBounce) hooks.onBounce(g.pos);
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
      g.t += dt;
      // substeps so a fast grenade can't tunnel through thin walls
      const n = Math.max(1, Math.ceil(g.vel.length() * dt / (cfg.radius * 1.5)));
      const h = dt / n;
      for (let k = 0; k < n; k++) {
        g.vel.y -= cfg.gravity * h;
        moveAxis(g, 'x', g.vel.x * h, solids);
        moveAxis(g, 'z', g.vel.z * h, solids);
        moveAxis(g, 'y', g.vel.y * h, solids);
        if (g.pos.y < cfg.radius) { if (g.vel.y < -1.2 && hooks.onBounce) hooks.onBounce(g.pos); g.pos.y = cfg.radius; g.vel.y = Math.abs(g.vel.y) * cfg.bounce; g.vel.x *= cfg.friction; g.vel.z *= cfg.friction; if (g.vel.y < 0.6) g.vel.y = 0; }
      }
      g.mesh.position.copy(g.pos);
      g.mesh.rotation.x += g.spin.x * dt; g.mesh.rotation.y += g.spin.y * dt; g.mesh.rotation.z += g.spin.z * dt;
      if (g.t >= cfg.fuse) { live.splice(i, 1); explode(g); }
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

  return { throwFrom, update, reset, falloff, live, blasts };
}
