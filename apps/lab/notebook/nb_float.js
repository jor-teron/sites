/*
 * Project: notebook
 * File: nb_float.js
 * Role: Floating button gestures (fire on RELEASE, only past 1/3 of the screen = "armed", jelly glows):
 *   tap = page toast, hold = settings, swipe right / left = next / previous page,
 *   pull UP = pages grid (pull down does nothing), short pulls = jelly play only.
 *   Circle crumple: circling the finger around the button home adds wrinkles live —
 *   1.25 turns = first (mini) crumple, then +1 level every further 0.5 turn, jiggle each time.
 *   Circling cancels the swipe / pull action on release.
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
let floatHoldTimer = null;
// circle crumple state
let floatCX = 0, floatCY = 0;      // button home centre
let floatLastAng = null;           // last finger angle around home (radians)
let floatTurnSum = 0;              // cumulative signed angle
let floatCrumples = 0;             // levels added during this drag
let floatCircled = false;          // circling → no swipe/pull action on release

const FLOAT_HOLD_MS = 550;
const CIRCLE_FIRST = 1.25;         // turns for the first (mini) crumple
const CIRCLE_STEP = 0.5;           // further turns per extra level
const CIRCLE_MIN_R = 18;           // ignore angle noise right on the centre

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

function onFloatDown(e) {
  e.preventDefault();
  e.stopPropagation();
  const pt = e.touches ? e.touches[0] : e;
  floatStartX = pt.clientX;
  floatStartY = pt.clientY;
  floatStartTime = Date.now();
  floatMoved = false;
  const r = floatBtn.getBoundingClientRect();
  floatCX = r.left + r.width / 2;
  floatCY = r.top + r.height / 2;
  floatLastAng = null;
  floatTurnSum = 0;
  floatCrumples = 0;
  floatCircled = false;
  try { floatBtn.setPointerCapture(e.pointerId); } catch (_) { /* old browser */ }
  floatPress();
  floatHoldTimer = setTimeout(() => {
    if (!floatMoved) openSettings();
  }, FLOAT_HOLD_MS);
}

function onFloatMove(e) {
  if (!floatStartTime) return;
  const pt = e.touches ? e.touches[0] : e;
  const dx = pt.clientX - floatStartX;
  const dy = pt.clientY - floatStartY;
  floatFollow(dx, dy);
  if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
    floatMoved = true;
    if (floatHoldTimer) clearTimeout(floatHoldTimer);
  }
  trackCircle(pt.clientX - floatCX, pt.clientY - floatCY);
  floatArm(!floatCircled && !!floatAction(dx, dy));
}

// Add up the signed angle around home; crumple live at 1.25 turns, then every 0.5 turn.
function trackCircle(rx, ry) {
  if (Math.hypot(rx, ry) < CIRCLE_MIN_R) return;
  const a = Math.atan2(ry, rx);
  if (floatLastAng !== null) {
    let d = a - floatLastAng;
    if (d > Math.PI) d -= 2 * Math.PI;
    else if (d < -Math.PI) d += 2 * Math.PI;
    floatTurnSum += d;
  }
  floatLastAng = a;
  const turns = Math.abs(floatTurnSum) / (2 * Math.PI);
  if (turns >= 0.75) floatCircled = true;
  const want = turns >= CIRCLE_FIRST ? 1 + Math.floor((turns - CIRCLE_FIRST) / CIRCLE_STEP) : 0;
  while (floatCrumples < want) {
    floatCrumples++;
    crumblePage();
    floatShake();
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
  floatRelease();

  if (!floatMoved && dt < 350) {
    showPageToast();
    return;
  }
  if (floatCircled) return;          // circling = crumple only

  const act = floatAction(dx, dy);
  if (act === 'next') goToPage(currentPage + 1);
  else if (act === 'prev') goToPage(currentPage - 1);
  else if (act === 'grid') openPagesGrid();
}
