/*
  File: core/main.js
  Project: Demolisher
  Purpose: Camera, fixed-step loop, boot (listeners, CSS variables, first overlay, rAF).
  Plain script (no modules): top-level const / let / function share one global scope with the
  other core/*.js files, loaded in the order listed in demolisher.html.
  Uses: all other core/*.js.
*/

'use strict';

/* ============================================================
   CAMERA AND LOOP
   ============================================================ */

/*
  Ease the camera toward the player and clamp to the world.
*/
function updateCamera(dt) {
  if (!player) return;
  const targetX = player.body.position.x - VIEW_W / 2;
  const targetY = player.body.position.y - VIEW_H / 2 - 30;
  camX += (targetX - camX) * Math.min(1, dt * 6);
  camY += (targetY - camY) * Math.min(1, dt * 6);
  const maxX = Math.max(0, WORLD_W - VIEW_W);
  const maxY = Math.max(0, WORLD_H - VIEW_H);
  camX = Math.max(0, Math.min(maxX, camX));
  camY = Math.max(0, Math.min(maxY, camY));
}

/*
  Age blasts, sparks, and floaters. Used in play and on the end card.
*/
function updateFx(dt) {
  for (let i = explosions.length - 1; i >= 0; i--) {
    explosions[i].life -= dt;
    if (explosions[i].life <= 0) explosions.splice(i, 1);
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.gravity) p.vy += p.gravity * dt;
  }
  for (let i = floaters.length - 1; i >= 0; i--) {
    const d = floaters[i];
    d.life -= dt;
    d.y -= 28 * dt;
    if (d.life <= 0) floaters.splice(i, 1);
  }
}

/* Seconds not yet consumed by fixed steps. */
let accumulator = 0;
/* Last frame timestamp. */
let lastTime = 0;

/*
  Fixed step: input, Matter, chunks, shots, AI, fluids.
  Ground flag is cleared before contacts and set by the collision listener.
*/
function simStep() {
  updatePlayerInput();
  if (player) player.onGround = false;
  if (player) player.fireCooldown = Math.max(0, player.fireCooldown - FIXED_DT);
  updateAim(FIXED_DT);
  const w = WEAPONS[currentWeapon];
  if ((mouseDown || fireHeld || fireKeyHeld) && w.auto) fire();
  Engine.update(engine, FIXED_DT * 1000);
  rebuildChunksInView();
  updateProjectiles(FIXED_DT);
  updateEnemies(FIXED_DT);
  updateEnemyProjectiles(FIXED_DT);
  applyFluids(FIXED_DT);
  updateFx(FIXED_DT);
  updateCamera(FIXED_DT);
  checkGameConditions();
}

/*
  Render loop. Playing state runs as many 1/60 steps as the frame earned.
*/
function loop(now) {
  requestAnimationFrame(loop);
  const frameDt = Math.min(0.05, (now - lastTime) / 1000 || 0);
  lastTime = now;
  if (gameState === 'playing') {
    accumulator += frameDt;
    let guard = 0;
    while (accumulator >= FIXED_DT && guard < 4) {
      simStep();
      accumulator -= FIXED_DT;
      guard++;
    }
  } else if (gameState !== 'paused') {
    updateFx(frameDt);
  }
  render();
}

/* Boot into the menu. World is built when a mode button is pressed. */
Events.on(engine, 'collisionActive', onCollisionActive);
/* Touch sizes from config → CSS variables. */
const rootStyle = document.documentElement.style;
rootStyle.setProperty('--stick', TOUCH.stick + 'px');
rootStyle.setProperty('--knob', TOUCH.knob + 'px');
rootStyle.setProperty('--fire', TOUCH.fire + 'px');
rootStyle.setProperty('--jump', TOUCH.jump + 'px');
/* Weapon labels from config. */
for (const btn of weaponBtns) {
  const w = WEAPONS[btn.dataset.w];
  if (w && btn.firstChild && btn.firstChild.nodeType === 3) btn.firstChild.textContent = (w.label || w.name).toUpperCase() + ' ';
}
levelNo = loadLastLevel();
resize();
updateAmmoUI();
showOverlay('menu');
hubPost({ type: 'hub-ready' });
requestAnimationFrame((t) => {
  lastTime = t;
  requestAnimationFrame(loop);
});
