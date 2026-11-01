/**
 * Browser FPS — combat: enemy line of sight and enemy shots, the player's rifle (hitscan, spread, reload,
 * muzzle flash, tracers), bullet damage and impact surfaces for effects.
 * installCombat(S) registers hasLineOfSight, damageAt, enemyFire, spawnTracer, startReload, bulletDamage,
 * damageEnemy, surfaceOf, fire, updateWeapon on the shared context (see browser-fps_world.js).
 */
import * as THREE from 'three';

export function installCombat(S) {
  const { CFG, W, IS, ISLAND, ARENA, scene, camera, vm, audio, fx, player, enemies, colliders, groundAt } = S;
  const { wallHit, bushBlocks, terrainHit, rayAABB } = S;
  const { ammoVal, hitmarker } = S;
  const PLAYER_HEIGHT = CFG.player.height;
  const PLAYER_RADIUS = CFG.player.radius;
  const SCOPE = CFG.scope;
  const FIRE_RATE = CFG.weapon.fireRate;
  const MAG_SIZE = CFG.weapon.magSize;
  const RELOAD_TIME = CFG.weapon.reloadTime;

  // ─── Enemy AI: face the player, shoot with line of sight ──────────────────
  const AI = CFG.ai;
  const aiFrom = new THREE.Vector3(), aiDir = new THREE.Vector3(), aiTo = new THREE.Vector3();
  const playerHalf = new THREE.Vector3(PLAYER_RADIUS, PLAYER_HEIGHT / 2, PLAYER_RADIUS);
  const playerCenter = new THREE.Vector3();

  /** Line of sight from an enemy's eyes to the player's head. */
  function hasLineOfSight(en) {
    const p = en.group.position;
    aiFrom.set(p.x, p.y + AI.eyeHeight, p.z);
    aiDir.subVectors(player.pos, aiFrom);
    const dist = aiDir.length();
    aiDir.normalize();
    return wallHit(aiFrom, aiDir, dist) > dist && !bushBlocks(aiFrom, aiDir, dist);
  }

  /** Distance falloff: damageNear at <= falloffNear, linearly down to damageFar at >= falloffFar. */
  function damageAt(d) {
    const u = Math.max(0, Math.min(1, (d - AI.falloffNear) / (AI.falloffFar - AI.falloffNear)));
    return Math.round(AI.damageNear + (AI.damageFar - AI.damageNear) * u);
  }

  function enemyFire(en, spreadMult = 1) {
    const from = en.muzzleWorld(aiFrom);
    playerCenter.set(player.pos.x, player.pos.y - PLAYER_HEIGHT * 0.4, player.pos.z);
    aiDir.subVectors(playerCenter, from).normalize();
    // aim error
    const sp = AI.spread * spreadMult;
    const e = new THREE.Euler((Math.random() * 2 - 1) * sp, (Math.random() * 2 - 1) * sp, 0, 'YXZ');
    aiDir.applyEuler(e).normalize();
    const tWall = wallHit(from, aiDir, W.tracerMaxDist);
    playerCenter.y = player.pos.y - PLAYER_HEIGHT / 2;
    const tPlayer = rayAABB(from, aiDir, playerCenter, playerHalf);
    const hit = tPlayer !== null && tPlayer > 0 && tPlayer < tWall;
    const dist = Math.min(hit ? tPlayer : tWall, W.tracerMaxDist);
    aiTo.copy(from).addScaledVector(aiDir, dist);
    spawnTracer(from, aiTo, AI.tracerColor);
    en.showMuzzleFlash();
    fx.enemyFlash(from);
    fx.muzzleSmoke(from, aiDir);
    S.sfxAt('enemyShot', from);
    if (hit) S.damagePlayer(damageAt(Math.hypot(player.pos.x - from.x, player.pos.z - from.z)), AI.flashMs);
  }

  // ─── Weapon / hitscan ─────────────────────────────────────────────────────
  const raycaster = new THREE.Raycaster();
  const shootDir = new THREE.Vector3();
  const muzzleFlashLight = new THREE.PointLight(W.flashColor, 0, W.flashRange);
  scene.add(muzzleFlashLight);
  let flashT = 0;

  // Simple bullet tracer line
  const tracerMat = new THREE.LineBasicMaterial({ color: W.tracerColor, transparent: true, opacity: W.tracerOpacity });
  const tracers = [];

  function spawnTracer(from, to, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const mat = tracerMat.clone();
    if (color !== undefined) mat.color.setHex(color);
    const line = new THREE.Line(geo, mat);
    scene.add(line);
    tracers.push({ line, life: W.tracerLife });
  }

  function startReload() {
    vm.startReload(RELOAD_TIME);
    audio.play('reload');
    player.reloading = true;
    player.reloadT = RELOAD_TIME;
  }

  function showHitmarker() {
    hitmarker.classList.add('show');
    clearTimeout(showHitmarker._t);
    showHitmarker._t = setTimeout(() => hitmarker.classList.remove('show'), W.hitmarkerMs);
  }

  /** Player bullet damage by zone and distance (config weapon.damage): near value at <= falloffNear, linear to far. */
  const WD = W.damage;
  function bulletDamage(zone, d) {
    const u = Math.max(0, Math.min(1, (d - WD.falloffNear) / (WD.falloffFar - WD.falloffNear)));
    const [near, far] = zone === 'head' ? [WD.headNear, WD.headFar] : [WD.bodyNear, WD.bodyFar];
    return Math.round(near + (far - near) * u);
  }

  function damageEnemy(en, dmg, zone, dir) {
    if (!en.alive) return;
    en.lastDealt = en.hit(zone, dmg, dir, true);   // final damage (no head multiplier); flash, knockback, death
    audio.play(zone === 'head' ? 'hitHead' : 'hitBody');
    if (!en.alive) { player.kills = (player.kills || 0) + 1; S.sfxAt('enemyDeath', en.group.position); }
    showHitmarker();
  }

  // ─── Impact surfaces (for effects) ────────────────────────────────────────
  const fxPoint = new THREE.Vector3(), fxNormal = new THREE.Vector3();
  /** Surface name for a bullet hit: a collider (camp floor / wall / cover, island rock / palm) or the island terrain (null). */
  function surfaceOf(c, p) {
    if (!c) {
      if (!ISLAND) return 'concrete';
      if (S.island.surfaceAt) return S.island.surfaceAt(p);
      const r = Math.hypot(p.x, p.z);
      return r > IS.radius * IS.beachFrac - 1 ? 'sand' : r < IS.radius * 0.45 ? 'dirt' : 'grass';
    }
    if (c.prop === 'palm_tree' || c.prop === 'pine_tree' || c.prop === 'broadleaf_tree' || c.prop === 'cabin' || c.prop === 'bridge') return 'wood';
    if (c.prop === 'rock_boulder') return 'rock';
    if (c.prop) return 'rock';
    if (c.max.y <= 0.05) return 'concrete';                                     // camp floor
    const hw = ARENA.w / 2, hd = ARENA.d / 2;
    return (c.max.x > hw || c.min.x < -hw || c.max.z > hd || c.min.z < -hd) ? 'brick' : 'concrete';   // outer walls / cover
  }
  /** Outward normal at p: nearest AABB face, or the terrain slope. */
  function surfaceNormal(c, p) {
    if (!c) {
      if (!ISLAND) return fxNormal.set(0, 1, 0);
      const e = 0.25;
      return fxNormal.set(groundAt(p.x - e, p.z) - groundAt(p.x + e, p.z), 2 * e, groundAt(p.x, p.z - e) - groundAt(p.x, p.z + e)).normalize();
    }
    const d = [p.x - c.min.x, c.max.x - p.x, p.y - c.min.y, c.max.y - p.y, p.z - c.min.z, c.max.z - p.z];
    let k = 0; for (let i = 1; i < 6; i++) if (d[i] < d[k]) k = i;
    const n = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]][k];
    return fxNormal.set(n[0], n[1], n[2]);
  }

  function fire() {
    if (player.reloading || player.fireCooldown > 0 || S.nadeAim.holding) return;
    if (player.ammo <= 0) {
      audio.play('dryClick');
      startReload();
      return;
    }

    player.ammo--;
    player.fireCooldown = FIRE_RATE;
    ammoVal.textContent = String(player.ammo);
    audio.play('shot', { vol: S.aimT > 0.5 ? 0.95 : 1 });

    // Muzzle flash + tracer start at the viewmodel's barrel tip
    shootDir.set(0, 0, -1).applyQuaternion(camera.quaternion);
    // spread: wider from the hip, tight when scoped
    const spread = SCOPE.hipSpread + (SCOPE.scopedSpread - SCOPE.hipSpread) * S.aimT;
    shootDir.applyEuler(new THREE.Euler((Math.random() * 2 - 1) * spread, (Math.random() * 2 - 1) * spread, 0, 'YXZ')).normalize();
    camera.updateMatrixWorld();
    const muzzle = vm.muzzleWorld(camera);
    vm.onFire();
    muzzleFlashLight.position.copy(muzzle);
    muzzleFlashLight.intensity = W.flashIntensity;
    fx.muzzleSmoke(muzzle, shootDir);
    flashT = W.flashTime;

    raycaster.set(camera.position, shootDir);
    raycaster.far = W.range;

    // Hit enemies via AABB ray (more reliable than mesh for boxes)
    let bestT = Infinity;
    let bestEn = null;
    let bestZone = null;
    for (const en of enemies) {
      if (!en.alive) continue;
      const r = en.raycast(camera.position, shootDir);
      if (r && r.t > 0 && r.t < bestT) {
        bestT = r.t;
        bestEn = en;
        bestZone = r.zone;
      }
    }

    // Also check world colliders so bullets don't pass walls
    let wallT = Infinity, wallC = null;
    for (const c of colliders) {
      if (c.target || c.disabled) continue;   // target colliders are for movement only
      if (!c._half) {
        c._half = new THREE.Vector3().subVectors(c.max, c.min).multiplyScalar(0.5);
        c._center = new THREE.Vector3().addVectors(c.min, c.max).multiplyScalar(0.5);
      }
      const t = rayAABB(camera.position, shootDir, c._center, c._half);
      if (t !== null && t > 0.1 && t < wallT) { wallT = t; wallC = c; }
    }
    const tTerrain = terrainHit(camera.position, shootDir, Math.min(wallT, W.range));
    if (tTerrain < wallT) { wallT = tTerrain; wallC = null; }

    const hitDist = Math.min(bestT, wallT, W.tracerMaxDist);
    const hitPoint = camera.position.clone().add(shootDir.clone().multiplyScalar(hitDist));
    spawnTracer(muzzle, hitPoint);

    if (bestEn && bestT <= wallT) {
      fx.enemyHit(hitPoint, shootDir, bestZone === 'head');
      damageEnemy(bestEn, bulletDamage(bestZone, bestT), bestZone, shootDir);
    } else if (wallT <= W.range) {
      const pt = fxPoint.copy(camera.position).addScaledVector(shootDir, wallT);
      fx.impact(pt, surfaceNormal(wallC, pt), surfaceOf(wallC, pt), shootDir);
    }

    if (player.ammo <= 0) startReload();
  }

  function updateWeapon(dt) {
    if (player.fireCooldown > 0) player.fireCooldown -= dt;

    if (player.reloading) {
      player.reloadT -= dt;
      if (player.reloadT <= 0) {
        player.reloading = false;
        player.ammo = MAG_SIZE;
        ammoVal.textContent = String(player.ammo);
      }
    }

    if (S.shooting && S.active()) fire();

    if (flashT > 0) {
      flashT -= dt;
      if (flashT <= 0) muzzleFlashLight.intensity = 0;
    }

    for (let i = tracers.length - 1; i >= 0; i--) {
      const tr = tracers[i];
      tr.life -= dt;
      tr.line.material.opacity = Math.max(0, tr.life / W.tracerLife);
      if (tr.life <= 0) {
        scene.remove(tr.line);
        tr.line.geometry.dispose();
        tr.line.material.dispose();
        tracers.splice(i, 1);
      }
    }
  }

  Object.assign(S, { hasLineOfSight, damageAt, enemyFire, spawnTracer, startReload, bulletDamage, damageEnemy, surfaceOf, fire, updateWeapon });
}
