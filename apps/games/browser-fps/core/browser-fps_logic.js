/**
 * Browser FPS starter — Assault Cube–style feel (placeholders only).
 * Three.js r170 via import map. No build step.
 *
 * Entry point and main loop. The game is split into modules that share one context object `S`
 * (created by browser-fps_world.js); each module's install function adds its state and functions to S.
 * Only this file imports the modules, so there are no circular imports. Install order matters
 * (it keeps the original scene / listener order):
 *   world (config, DOM, renderer, map, doors, player record, ray queries)
 *   → player (movement, collision, scope, damage, restart)
 *   → ui (pointer lock, menus, keys, mouse, resize)
 *   → enemies (spawning, flow-field AI, pickup spots)
 *   → combat (enemy shots, rifle, tracers, surfaces)
 *   → items (medkits, grenades, grenade pickups)
 *   → this file (game step, frame loop + fps cap / counter, doors, touch controls, debug hook).
 */
import * as THREE from 'three';
import { loadAssets, loadLog } from '../assets/registry.js';
import { createWorld } from './browser-fps_world.js';
import { installPlayer } from './browser-fps_player.js';
import { installUi, createTouchControls } from './browser-fps_ui.js';
import { installEnemies } from './browser-fps_enemies.js';
import { installCombat } from './browser-fps_combat.js';
import { installItems } from './browser-fps_items.js';

// ─── Tunables (from browser-fps_config.js) ──────────────────────────────────
const CFG = window.BROWSER_FPS_CONFIG;
// Models (gun, arms, enemy, medkit) chosen by CFG.assets; .glb models fall back to code models on failure
const ASSETS = await loadAssets(CFG.assets);
const S = createWorld(CFG, ASSETS);
installPlayer(S);
installUi(S);
installEnemies(S);
installCombat(S);
installItems(S);

const { KEYS, SC, SNOW, ISLAND, MAP, player, enemies, camera, renderer, scene, vm, audio, doors, sun, fx } = S;
const PLAYER_HEIGHT = CFG.player.height;
const PLAYER_RADIUS = CFG.player.radius;
const MAX_HEALTH = CFG.player.maxHealth;
const MAG_SIZE = CFG.weapon.magSize;
const GR = CFG.grenades;
const held = S.held, touchMove = S.touchMove;
const { hpVal, ammoVal, nadeVal } = S;

// ─── Main loop ──────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

/** One simulation step while playing (also used by the headless test hook). */
let stepDist = 0;
function gameStep(dt) {
  S.updateMovement(dt);
  // footsteps: one every audio.stepEvery units walked on the ground
  if (player.onGround) {
    stepDist += Math.hypot(player.vel.x, player.vel.z) * dt;
    if (stepDist >= CFG.audio.stepEvery) { stepDist = 0; audio.play(SNOW ? 'snowstep' : 'footstep'); }
  }
  S.updateWeapon(dt);
  updateDoors(dt);
  if (S.isFight()) {
    S.updateSpawning(dt);
    S.updateEnemyAI(dt);
    S.pickups.update(dt, player.pos, player.pos.y - PLAYER_HEIGHT);
    S.nadePickups.update(dt, player.pos, player.pos.y - PLAYER_HEIGHT);
  }
  if (player.nadeCd > 0) player.nadeCd -= dt;
  S.grenades.update(dt);
  S.updateGrenadePreview();
  fx.update(dt);
  // Contact damage
  for (const en of enemies) {
    if (!en.alive) continue;
    if (en.touchCd > 0) en.touchCd -= dt;
    // Targets are solid, so contact = touching the collider (small margin)
    if (en.touches(player.pos, PLAYER_RADIUS, PLAYER_HEIGHT)) {
      if (!en.touchCd || en.touchCd <= 0) {
        S.damagePlayer(CFG.contact.damage, CFG.contact.flashMs);
        en.touchCd = CFG.contact.cooldown;
      }
    }
  }
}

// Frame-rate cap (CFG.scene.fpsCap, both maps): skip rAF callbacks until a frame interval has passed
let lastFrameMs = -1e9;
// FPS counter (F3 toggles, saved in localStorage; visible by default)
const fpsEl = document.getElementById('fps-counter');
let fpsFrames = 0, fpsT0 = performance.now(), fpsNow = 0;
let fpsShown = localStorage.getItem(CFG.fpsCounter.storageKey) !== '0';
fpsEl.classList.toggle('off', !fpsShown);
function toggleFpsCounter() { fpsShown = !fpsShown; localStorage.setItem(CFG.fpsCounter.storageKey, fpsShown ? '1' : '0'); fpsEl.classList.toggle('off', !fpsShown); }
S.toggleFpsCounter = toggleFpsCounter;
let frames = 0;
function tick(now = performance.now()) {
  requestAnimationFrame(tick);
  if (SC.fpsCap > 0 && now - lastFrameMs < 1000 / SC.fpsCap - 2) return;
  lastFrameMs = now;
  frames++;
  fpsFrames++;
  if (now - fpsT0 >= CFG.fpsCounter.every * 1000) {
    fpsNow = Math.round(fpsFrames * 1000 / (now - fpsT0)); fpsFrames = 0; fpsT0 = now;
    fpsEl.textContent = `FPS: ${fpsNow}`;
    fpsEl.classList.toggle('bad', fpsNow < 20); fpsEl.classList.toggle('warn', fpsNow >= 20 && fpsNow < 25);
  }
  const dt = Math.min(clock.getDelta(), 0.05);
  const islandLook = S.islandLook;
  if (ISLAND) {
    S.island.update(clock.elapsedTime, camera.position);
    // shadow box follows the player (island is bigger than the shadow camera)
    sun.target.position.set(player.pos.x, 0, player.pos.z);
    sun.position.set(player.pos.x + SC.sunPos[0], SC.sunPos[1], player.pos.z + SC.sunPos[2]);
    if (islandLook) islandLook.update(clock.elapsedTime, player.pos);
  }

  if (S.touch) S.touch.update();
  S.syncExitUi();
  if (S.active() && !S.isDead()) {
    gameStep(dt);
  } else if (S.active()) {
    // Dead: still allow look, no move
    camera.rotation.x = S.pitch;
    camera.rotation.y = S.yaw;
  }

  S.updateScope(dt);   // always (also eases out of scope when paused / dead)
  for (const en of enemies) en.update(dt);
  vm.update(dt, {
    moving: S.active() && !S.isDead() && (held(KEYS.forward) || held(KEYS.back) || held(KEYS.left) || held(KEYS.right) || !!(touchMove.x || touchMove.y)),
    sprint: (held(KEYS.sprint) || touchMove.sprint) && S.aimT === 0,
    onGround: player.onGround,
    yaw: S.yaw, pitch: S.pitch,
  });
  renderer.clear();
  renderer.render(scene, camera);
  if (islandLook && islandLook.flare) islandLook.flare.render();
  renderer.clearDepth();
  renderer.render(vm.scene, vm.camera);
}

// ─── Doors ──────────────────────────────────────────────────────────────────
// Arrived through a door: face away from it and restore carried state (health, ammo, grenades, score)
const ARRIVAL = S.ARRIVAL;
const doorFade = document.getElementById('door-fade'), doorPrompt = document.getElementById('door-prompt');
let arrivedState = null;
if (ARRIVAL) {
  S.yaw = ARRIVAL.yaw;
  const c = doors.takeCarry();
  if (c) {
    arrivedState = c;
    player.health = Math.max(1, Math.min(MAX_HEALTH, c.health | 0)); player.ammo = Math.max(0, Math.min(MAG_SIZE, c.ammo | 0));
    player.grenades = Math.max(0, Math.min(GR.max, c.grenades | 0)); player.kills = c.kills | 0;
    hpVal.textContent = String(player.health); ammoVal.textContent = String(player.ammo); nadeVal.textContent = String(player.grenades);
  }
  doorFade.classList.add('in'); requestAnimationFrame(() => { doorFade.classList.remove('in'); });   // fade in from black
}
function useDoor(d) {
  if (doors.going) return;
  doors.go(d, { health: player.health, ammo: player.ammo, grenades: player.grenades, kills: player.kills || 0, mode: S.MODE }, { mode: S.MODE });
}
function updateDoors() {
  const nearDoor = S.nearDoor = doors.update(0, player.pos, clock.elapsedTime);
  if (nearDoor && nearDoor.through && !doors.going) useDoor(nearDoor);
  const show = nearDoor && !doors.going;
  doorPrompt.classList.toggle('hidden', !show);
  if (show) doorPrompt.textContent = `E — go to ${CFG.mapNames[nearDoor.to] || nearDoor.to}`;
}
S.useDoor = useDoor;

// On-screen touch controls (keyboard + mouse always keep working)
const touch = createTouchControls(S);
S.syncCamera();
S.buildBlocked();
S.buildReachable();
if (S.isFight()) S.placeInitialEnemies();
S.syncModeUi();
tick();

// Expose a tiny debug hook in console
const { colliders, island, pickups, nadePickups, grenades, nadeAim, previewDots, previewRing, previewPos, keys, GA } = S;
const { fire, startReload, surfaceOf, groundAt, setMap, spawnRandomTarget, hasLineOfSight, restartGame, setMode, exitToMenu, leaveFullscreen,
  recentreGrid, damageAt, hitsCover, validPickupSpot, throwGrenade, holdGrenade, releaseGrenade, cancelGrenade, bulletDamage, updateScope } = S;
window.__fps = {
  player, enemies, colliders, scene, camera, fire, vm, startReload,
  map: MAP, island, doors, useDoor, get nearDoor() { return S.nearDoor; }, arrival: ARRIVAL, get arrivedState() { return arrivedState; }, get yaw() { return S.yaw; }, get islandLook() { return S.islandLook; }, fx, fxQuality: S.FXQ, surfaceOf, groundAt, get frames() { return frames; }, setMap,
  // test helpers: run game steps without pointer lock, spawning, line-of-sight
  step: (dt, n = 1) => { for (let i = 0; i < n; i++) { if (S.isDead()) break; updateScope(dt); gameStep(dt); for (const en of enemies) en.update(dt); } },
  spawnRandomTarget, hasLineOfSight, restartGame,
  get spawnTimer() { return S.spawnTimer; },
  get mode() { return S.MODE; }, setMode, exitToMenu, leaveFullscreen, get gridArea() { return { ...GA }; }, recentreGrid, get fps() { return fpsNow; }, get fpsShown() { return fpsShown; }, toggleFpsCounter,
  damageAt, hitsCover, pickups, validPickupSpot,
  grenades, nadePickups, throwGrenade, holdGrenade, releaseGrenade, cancelGrenade, nadeAim, previewDots, previewRing, previewPos, bulletDamage, audio,
  assets: Object.fromEntries(Object.entries(ASSETS).map(([k, a]) => [k, k === 'textures'
    ? Object.fromEntries(Object.entries(a).map(([t, m]) => [t, m ? m.name : null])) : a.name])), assetLog: loadLog, renderer,
  setLook: (y, p) => { S.yaw = y; S.pitch = p; },
  setAimHeld: (v) => { S.aimHeld = v; },
  get aimT() { return S.aimT; },
  get sens() { return S.sensNow(); },
  get moveSpeedNow() { return Math.hypot(player.vel.x, player.vel.z); },
  keys, touch, touchMove, get touchPlaying() { return S.touchPlaying; }, get shooting() { return S.shooting; }, get pitch() { return S.pitch; },
};
