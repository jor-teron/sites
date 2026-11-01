/**
 * Browser FPS — the player: collision against the world, movement, look, scope, damage / death and restart.
 * installPlayer(S) registers updateMovement, updateScope, lookBy, sensNow, isDead, damagePlayer, restartGame,
 * syncCamera on the shared context (see browser-fps_world.js).
 */
import * as THREE from 'three';

export function installPlayer(S) {
  const { CFG, KEYS, SC, IS, ISLAND, ARENA, player, colliders, camera, vm, audio, groundAt } = S;
  const { hpVal, ammoVal, nadeVal, dmgFlash, deathEl, deathMsg, overlay, scopeOverlay, crosshairEl } = S;
  const PLAYER_HEIGHT = CFG.player.height;
  const PLAYER_RADIUS = CFG.player.radius;
  const MOVE_SPEED = CFG.player.moveSpeed;
  const SPRINT_MULT = CFG.player.sprintMult;
  const JUMP_VEL = CFG.player.jumpVel;
  const GRAVITY = CFG.player.gravity;
  const MOUSE_SENS = CFG.player.mouseSens;
  const MAX_HEALTH = CFG.player.maxHealth;
  const MAG_SIZE = CFG.weapon.magSize;
  const SCOPE = CFG.scope;
  const held = S.held;

  /** Scoping is blocked / cancelled while reloading. */
  const wantsAim = () => S.aimHeld && !player.reloading && !S.nadeAim.holding && !isDead();
  const sensNow = () => MOUSE_SENS * (1 + (SCOPE.sensMult - 1) * S.aimT);

  function lookBy(dx, dy) {
    S.yaw -= dx * sensNow();
    S.pitch -= dy * sensNow();
    const lim = Math.PI / 2 - CFG.player.pitchLimitPad;
    S.pitch = Math.max(-lim, Math.min(lim, S.pitch));
  }

  /** Smooth scope in/out: FOV zoom + viewmodel pose. */
  function updateScope(dt) {
    const target = wantsAim() ? 1 : 0;
    const step = dt / SCOPE.blendTime;
    S.aimT = target > S.aimT ? Math.min(target, S.aimT + step) : Math.max(target, S.aimT - step);
    const aimT = S.aimT;
    const fov = SC.fov / (1 + (SCOPE.zoom - 1) * aimT);
    if (Math.abs(camera.fov - fov) > 1e-4) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    vm.setAim(aimT);
    // Overlay fades in near the end of the raise; the gun is hidden once the scope is up
    const o = Math.max(0, Math.min(1, (aimT - SCOPE.overlayStart) / (1 - SCOPE.overlayStart)));
    scopeOverlay.style.opacity = o.toFixed(3);
    crosshairEl.style.opacity = (1 - o).toFixed(3);
    vm.root.visible = aimT < SCOPE.hideGunAt;
  }

  // ─── Collision helpers (AABB vs player capsule approximated as AABB) ──────
  const tmpMin = new THREE.Vector3();
  const tmpMax = new THREE.Vector3();

  function playerAABB(px, py, pz) {
    // Feet at py - PLAYER_HEIGHT, head at py; horizontal radius
    tmpMin.set(px - PLAYER_RADIUS, py - PLAYER_HEIGHT, pz - PLAYER_RADIUS);
    tmpMax.set(px + PLAYER_RADIUS, py, pz + PLAYER_RADIUS);
    return { min: tmpMin, max: tmpMax };
  }

  function aabbOverlap(a, b) {
    return (
      a.min.x < b.max.x && a.max.x > b.min.x &&
      a.min.y < b.max.y && a.max.y > b.min.y &&
      a.min.z < b.max.z && a.max.z > b.min.z
    );
  }

  /** Resolve player against world colliders; axis-separated sweep. */
  function collideWorld(pos, vel, dt) {
    // Horizontal X
    pos.x += vel.x * dt;
    let box = playerAABB(pos.x, pos.y, pos.z);
    for (const c of colliders) {
      if (c.disabled || !aabbOverlap(box, c)) continue;
      if (vel.x > 0) pos.x = c.min.x - PLAYER_RADIUS - 0.001;
      else if (vel.x < 0) pos.x = c.max.x + PLAYER_RADIUS + 0.001;
      vel.x = 0;
      box = playerAABB(pos.x, pos.y, pos.z);
    }

    // Horizontal Z
    pos.z += vel.z * dt;
    box = playerAABB(pos.x, pos.y, pos.z);
    for (const c of colliders) {
      if (c.disabled || !aabbOverlap(box, c)) continue;
      if (vel.z > 0) pos.z = c.min.z - PLAYER_RADIUS - 0.001;
      else if (vel.z < 0) pos.z = c.max.z + PLAYER_RADIUS + 0.001;
      vel.z = 0;
      box = playerAABB(pos.x, pos.y, pos.z);
    }

    // Vertical Y
    pos.y += vel.y * dt;
    player.onGround = false;
    box = playerAABB(pos.x, pos.y, pos.z);

    // Ground: floor at y=0 (camp) or the terrain (island); snap down small steps so slopes don't go airborne
    const gy = groundAt(pos.x, pos.z);
    const feet = pos.y - PLAYER_HEIGHT;
    if (feet < gy || (ISLAND && player.wasGround && vel.y <= 0 && feet - gy < 0.35)) {
      pos.y = gy + PLAYER_HEIGHT;
      vel.y = 0;
      player.onGround = true;
      box = playerAABB(pos.x, pos.y, pos.z);
    }

    for (const c of colliders) {
      if (c.disabled || !aabbOverlap(box, c)) continue;
      // Standing on top
      if (vel.y <= 0 && (pos.y - PLAYER_HEIGHT) < c.max.y && (pos.y - PLAYER_HEIGHT - vel.y * dt) >= c.max.y - 0.15) {
        pos.y = c.max.y + PLAYER_HEIGHT;
        vel.y = 0;
        player.onGround = true;
      } else if (vel.y > 0 && pos.y > c.min.y) {
        // Hit ceiling
        pos.y = c.min.y;
        vel.y = 0;
      } else {
        // Side push while overlapping vertically — nudge out on smaller penetration
        const penX = Math.min(box.max.x - c.min.x, c.max.x - box.min.x);
        const penZ = Math.min(box.max.z - c.min.z, c.max.z - box.min.z);
        if (penX < penZ) {
          pos.x += box.min.x < c.min.x ? -penX : penX;
        } else {
          pos.z += box.min.z < c.min.z ? -penZ : penZ;
        }
      }
      box = playerAABB(pos.x, pos.y, pos.z);
    }

    // Soft arena bounds (inside outer walls already collide, but clamp as safety)
    const island = S.island;
    if (ISLAND && island.clampPos) island.clampPos(pos);   // snow: soft square boundary up the snow banks
    else if (ISLAND) {   // ocean boundary: wade out a little, then blocked
      const r = Math.hypot(pos.x, pos.z), m = island.wadeR;
      if (r > m) { pos.x *= m / r; pos.z *= m / r; }
    } else {
      const lim = ARENA.w / 2 - PLAYER_RADIUS - 0.3;
      pos.x = Math.max(-lim, Math.min(lim, pos.x));
      pos.z = Math.max(-lim, Math.min(lim, pos.z));
    }
    player.wasGround = player.onGround;
  }

  // ─── Movement ─────────────────────────────────────────────────────────────
  const wish = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const touchMove = S.touchMove;

  function updateMovement(dt) {
    const yaw = S.yaw, aimT = S.aimT, island = S.island;
    forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    right.set(Math.cos(yaw), 0, -Math.sin(yaw));

    wish.set(0, 0, 0);
    if (held(KEYS.forward)) wish.add(forward);
    if (held(KEYS.back)) wish.sub(forward);
    if (held(KEYS.right)) wish.add(right);
    if (held(KEYS.left)) wish.sub(right);
    if (wish.lengthSq() > 0) wish.normalize();
    if (touchMove.x || touchMove.y) { wish.addScaledVector(forward, touchMove.y).addScaledVector(right, touchMove.x); if (wish.lengthSq() > 1) wish.normalize(); }

    const sprint = (held(KEYS.sprint) || touchMove.sprint) && aimT === 0;          // no sprint while scoped
    const speed = MOVE_SPEED * (sprint ? SPRINT_MULT : 1) * (1 + (SCOPE.moveMult - 1) * aimT);
    const inWater = ISLAND && (island.inWater ? island.inWater(player.pos.x, player.pos.z) : groundAt(player.pos.x, player.pos.z) < IS.waterLevel - 0.15);
    const wade = inWater ? IS.waterSlow : 1;
    player.vel.x = wish.x * speed * wade;
    player.vel.z = wish.z * speed * wade;

    if (held(KEYS.jump) && player.onGround) {
      player.vel.y = JUMP_VEL;
      player.onGround = false;
    }

    player.vel.y -= GRAVITY * dt;
    collideWorld(player.pos, player.vel, dt);

    camera.position.copy(player.pos);
    camera.rotation.x = S.pitch;
    camera.rotation.y = S.yaw;
  }

  // ─── Player damage / death ────────────────────────────────────────────────
  function isDead() { return player.health <= 0; }

  function damagePlayer(n, flashMs) {
    if (isDead()) return;
    player.health = Math.max(0, player.health - n);
    if (player.health > 0) audio.play('hurt');
    hpVal.textContent = String(player.health);
    dmgFlash.classList.add('show');
    clearTimeout(damagePlayer._ft);
    damagePlayer._ft = setTimeout(() => dmgFlash.classList.remove('show'), flashMs);
    if (isDead()) { S.cancelGrenade(); showDeath(); }
  }

  function showDeath() {
    audio.play('playerDeath');
    S.shooting = false;
    const kills = player.kills || 0;
    deathMsg.textContent = `Targets down: ${kills}`;
    deathEl.classList.remove('hidden');
    overlay.classList.add('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
  }

  function restartGame() {
    const START = S.START;
    player.pos.set(START[0], PLAYER_HEIGHT + groundAt(START[0], START[1]), START[1]);
    player.vel.set(0, 0, 0);
    player.health = MAX_HEALTH;
    player.ammo = MAG_SIZE;
    player.reloading = false;
    player.fireCooldown = 0;
    player.kills = 0;
    S.yaw = S.START_YAW; S.pitch = 0;
    hpVal.textContent = String(player.health);
    ammoVal.textContent = String(player.ammo);
    if (S.isFight()) S.resetEnemies();
    S.spawnTimer = CFG.spawn.interval;
    S.cancelGrenade();
    S.aimHeld = false; S.aimT = 0;
    camera.fov = SC.fov; camera.updateProjectionMatrix();
    vm.setAim(0);
    vm.root.visible = true;
    scopeOverlay.style.opacity = '0';
    crosshairEl.style.opacity = '1';
    S.pickups.reset();
    S.nadePickups.reset();
    S.fx.reset();
    S.grenades.reset();
    player.grenades = CFG.grenades.start; player.nadeCd = 0;
    nadeVal.textContent = String(player.grenades);
    syncCamera();
    deathEl.classList.add('hidden');
  }

  /** Put the camera at the player's eye. Without this the start screen rendered from (0,0,0): the eye sat
   *  exactly in the floor's top plane, so the floor was edge-on and the sky/fog colour filled the lower half. */
  function syncCamera() {
    camera.position.copy(player.pos);
    camera.rotation.set(S.pitch, S.yaw, 0);
  }

  Object.assign(S, { wantsAim, sensNow, lookBy, updateScope, collideWorld, updateMovement, isDead, damagePlayer, showDeath, restartGame, syncCamera });
}
