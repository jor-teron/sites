// Slingshot: launch on release, band drawing and trajectory preview.
import { Body, SLING_X, SLING_Y, LAUNCH_POWER, GROUND_Y, WORLD_WIDTH, STEP_MS, BIRD_FRICTION_AIR } from './config.js';
import { S } from './entities.js';
import { engine } from './physics.js';
import { ctx, w2s, SCALE } from './render.js';
import { updateHud } from './ui.js';

// Launch velocity (px per 60Hz step) for the current (already clamped) drag position, or null if too small.
function launchVelocity() {
  const pullX = S.dragPos.x - SLING_X;
  const pullY = S.dragPos.y - SLING_Y;
  if (Math.hypot(pullX, pullY) < 10) return null;
  // Velocity: opposite of pull, scaled by LAUNCH_POWER
  return { x: -pullX * LAUNCH_POWER, y: -pullY * LAUNCH_POWER };
}

// Called from input on release while aiming. Tiny pulls go back to idle.
export function releaseSling() {
  const v = launchVelocity();
  if (!v) {
    S.gameState = 'idle';
    return;
  }

  // Launch from where the bird is drawn (the clamped drag position)
  const body = S.currentBird.body;
  Body.setPosition(body, { x: S.dragPos.x, y: S.dragPos.y });
  Body.setStatic(body, false);
  Body.setVelocity(body, v);
  Body.setAngularVelocity(body, -v.x * 0.01);
  S.currentBird.launched = true;

  // Move to active list
  S.activeBirds.push(S.currentBird);
  S.currentBird = null;
  S.flightTime = 0;
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
  const v = launchVelocity();
  if (!v) return;

  // Mirrors Matter 0.19 Body.update at a fixed 1000/60 ms step:
  //   v = v * (1 - frictionAir) + gravity.y * gravity.scale * dt^2 ;  p += v
  const g = engine.gravity.y * engine.gravity.scale * STEP_MS * STEP_MS;
  const air = 1 - BIRD_FRICTION_AIR;
  let vx = v.x, vy = v.y;
  let px = S.dragPos.x;
  let py = S.dragPos.y;
  const steps = 90;
  for (let i = 0; i < steps; i++) {
    vx *= air;
    vy = vy * air + g;
    px += vx;
    py += vy;
    if (py > GROUND_Y) break;
    if (px < 0 || px > WORLD_WIDTH) break;
    if (i % 2) continue;           // draw every other step
    const sp = w2s(px, py);
    const alpha = 0.55 * (1 - i / steps);
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, Math.max(1.5, 3.5 * SCALE), 0, Math.PI * 2);
    ctx.fill();
  }
}
