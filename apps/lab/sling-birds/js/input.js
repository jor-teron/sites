// Mouse/touch input for aiming the slingshot.
import { SLING_X, SLING_Y } from './config.js';
import { S } from './entities.js';
import { canvas, s2w } from './render.js';
import { releaseSling } from './slingshot.js';

function pointerWorld(e) {
  const rect = canvas.getBoundingClientRect();
  let cx, cy;
  if (e.touches && e.touches.length > 0) {
    cx = e.touches[0].clientX;
    cy = e.touches[0].clientY;
  } else if (e.changedTouches && e.changedTouches.length > 0) {
    cx = e.changedTouches[0].clientX;
    cy = e.changedTouches[0].clientY;
  } else {
    cx = e.clientX;
    cy = e.clientY;
  }
  return s2w(cx - rect.left, cy - rect.top);
}

function onDown(e) {
  if (S.gameState !== 'idle' || !S.currentBird) return;
  if (e.cancelable) e.preventDefault();
  const p = pointerWorld(e);
  const dx = p.x - SLING_X;
  const dy = p.y - SLING_Y;
  if (Math.hypot(dx, dy) > 100) return;
  S.isDragging = true;
  S.dragPos = { x: p.x, y: p.y };
  S.gameState = 'aiming';
}

function onMove(e) {
  if (!S.isDragging) return;
  if (e.cancelable) e.preventDefault();
  S.dragPos = pointerWorld(e);
}

function onUp(e) {
  if (!S.isDragging) return;
  if (e.cancelable) e.preventDefault();
  S.isDragging = false;

  if (!S.currentBird || S.gameState !== 'aiming') {
    S.gameState = 'idle';
    return;
  }

  releaseSling();
}

export function initInput() {
  canvas.addEventListener('mousedown', onDown);
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mouseup', onUp);
  canvas.addEventListener('mouseleave', onUp);
  canvas.addEventListener('touchstart', onDown, { passive: false });
  canvas.addEventListener('touchmove', onMove, { passive: false });
  canvas.addEventListener('touchend', onUp, { passive: false });
  canvas.addEventListener('touchcancel', onUp, { passive: false });
}
