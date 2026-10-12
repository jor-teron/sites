/*
 * Project: notebook
 * File: nb_float.js
 * Role: Floating button gestures: tap = page toast, hold = settings, swipe left/right = page, pull down = grid, scribble = crumble.
 */
// Floating button gesture state
let floatStartX = 0;
let floatStartY = 0;
let floatStartTime = 0;
let floatMoved = false;
let floatPath = [];
let floatHoldTimer = null;

function onFloatDown(e) {
  e.preventDefault();
  e.stopPropagation();
  const pt = e.touches ? e.touches[0] : e;
  floatStartX = pt.clientX;
  floatStartY = pt.clientY;
  floatStartTime = Date.now();
  floatMoved = false;
  floatPath = [{x: pt.clientX, y: pt.clientY}];
  floatHoldTimer = setTimeout(() => {
    if (!floatMoved) openSettings();
  }, 550);
}

function onFloatMove(e) {
  if (!floatStartTime) return;
  const pt = e.touches ? e.touches[0] : e;
  const dx = pt.clientX - floatStartX;
  const dy = pt.clientY - floatStartY;
  floatPath.push({x: pt.clientX, y: pt.clientY});
  if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
    floatMoved = true;
    if (floatHoldTimer) clearTimeout(floatHoldTimer);
  }
}

function onFloatUp(e) {
  if (floatHoldTimer) clearTimeout(floatHoldTimer);
  if (!floatStartTime) return;
  const pt = e.changedTouches ? e.changedTouches[0] : e;
  const dx = pt.clientX - floatStartX;
  const dy = pt.clientY - floatStartY;
  const dt = Date.now() - floatStartTime;
  floatStartTime = 0;

  if (!floatMoved && dt < 350) {
    showPageToast();
    return;
  }

  // Detect random drag (crumble) vs directional pulls
  const isRandom = floatPath.length > 8 && isPathRandom(floatPath);
  if (isRandom && (Math.abs(dx) > 30 || Math.abs(dy) > 30)) {
    crumblePage();
    return;
  }

  // Directional gestures
  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
    if (dx > 0) goToPage(currentPage + 1);
    else goToPage(currentPage - 1);
  } else if (dy > 50 && Math.abs(dy) > Math.abs(dx)) {
    openPagesGrid();
  }
}

// Simple random path detector (direction changes)
function isPathRandom(path) {
  if (path.length < 6) return false;
  let changes = 0;
  for (let i = 2; i < path.length; i++) {
    const dx1 = path[i-1].x - path[i-2].x;
    const dy1 = path[i-1].y - path[i-2].y;
    const dx2 = path[i].x - path[i-1].x;
    const dy2 = path[i].y - path[i-1].y;
    const dot = dx1*dx2 + dy1*dy2;
    if (dot < 0) changes++;
  }
  return changes >= 2;
}
