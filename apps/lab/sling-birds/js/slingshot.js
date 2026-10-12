// Slingshot: launch on release, band drawing and trajectory preview.
import { Body, SLING_X, SLING_Y, MAX_PULL, LAUNCH_POWER, GROUND_Y, WORLD_WIDTH } from './config.js';
import { S } from './entities.js';
import { engine } from './physics.js';
import { ctx, w2s, SCALE } from './render.js';
import { updateHud } from './ui.js';

// Called from input on release while aiming. Returns early (back to idle) for tiny pulls.
export function releaseSling() {
  let pullX = S.dragPos.x - SLING_X;
  let pullY = S.dragPos.y - SLING_Y;
  const dist = Math.hypot(pullX, pullY);
  if (dist < 10) {
    S.gameState = 'idle';
    return;
  }
  if (dist > MAX_PULL) {
    const k = MAX_PULL / dist;
    pullX *= k;
    pullY *= k;
  }

  // Velocity: opposite of pull, scaled by LAUNCH_POWER
  const vx = -pullX * LAUNCH_POWER;
  const vy = -pullY * LAUNCH_POWER;

  Body.setStatic(S.currentBird.body, false);
  Body.setVelocity(S.currentBird.body, { x: vx, y: vy });
  Body.setAngularVelocity(S.currentBird.body, -vx * 0.01);
  S.currentBird.launched = true;

  // Move to active list
  S.activeBirds.push(S.currentBird);
  S.currentBird = null;
  S.gameState = 'flying';
  updateHud();
}

export function drawSling() {
  const baseP = w2s(SLING_X, GROUND_Y);
  const topP  = w2s(SLING_X, SLING_Y);

  ctx.strokeStyle = '#5a3a1a';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(baseP.x, baseP.y);
  ctx.lineTo(topP.x - 8, topP.y - 10);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(baseP.x, baseP.y);
  ctx.lineTo(topP.x + 8, topP.y - 10);
  ctx.stroke();

  if (S.currentBird && !S.currentBird.launched) {
    const birdPos = S.isDragging ? S.dragPos : { x: SLING_X, y: SLING_Y };
    const bp = w2s(birdPos.x, birdPos.y);
    ctx.strokeStyle = '#8a2a2a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(topP.x - 8, topP.y - 10);
    ctx.lineTo(bp.x, bp.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(topP.x + 8, topP.y - 10);
    ctx.lineTo(bp.x, bp.y);
    ctx.stroke();
  }
}

export function drawTrajectory() {
  if (!S.isDragging || !S.currentBird) return;

  let pullX = S.dragPos.x - SLING_X;
  let pullY = S.dragPos.y - SLING_Y;
  const dist = Math.hypot(pullX, pullY);
  if (dist < 10) return;
  if (dist > MAX_PULL) {
    const k = MAX_PULL / dist;
    pullX *= k;
    pullY *= k;
  }
  let vx = -pullX * LAUNCH_POWER;
  let vy = -pullY * LAUNCH_POWER;

  // Simulate a preview arc — Matter.js uses per-step velocity roughly in pixels/step at 60fps
  // Use small timestep to approximate
  const dt = 1 / 60;
  const gravity = engine.gravity.y * 0.00098 * 1000; // approx pixels/sec²
  // Matter works in px/step, so use simpler approximation:
  let px = SLING_X;
  let py = SLING_Y;
  const steps = 45;
  for (let i = 0; i < steps; i++) {
    // Approximate Matter's physics: velocity is px/step, gravity adds each step
    px += vx;
    py += vy;
    vy += engine.gravity.y * 1; // per-step gravity add (rough)
    if (py > GROUND_Y) break;
    if (px < 0 || px > WORLD_WIDTH) break;
    const sp = w2s(px, py);
    const alpha = 0.55 * (1 - i / steps);
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, Math.max(1.5, 3.5 * SCALE), 0, Math.PI * 2);
    ctx.fill();
  }
}
