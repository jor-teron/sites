/*
 * Project: notebook
 * File: nb_float.js
 * Role: Floating button gestures (pointer events + pointer capture, works on Android Chrome):
 *   tap = nothing; HOLD still ~500 ms = quick menu popup (nb_popup.js);
 *   release past 1/3 of the screen ("armed", jelly glows), book style: drag LEFT = next page,
 *   RIGHT = previous, UP = pages grid, DOWN = crumple (+1 level). "Swap gestures" on page 49
 *   flips left<->right and up<->down (gestureFor in nb_store.js).
 *   Shorter pulls = jelly play only. Horizontal drags drive the page curl (nb_curl.js).
 */
// Visual feedback (floatFollow / floatRelease / floatShake / floatPress) lives in nb_jelly.js;
// no-op stand-ins below keep gestures working if that file failed to load.
if (typeof floatFollow !== 'function') { window.floatFollow = function () {}; window.floatRelease = function () {}; window.floatShake = function () {}; window.floatPress = function () {}; window.floatArm = function () {}; }

// Floating button gesture state
let floatStartX = 0;
let floatStartY = 0;
let floatStartTime = 0;
let floatMoved = false;
let floatHoldTimer = null;     // hold → popup
let floatPointer = null;

const FLOAT_SLOP = 15;         // px of jitter allowed for tap / hold
const HOLD_MS = 500;

function armDistance() { return Math.min(window.innerWidth, window.innerHeight) / 3; }

// Which action a release at (dx, dy) would fire ('' = none).
function floatAction(dx, dy) {
  const need = armDistance();
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (Math.abs(dx) >= need) return gestureFor(dx > 0 ? 'right' : 'left');
  } else if (Math.abs(dy) >= need) {
    return gestureFor(dy < 0 ? 'up' : 'down');
  }
  return '';
}

function stopHold() {
  if (floatHoldTimer) { clearTimeout(floatHoldTimer); floatHoldTimer = null; }
}

// Held still for HOLD_MS: quick menu.
let floatHeld = false;
function startHold() {
  stopHold();
  floatHeld = false;
  floatHoldTimer = setTimeout(() => {
    floatHoldTimer = null;
    floatHeld = true;
    floatShake();
    openPopup();
  }, HOLD_MS);
}

function onFloatDown(e) {
  e.preventDefault();
  e.stopPropagation();
  if (floatStartTime) return;              // second finger: ignore
  floatPointer = e.pointerId;
  try { floatBtn.setPointerCapture(e.pointerId); } catch (_) { /* old browser */ }
  floatStartX = e.clientX;
  floatStartY = e.clientY;
  floatStartTime = Date.now();
  floatMoved = false;
  floatPress();
  startHold();
}

function onFloatMove(e) {
  if (!floatStartTime || e.pointerId !== floatPointer) return;
  e.preventDefault();
  const dx = e.clientX - floatStartX;
  const dy = e.clientY - floatStartY;
  if (!floatMoved && Math.hypot(dx, dy) > FLOAT_SLOP && !floatHeld) {
    floatMoved = true;                     // became a drag: no popup
    stopHold();
  }
  if (!floatMoved) return;                 // jitter while holding: ignore
  floatFollow(dx, dy);
  floatArm(!!floatAction(dx, dy));
  // page curl follows horizontal swipes (book style: left = next, right = previous; swappable)
  if (Math.abs(dx) > Math.abs(dy)) curlUpdate(gestureFor(dx > 0 ? 'right' : 'left'), Math.abs(dx) / armDistance());
  else curlUpdate('', 0);
}

function onFloatUp(e) {
  if (!floatStartTime || (e && e.pointerId !== floatPointer)) return;
  stopHold();
  const dx = e.clientX - floatStartX;
  const dy = e.clientY - floatStartY;
  floatStartTime = 0;
  floatPointer = null;
  floatRelease();
  if (floatHeld || !floatMoved) { curlFinish(false); return; }   // hold = popup open; tap = nothing
  const act = floatAction(dx, dy);
  if (act === 'next' || act === 'prev') {
    const base = curlFrom >= 0 ? curlFrom : currentPage;   // during a curl the target is already shown
    const to = base + (act === 'next' ? 1 : -1);
    curlFinish(true, () => goToPage(to));
    return;
  }
  curlFinish(false);
  if (act === 'grid') openPagesGrid();
  else if (act === 'crumple') { crumblePage(); floatShake(); }
}

// Pointer cancelled (system gesture, etc.): stop everything, spring home.
function onFloatCancel() {
  stopHold();
  curlFinish(false);
  floatStartTime = 0;
  floatPointer = null;
  floatRelease();
}
