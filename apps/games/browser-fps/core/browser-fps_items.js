/**
 * Browser FPS — items: medkit pickups, grenades (hold-to-aim preview arc, throw, blast damage) and grenade
 * pickups. Physics / meshes live in browser-fps_grenades.js and browser-fps_pickups.js; this module wires
 * them to the player and enemies. installItems(S) registers pickups, nadePickups, grenades, nadeAim,
 * holdGrenade, cancelGrenade, releaseGrenade, throwGrenade, updateGrenadePreview on the shared context.
 */
import * as THREE from 'three';
import { createPickups } from './browser-fps_pickups.js';
import { createGrenades } from './browser-fps_grenades.js';

export function installItems(S) {
  const { CFG, FOREST, ASSETS, scene, camera, vm, audio, player, enemies, colliders, groundAt, GA } = S;
  const { hpVal, nadeVal, nadePop, healFlash, healPop } = S;
  const PLAYER_HEIGHT = CFG.player.height;
  const MAX_HEALTH = CFG.player.maxHealth;
  const isDead = () => S.isDead();

  // ─── Medkits ──────────────────────────────────────────────────────────────
  const PK = CFG.pickups;
  let healTimers;
  const pickups = createPickups(scene, PK, {
    groundAt,
    randomSpot() {
      for (let n = 0; n < 60; n++) {
        const x = GA.ox + (Math.random() - 0.5) * GA.w, z = GA.oz + (Math.random() - 0.5) * GA.d;
        if (S.validPickupSpot(x, z)) return [x, z];
      }
      return null;
    },
    canPick: () => player.health > 0 && player.health < MAX_HEALTH,
    onPick(amount) {
      const before = player.health;
      player.health = Math.min(MAX_HEALTH, player.health + amount);
      hpVal.textContent = String(player.health);
      healFlash.classList.add('show');
      clearTimeout(healTimers.f);
      healTimers.f = setTimeout(() => healFlash.classList.remove('show'), PK.flashMs);
      healPop.textContent = '+' + (player.health - before);   // actual amount healed (capped at max)
      pickups.lastHeal = player.health - before;
      audio.play('medkit');
      healPop.classList.remove('show'); void healPop.offsetWidth; healPop.classList.add('show');
      clearTimeout(healTimers.p);
      healTimers.p = setTimeout(() => healPop.classList.remove('show'), PK.popMs);
    },
  }, ASSETS.medkit);
  healTimers = { f: 0, p: 0 };
  S.pickups = pickups;

  // ─── Grenades ─────────────────────────────────────────────────────────────
  const GR = CFG.grenades;
  const nadeFrom = new THREE.Vector3(), nadeDir = new THREE.Vector3(), nadeTmp = new THREE.Vector3();
  function blastBlocked(from, to) {
    if (!GR.needsLineOfSight) return false;
    nadeDir.subVectors(to, from); const d = nadeDir.length(); if (d < 0.05) return false;
    nadeDir.divideScalar(d);
    nadeFrom.copy(from).addScaledVector(nadeDir, 0.02);
    return S.wallHit(nadeFrom, nadeDir, d) < d - 0.05;
  }
  const grenades = createGrenades(scene, GR, ASSETS.grenade, {
    solids: () => refreshNadeSolids(),
    onBounce: (p) => S.sfxAt('grenadeBounce', p),
    groundAt,
    onExplode(p) {
      S.sfxAt('explosion', p);
      const from = nadeTmp.copy(p).setY(Math.max(p.y, groundAt(p.x, p.z) + 0.3)).clone();
      for (const en of enemies) {
        if (!en.alive) continue;
        const c = en.group.position.clone(); c.y += 1.0;
        const d = c.distanceTo(from), k = grenades.falloff(d);
        if (k <= 0 || blastBlocked(from, c)) continue;
        const dir = new THREE.Vector3().subVectors(c, from).setY(0);
        if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
        S.damageEnemy(en, Math.round(GR.damage * k), 'body', dir.normalize());
      }
      const pc = player.pos.clone().setY(player.pos.y - PLAYER_HEIGHT / 2);
      const k = grenades.falloff(pc.distanceTo(from));
      if (k > 0 && GR.selfDamage > 0 && !blastBlocked(from, pc)) S.damagePlayer(Math.round(GR.selfDamage * k), CFG.contact.flashMs * 2);
    },
  });
  // Hold-to-aim throw: preview arc (preallocated dots) + landing ring, both from grenades.predict (same sim as live)
  const GP = GR.preview;
  const nadeAim = { holding: false, count: 0, rest: new THREE.Vector3() };
  const nadeOrigin = new THREE.Vector3(), nadeLook = new THREE.Vector3(), nadeDown = new THREE.Vector3(0, -0.15, 0);
  const previewPos = new Float32Array(GP.points * 3);
  const previewGeo = new THREE.BufferGeometry();
  previewGeo.setAttribute('position', new THREE.BufferAttribute(previewPos, 3).setUsage(THREE.DynamicDrawUsage));
  previewGeo.setDrawRange(0, 0);
  const dotTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d');
    const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.6, 'rgba(255,255,255,0.9)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
  const previewDots = new THREE.Points(previewGeo, new THREE.PointsMaterial({ map: dotTex, alphaTest: 0.05, color: GP.color, size: GP.dotSize, sizeAttenuation: false, transparent: true, opacity: 0.95, depthWrite: false }));
  previewDots.frustumCulled = false; previewDots.visible = false; previewDots.renderOrder = 5;
  const ringGeo = new THREE.RingGeometry(GP.ringRadius * 0.7, GP.ringRadius, 32); ringGeo.rotateX(-Math.PI / 2);
  const previewRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: GP.ringColor, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
  previewRing.visible = false; previewRing.renderOrder = 5;
  scene.add(previewDots, previewRing);
  const nadeSolids = [];
  function refreshNadeSolids() {
    nadeSolids.length = 0;
    const near = FOREST ? 60 : Infinity, px = player.pos.x, pz = player.pos.z;   // forest: only boxes a throw can reach
    for (const c of colliders) {
      if (c.target || c.disabled) continue;
      if (near < Infinity && Math.max(Math.abs((c.min.x + c.max.x) / 2 - px), Math.abs((c.min.z + c.max.z) / 2 - pz)) > near) continue;
      nadeSolids.push(c);
    }
    return nadeSolids;
  }
  vm.setNadeModel(ASSETS.grenade.build());

  /** Throw origin + direction from the camera (shared by the preview and the real throw). */
  function nadeLaunch() {
    camera.updateMatrixWorld();
    nadeLook.set(0, 0, -1).applyQuaternion(camera.quaternion);
    nadeOrigin.copy(camera.position).addScaledVector(nadeLook, 0.5).add(nadeDown);
  }
  function updateGrenadePreview() {
    if (!nadeAim.holding) return;
    nadeLaunch();
    const n = grenades.predict(nadeOrigin, nadeLook, player.vel, previewPos, GP.points, nadeAim.rest, refreshNadeSolids());
    nadeAim.count = n;
    previewGeo.setDrawRange(GP.skipNear, Math.max(0, n - GP.skipNear));   // first dots sit right at the hand
    previewGeo.attributes.position.needsUpdate = true;
    previewDots.visible = true;
    previewRing.position.copy(nadeAim.rest); previewRing.position.y = Math.max(nadeAim.rest.y - GR.radius, groundAt(nadeAim.rest.x, nadeAim.rest.z)) + 0.03;
    previewRing.visible = true;
  }
  function hidePreview() { previewDots.visible = false; previewRing.visible = false; }
  function holdGrenade() {
    if (nadeAim.holding || isDead() || player.grenades <= 0 || player.nadeCd > 0 || player.reloading) return false;
    nadeAim.holding = true; S.shooting = false;
    vm.setNade('hold');
    updateGrenadePreview();
    return true;
  }
  function cancelGrenade() {
    if (!nadeAim.holding) return false;
    nadeAim.holding = false; hidePreview(); vm.setNade('none');
    return true;
  }
  function releaseGrenade() {
    if (!nadeAim.holding) return null;
    nadeAim.holding = false; hidePreview();
    if (isDead()) { vm.setNade('none'); return null; }
    vm.setNade('throw');
    return throwGrenade();
  }
  function throwGrenade() {
    if (player.grenades <= 0 || player.nadeCd > 0) return null;
    player.grenades--; player.nadeCd = GR.cooldown;
    nadeVal.textContent = String(player.grenades);
    audio.play('grenadeThrow');
    nadeLaunch();
    return grenades.throwFrom(nadeOrigin, nadeLook, player.vel);
  }

  // ─── Grenade pickups ──────────────────────────────────────────────────────
  let nadeTimer = 0;
  const nadePickups = createPickups(scene, CFG.grenadePickups, {
    groundAt,
    randomSpot() {
      for (let n = 0; n < 60; n++) {
        const x = GA.ox + (Math.random() - 0.5) * GA.w, z = GA.oz + (Math.random() - 0.5) * GA.d;
        if (S.validPickupSpot(x, z) && !nadePickups.items.some((it) => Math.hypot(it.x - x, it.z - z) < 3)) return [x, z];
      }
      return null;
    },
    canPick: () => player.health > 0 && player.grenades < GR.max,
    onPick(amount) {
      const before = player.grenades;
      player.grenades = Math.min(GR.max, player.grenades + amount);
      nadeVal.textContent = String(player.grenades);
      nadePickups.lastGain = player.grenades - before;
      audio.play('grenadePickup');
      nadePop.textContent = '+' + (player.grenades - before);
      nadePop.classList.remove('show'); void nadePop.offsetWidth; nadePop.classList.add('show');
      clearTimeout(nadeTimer); nadeTimer = setTimeout(() => nadePop.classList.remove('show'), CFG.grenadePickups.popMs);
    },
  }, ASSETS.grenadePickup);
  nadeVal.textContent = String(player.grenades);

  Object.assign(S, { grenades, nadePickups, nadeAim, previewDots, previewRing, previewPos, holdGrenade, cancelGrenade, releaseGrenade, throwGrenade, updateGrenadePreview });
}
