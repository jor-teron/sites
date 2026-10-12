/*
 * Project: notebook
 * File: nb_float.js
 * Role: Floating button gestures (pointer events + pointer capture, works on Android Chrome):
 *   tap = page toast; swipe right / left past 1/3 of the screen = next / previous page;
 *   pull UP past 1/3 = pages grid (pull down does nothing); shorter pulls = jelly play only;
 *   the jelly glows when a release would fire ("armed").
 *   HOLD (finger still, < FLOAT_SLOP px) = crumple: the jelly shakes, after 500 ms a mini
 *   crumple, then +1 level every 500 ms while held (cap 10). Moving past FLOAT_SLOP cancels the
 *   hold and it becomes a drag. Hold no longer opens settings (settings = card on page 49).
 *   Feedback is the jelly blob (nb_jelly.js); the hit target itself never moves.
 */
// Visual feedback (floatFollow / floatRelease / floatShake / floatPress) lives in nb_jelly.js;
// no-op stand-ins below keep gestures working if that file failed to load.
if (typeof floatFollow !== 'function') { window.floatFollow = function () {}; window.floatRelease = function () {}; window.floatShake = function () {}; window.floatPress = function () {}; window.floatArm = function () {}; }

// Floating button gesture state
let floatStartX = 0;
let floatStartY = 0;
let floatStartTime = 0;
let floatMoved = false;
let floatHoldTimer = null;     // first crumple / repeat timer
let floatShakeTimer = null;    // shaking while held
let floatCrumples = 0;         // levels added by this hold
let floatPointer = null;

const FLOAT_SLOP = 15;         // px of jitter allowed for tap / hold
const HOLD_FIRST_MS = 500;
const HOLD_STEP_MS = 500;

function armDistance() { return Math.min(window.innerWidth, window.innerHeight) / 3; }

// Which action a release at (dx, dy) would fire ('' = none).
function floatAction(dx, dy) {
  const need = armDistance();
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (Math.abs(dx) >= need) return dx > 0 ? 'next' : 'prev';
  } else if (-dy >= need) {
    return 'grid';
  }
  return '';
}

function stopHold() {
  if (floatHoldTimer) { clearTimeout(floatHoldTimer); floatHoldTimer = null; }
  if (floatShakeTimer) { clearInterval(floatShakeTimer); floatShakeTimer = null; }
}

// Held still: shake, then crumple every HOLD_STEP_MS (crumblePage caps at CRUMPLE_MAX).
function startHold() {
  stopHold();
  floatShakeTimer = setInterval(() => floatShake(), 260);
  const step = () => {
    floatCrumples++;
    crumblePage();
    floatShake();
    floatHoldTimer = setTimeout(step, HOLD_STEP_MS);
  };
  floatHoldTimer = setTimeout(step, HOLD_FIRST_MS);
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
  floatCrumples = 0;
  floatPress();
  startHold();
}

function onFloatMove(e) {
  if (!floatStartTime || e.pointerId !== floatPointer) return;
  e.preventDefault();
  const dx = e.clientX - floatStartX;
  const dy = e.clientY - floatStartY;
  if (!floatMoved && Math.hypot(dx, dy) > FLOAT_SLOP && !floatCrumples) {
    floatMoved = true;                     // became a drag: no crumple
    stopHold();
  }
  if (!floatMoved) return;                 // jitter while holding: ignore
  floatFollow(dx, dy);
  floatArm(!!floatAction(dx, dy));
}

function onFloatUp(e) {
  if (!floatStartTime || (e && e.pointerId !== floatPointer)) return;
  stopHold();
  const dx = e.clientX - floatStartX;
  const dy = e.clientY - floatStartY;
  const dt = Date.now() - floatStartTime;
  floatStartTime = 0;
  floatPointer = null;
  floatRelease();
  if (floatCrumples) return;               // a hold crumpled: nothing else
  if (!floatMoved) {
    if (dt < HOLD_FIRST_MS) showPageToast();
    return;
  }
  const act = floatAction(dx, dy);
  if (act === 'next') goToPage(currentPage + 1);
  else if (act === 'prev') goToPage(currentPage - 1);
  else if (act === 'grid') openPagesGrid();
}

// Pointer cancelled (system gesture, etc.): stop everything, spring home.
function onFloatCancel() {
  stopHold();
  floatStartTime = 0;
  floatPointer = null;
  floatRelease();
}
