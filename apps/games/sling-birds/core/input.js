// Mouse/touch input for aiming the slingshot.
import { SLING_X, SLING_Y, MAX_PULL, GRAB_RADIUS, GRAB_MIN_PX } from './config.js?v=sb1a';
import { S } from './entities.js?v=sb1a';
import { canvas, s2w, SCALE } from './render.js?v=sb1a';
import { releaseSling } from './slingshot.js?v=sb1a';

function pointerWorld(e) {
  const rect = canvas.getBoundingClientRect();
  return s2w(e.clientX - rect.left, e.clientY - rect.top);
}

// Clamp a world point to within MAX_PULL of the slingshot
function clampPull(p) {
  const dx = p.x - SLING_X, dy = p.y - SLING_Y;
  const d = Math.hypot(dx, dy);
  const k = d > MAX_PULL ? MAX_PULL / d : 1;
  return { x: SLING_X + dx * k, y: SLING_Y + dy * k };
}

function onDown(e) {
  if (S.gameState !== 'idle' || !S.currentBird) return;
  if (e.cancelable) e.preventDefault();
  const p = pointerWorld(e);
  const dx = p.x - SLING_X;
  const dy = p.y - SLING_Y;
  // Grab radius never smaller than GRAB_MIN_PX on screen (small phones)
  if (Math.hypot(dx, dy) > Math.max(GRAB_RADIUS, GRAB_MIN_PX / SCALE)) return;
  S.isDragging = true;
  S.pointerId = e.pointerId;
  canvas.setPointerCapture(e.pointerId);
  S.dragPos = clampPull(p);
  S.gameState = 'aiming';
}

function onMove(e) {
  if (!S.isDragging || e.pointerId !== S.pointerId) return;
  if (e.cancelable) e.preventDefault();
  S.dragPos = clampPull(pointerWorld(e));
}

function onUp(e) {
  if (!S.isDragging || e.pointerId !== S.pointerId) return;
  if (e.cancelable) e.preventDefault();
  S.isDragging = false;

  if (!S.currentBird || S.gameState !== 'aiming') {
    S.gameState = 'idle';
    return;
  }
  if (e.type === 'pointercancel') {   // OS cancelled the gesture: don't fire
    S.gameState = 'idle';
    return;
  }

  releaseSling();
}

export function initInput() {
  // Pointer events + capture: dragging off the canvas no longer fires the bird
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
}
