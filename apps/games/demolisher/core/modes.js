/*
  File: core/modes.js
  Project: Demolisher
  Purpose: Game modes (sandbox / mission / level), run start, pause, menu, win / lose rules.
  Plain script (no modules): top-level const / let / function share one global scope with the
  other core/*.js files, loaded in the order listed in demolisher.html.
  Uses: state.js .. entities.js.
*/

'use strict';

/* ============================================================
   MODE SETUP
   ============================================================ */

/* sandbox, mission or level (numbered level, see levelNo). */
let currentMode = 'sandbox';
/* Numbered level 0-30 for currentMode 'level' (and the menu picker). 0 = the original Mission. */
let levelNo = 0;
/* Points from kills and targets. */
let score = 0;
/* menu, playing, paused, dead, won, exit. Overlay is derived from this. */
let gameState = 'menu';
/* Last "gate locked" hint time (throttle). */
let lastGateHint = 0;

/*
  Remove actors. Does not call Engine.clear, which drops engine state.
*/
function resetWorld() {
  Composite.clear(engine.world, false);
  engine.gravity.y = GRAVITY;
  chunkBodies.clear();
  enemies.length = 0;
  enemyProjectiles.length = 0;
  targets.length = 0;
  projectiles.length = 0;
  explosions.length = 0;
  particles.length = 0;
  floaters.length = 0;
  player = null;
}

/*
  Left wall and floor so the body cannot leave the map.
  The right edge is the exit, checked in checkGameConditions.
*/
function addWorldBounds() {
  const wall = 48;
  Composite.add(engine.world, [
    Bodies.rectangle(-wall / 2, WORLD_H / 2, wall, WORLD_H * 2, { isStatic: true, label: 'bounds' }),
    Bodies.rectangle(WORLD_W / 2, WORLD_H + wall / 2, WORLD_W + 400, wall, { isStatic: true, label: 'bounds' })
  ]);
}

/*
  Snap the camera and build nearby chunk bodies before the first step.
  Otherwise the player falls through air until the loop catches up.
*/
function warmChunks() {
  if (!player) return;
  camX = player.body.position.x - VIEW_W / 2;
  camY = player.body.position.y - VIEW_H / 2 - 30;
  const maxX = Math.max(0, WORLD_W - VIEW_W);
  const maxY = Math.max(0, WORLD_H - VIEW_H);
  camX = Math.max(0, Math.min(maxX, camX));
  camY = Math.max(0, Math.min(maxY, camY));
  rebuildChunksInView();
  rebuildChunksInView();
}
function resetLoadout() {
  currentWeapon = WEAPON_ORDER[0];
  ammoRemaining = startAmmo();
  updateAmmoUI();
  for (const btn of weaponBtns) btn.classList.toggle('active', btn.dataset.w === currentWeapon);
}
/* Fresh aim / input state for a new run. */
function resetAim() {
  aimMode = mouseAimReady ? 'mouse' : 'facing';
  aimRel = 0;
  aimAngle = 0;
  accumulator = 0;
}

/*
  Open sandbox: hills, crates, no objectives.
*/
function setupSandbox() {
  currentMode = 'sandbox';
  score = 0;
  resetWorld();
  generateWorld('sandbox');
  addWorldBounds();
  const sy = surfaceRow();
  spawnPlayer(GRID_W * 0.18 * TILE, (sy - 4) * TILE);
  warmChunks();
  resetLoadout();
  resetAim();
  gameState = 'playing';
  updateHud();
  hideOverlay();
  showHint(TX.sandboxHint, 2600);
  hubSendApp();
}

/*
  Open mission: targets and a line of walkers.
*/
function setupMission(asLevel) {
  currentMode = asLevel ? 'level' : 'mission';
  worldRand = asLevel ? SEED.rngFor(0, 'terrain', 0) : Math.random;
  score = 0;
  resetWorld();
  generateWorld('mission');
  addWorldBounds();
  const sy = surfaceRow();
  spawnPlayer(GRID_W * 0.12 * TILE, (sy - 4) * TILE);
  warmChunks();
  resetLoadout();
  resetAim();
  for (const f of CFG.mission.targets) {
    const tx = Math.floor(GRID_W * f);
    spawnTarget(tx * TILE, (sy - 3) * TILE);
  }
  for (let i = 0; i < CFG.enemies.count; i++) {
    spawnEnemy((0.32 + i * 0.08) * WORLD_W, (sy - 3) * TILE);
  }
  gameState = 'playing';
  updateHud();
  hideOverlay();
  showHint(asLevel ? fmt(TX.levelHint, { n: SEED.pad2(0) }) : TX.missionHint, 2600);
  hubSendApp();
}

/*
  DM1a: numbered level n. 00 is the original Mission; 01-30 are generated from the number
  (terrain, materials, targets, enemies, ammo). Same win rule as Mission: destroy every target.
*/
function setupLevel(n) {
  levelNo = n;
  saveLastLevel(n);
  syncPicker();
  if (n === 0) { setupMission(true); return; }
  worldRand = Math.random;
  const lv = LEVELS.generateLevel(n, { gridW: GRID_W, gridH: GRID_H, MAT });
  currentMode = 'level';
  score = 0;
  resetWorld();
  initTerrain();
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) { const m = lv.tiles[y * GRID_W + x]; if (m) setMat(x, y, m); }
  terrainDirty = true;
  addWorldBounds();
  spawnPlayer((lv.spawn.gx + 0.5) * TILE, lv.spawn.gy * TILE);
  warmChunks();
  resetLoadout();
  Object.assign(ammoRemaining, lv.ammo);          // per-level ammo budget (pistol stays unlimited)
  updateAmmoUI();
  resetAim();
  for (const t of lv.targets) spawnTarget((t.gx + 0.5) * TILE, (t.gy + 0.5) * TILE);
  for (const e of lv.enemies) { spawnEnemy((e.gx + 0.5) * TILE, e.gy * TILE); const en = enemies[enemies.length - 1]; en.hp = en.maxHp = e.hp; }
  gameState = 'playing';
  updateHud();
  hideOverlay();
  showHint(fmt(TX.levelHint, { n: SEED.pad2(n) }), 2600);
  hubSendApp();
}

/* Start (or restart) a mode. */
function startMode(mode) {
  if (mode === 'level') setupLevel(levelNo);
  else if (mode === 'mission') setupMission();
  else setupSandbox();
}
/* New run in the current mode (RESET / hub New Game). */
function newGame() { startMode(currentMode); }
/* Cycle Sandbox -> Mission -> Level and start it (hub Mode button). */
function cycleMode() { startMode(currentMode === 'sandbox' ? 'mission' : currentMode === 'mission' ? 'level' : 'sandbox'); }

/* Pause / resume a running game. */
function togglePause() {
  if (gameState === 'playing') {
    gameState = 'paused';
    clearInput();
    showOverlay('paused');
  } else if (gameState === 'paused') {
    gameState = 'playing';
    accumulator = 0;
    hideOverlay();
  }
  updatePauseBtn();
}
/* Enter / Start / tap on the card: start from the menu or an end card, else pause. */
function primaryAction() {
  if (gameState === 'menu') startMode(currentMode);
  else if (gameState === 'playing' || gameState === 'paused') togglePause();
  else if (gameState === 'won' && currentMode === 'level' && levelNo < SEED.MAX_LEVEL) setupLevel(levelNo + 1);
  else startMode(currentMode);            // dead / won / exit: play again (a cleared level: next level)
}
/* Escape / Select: back to the menu. */
function toMenu() {
  if (gameState === 'menu') return;
  gameState = 'menu';
  clearInput();
  showOverlay('menu');
  updatePauseBtn();
}
