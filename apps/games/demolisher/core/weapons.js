/*
  File: core/weapons.js
  Project: Demolisher
  Purpose: Weapon state, aiming, firing, projectiles and their flight.
  Plain script (no modules): top-level const / let / function share one global scope with the
  other core/*.js files, loaded in the order listed in demolisher.html.
  Uses: state.js, terrain.js, physics.js.
*/

'use strict';

/* ============================================================
   WEAPONS
   ============================================================ */

/* Active weapon id. */
let currentWeapon = 'pistol';
/* Remaining shots. Pistol stays Infinity. */
let ammoRemaining = startAmmo();
/* Live shots. */
const projectiles = [];
/* Expanding blasts. flash true is a muzzle pop. */
const explosions = [];
/* Short-lived sparks and debris. */
const particles = [];
/* Rising numbers. */
const floaters = [];
/* Aim radians. 0 is right. */
let aimAngle = 0;
/* Last mouse position in canvas CSS pixels. */
let mouseScreenPos = { x: 0, y: 0 };
/* True while primary button is down. */
let mouseDown = false;
/* True after the mouse has moved, so aim is not stuck at origin. */
let mouseAimReady = false;
/* Aim source: 'facing' (keys / no mouse: aimRel relative to facing), 'mouse',
   'touch' (aim stick), 'stick' (hub analog stick). */
let aimMode = 'facing';
/* Facing-relative aim elevation in radians (+ = up). Q / E change it. */
let aimRel = 0;
/* Hub analog stick (from hub-stick messages). */
let hubStick = { x: 0, y: 0 };
/* Space (fire key) held. */
let fireKeyHeld = false;
/* Touch fire held. */
let fireHeld = false;

/*
  Convert a canvas CSS point to world pixels.
*/
function screenToWorld(sx, sy) {
  return { x: sx + camX, y: sy + camY };
}

/*
  Turn an absolute aim angle into facing + elevation, so the aim keeps its tilt
  and flips with the player (used when a stick is released).
*/
function absorbAim(angle) {
  if (!player) return;
  const cx = Math.cos(angle), sy = Math.sin(angle);
  player.facing = cx >= 0 ? 1 : -1;
  aimRel = Math.max(-CFG.aim.maxDown, Math.min(CFG.aim.maxUp, Math.atan2(-sy, Math.abs(cx))));
  aimMode = 'facing';
}

/*
  Update aimAngle from the current source: Q / E (relative to facing), hub
  stick, touch stick, or the mouse.
*/
function updateAim(dt) {
  if (!player) return;
  const up = held('aimUp'), down = held('aimDown');
  if (up || down) {
    if (aimMode !== 'facing') absorbAim(aimAngle);
    aimRel += (up ? 1 : -1) * CFG.aim.keyRate * dt;
    aimRel = Math.max(-CFG.aim.maxDown, Math.min(CFG.aim.maxUp, aimRel));
  }
  const sm = Math.hypot(hubStick.x, hubStick.y);
  if (sm > CFG.aim.stickDead) {
    aimMode = 'stick';
    aimAngle = Math.atan2(hubStick.y, hubStick.x);
    return;
  } else if (aimMode === 'stick') {
    absorbAim(aimAngle);
  }
  if (aimMode === 'touch') return;          // set by the aim stick handler
  if (aimMode === 'mouse' && mouseAimReady) {
    const w = screenToWorld(mouseScreenPos.x, mouseScreenPos.y);
    aimAngle = Math.atan2(w.y - (player.body.position.y - 4), w.x - player.body.position.x);
    return;
  }
  aimAngle = player.facing > 0 ? -aimRel : Math.PI + aimRel;
}

/*
  Spawn a projectile if cooldown and ammo allow.
*/
function fire() {
  if (!player || gameState !== 'playing') return;
  if (player.fireCooldown > 0) return;
  const w = WEAPONS[currentWeapon];
  if (ammoRemaining[currentWeapon] <= 0) {
    player.fireCooldown = 0.4;
    showHint(TX.noAmmo, 700);
    hubRumble(RUMBLE.outOfAmmo);
    return;
  }
  player.fireCooldown = w.cooldown;
  player.shots = (player.shots || 0) + 1;   // animation only: counts real shots
  if (ammoRemaining[currentWeapon] !== Infinity) {
    ammoRemaining[currentWeapon]--;
    updateAmmoUI();
  }
  const angle = aimAngle;
  const ox = player.body.position.x + Math.cos(angle) * 22;
  const oy = player.body.position.y - 4 + Math.sin(angle) * 22;
  projectiles.push({
    x: ox,
    y: oy,
    vx: Math.cos(angle) * w.speed,
    vy: Math.sin(angle) * w.speed,
    weapon: w,
    life: w.fuse,
    trail: []
  });
  for (let i = 0; i < 5; i++) {
    const a = angle + (Math.random() - 0.5) * 0.8;
    particles.push({
      x: ox, y: oy,
      vx: Math.cos(a) * (80 + Math.random() * 140),
      vy: Math.sin(a) * (80 + Math.random() * 140),
      life: 0.25, maxLife: 0.25, size: 2, color: w.color, gravity: 0
    });
  }
  explosions.push({ x: ox, y: oy, r: 8, life: 0.06, maxLife: 0.06, flash: true });
  Body.setVelocity(player.body, {
    x: player.body.velocity.x - Math.cos(angle) * 1.2,
    y: player.body.velocity.y - Math.sin(angle) * 0.4
  });
}

/*
  Step shots in substeps. Speeds are pixels per second.
  Direct hits damage a tile, an enemy, or a target. Blasts call doExplosion.
*/
function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;
    if (p.life <= 0) {
      if (p.weapon.explosion > 0) doExplosion(p.x, p.y, p.weapon.explosion, p.weapon.damage);
      projectiles.splice(i, 1);
      continue;
    }
    p.vy += p.weapon.gravity * dt;
    const speed = Math.hypot(p.vx, p.vy);
    const steps = Math.max(1, Math.ceil((speed * dt) / 6));
    let hit = false;
    for (let s = 0; s < steps; s++) {
      p.x += (p.vx * dt) / steps;
      p.y += (p.vy * dt) / steps;
      const gx = Math.floor(p.x / TILE);
      const gy = Math.floor(p.y / TILE);
      if (isSolid(gx, gy)) {
        if (p.weapon.explosion > 0) doExplosion(p.x, p.y, p.weapon.explosion, p.weapon.damage);
        else {
          damageTile(gx, gy, p.weapon.damage);
          invalidateChunksAround(p.x, p.y);
          spark(p.x, p.y, p.weapon.color, 4);
        }
        hit = true;
        break;
      }
      for (const e of enemies) {
        if (!e.alive) continue;
        const dx = p.x - e.body.position.x;
        const dy = p.y - e.body.position.y;
        const rr = e.radius + p.weapon.radius;
        if (dx * dx + dy * dy < rr * rr) {
          if (p.weapon.explosion > 0) doExplosion(p.x, p.y, p.weapon.explosion, p.weapon.damage);
          else {
            e.hp -= p.weapon.damage;
            addFloater(e.body.position.x, e.body.position.y - 20, '-' + p.weapon.damage, '#FFD700');
            if (e.hp <= 0) killEnemy(e);
          }
          hit = true;
          break;
        }
      }
      if (hit) break;
      for (const t of targets) {
        if (t.destroyed) continue;
        const dx = p.x - t.x;
        const dy = p.y - t.y;
        if (dx * dx + dy * dy < (t.r + p.weapon.radius) * (t.r + p.weapon.radius)) {
          if (p.weapon.explosion > 0) doExplosion(p.x, p.y, p.weapon.explosion, p.weapon.damage);
          else damageTarget(t, p.weapon.damage);
          hit = true;
          break;
        }
      }
      if (hit) break;
    }
    if (hit) {
      projectiles.splice(i, 1);
      continue;
    }
    if (p.weapon.name !== 'pistol') {
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 8) p.trail.shift();
    }
  }
}

/*
  Small burst used by direct impacts.
*/
function spark(x, y, color, n) {
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2;
    particles.push({
      x, y,
      vx: Math.cos(a) * 90,
      vy: Math.sin(a) * 90,
      life: 0.25, maxLife: 0.25, size: 2, color, gravity: 0
    });
  }
}
