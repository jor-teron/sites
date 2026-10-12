/**
 * Browser FPS — pickups (medkits, grenade crates: any model with build() -> { root, kit, glow }).
 *
 * createPickups(scene, cfg, hooks):
 *   cfg   = CONFIG.pickups
 *   hooks = { randomSpot(): [x, z] | null,  canPick(): bool,  onPick(amount) }
 * Returns { update(dt, playerPos), reset(), items }.
 *
 * model = medkit asset module ({ build() -> { root, kit, glow } }), default assets/pickups/medkit_basic.js.
 * Gentle bob + spin, glow pulse, blinks before it despawns. Meshes are pooled.
 */
import medkitBasic from './assets/pickups/medkit_basic.js';

export function createPickups(scene, cfg, hooks, model = medkitBasic) {
  const pool = [];
  const items = [];   // active: { mesh, x, z, age }
  let timer = cfg.firstDelay;

  function spawn() {
    if (items.length >= cfg.maxOnMap) return null;
    const spot = hooks.randomSpot();
    if (!spot) return null;
    const mesh = pool.pop() || model.build();
    mesh.root.position.set(spot[0], 0, spot[1]);
    mesh.root.visible = true;
    scene.add(mesh.root);
    const it = { mesh, x: spot[0], z: spot[1], age: 0, phase: Math.random() * 6.28 };
    items.push(it);
    return it;
  }

  function remove(i) {
    const it = items[i];
    scene.remove(it.mesh.root);
    pool.push(it.mesh);
    items.splice(i, 1);
  }

  function update(dt, playerPos, playerFeetY) {
    timer -= dt;
    if (timer <= 0) {
      timer += cfg.interval;
      spawn();
    }
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.age += dt;
      const t = it.age + it.phase;
      it.mesh.kit.position.y = cfg.hoverY + Math.sin(t * 2.2) * cfg.bobAmp;
      it.mesh.kit.rotation.y += cfg.spinSpeed * dt;
      if (it.mesh.glow) it.mesh.glow.material.opacity = 0.55 + Math.sin(t * 3) * 0.2;   // shared material: gentle pulse
      // blink in the last few seconds
      const left = cfg.lifetime - it.age;
      it.mesh.root.visible = left > cfg.blinkTime || Math.floor(it.age * cfg.blinkHz * 2) % 2 === 0;
      if (left <= 0) { remove(i); continue; }
      // pickup: walk over it (feet near the floor), only if it would heal
      const d = Math.hypot(playerPos.x - it.x, playerPos.z - it.z);
      if (d < cfg.pickRadius && playerFeetY < 1.2 && hooks.canPick()) {
        hooks.onPick(cfg.amount ?? cfg.heal);
        remove(i);
      }
    }
  }

  function reset() {
    while (items.length) remove(items.length - 1);
    timer = cfg.firstDelay;
  }

  return { update, reset, spawn, items, get timer() { return timer; } };
}
