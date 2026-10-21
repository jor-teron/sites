/* Neon Raid — boot: rAF loop and UI wiring. */

/* ---------- loop ---------- */

/** Last timestamp for dt. */
var lastTs = 0;

/**
 * rAF loop.
 */
function loop(ts) {
  if (!lastTs) lastTs = ts;
  var dt = Math.min(CFG.maxDt, (ts - lastTs) / 1000);
  lastTs = ts;
  pollGamepad();
  if (state && state.running) step(dt);
  draw();
  requestAnimationFrame(loop);
}

/* ---------- boot ---------- */

/**
 * Start a match from the selected duration.
 */
function startGame() {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  clearKeys();
  var sel = document.getElementById("duration");
  var dur = parseInt(sel.value, 10) || DEFAULT_DURATION;
  state = newState(dur);
  document.getElementById("menu").classList.add("hidden");
  document.getElementById("overlay").classList.add("hidden");
  updateHud();
  syncChrome();
}

/**
 * Back to the start menu (from the end screen or a running / paused match).
 */
function showMenu() {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  if (state) { state.running = false; state.paused = false; }
  clearKeys();
  document.getElementById("overlay").classList.add("hidden");
  document.getElementById("menu").classList.remove("hidden");
  syncChrome();
}

/**
 * Pause / resume a running match.
 */
function togglePause() {
  if (!state) return;
  if (state.paused) {
    state.paused = false;
    state.running = true;
  } else if (state.running) {
    state.paused = true;
    state.running = false;
    clearKeys();
  }
  syncChrome();
}

/**
 * Wire UI and start the render loop.
 */
function init() {
  canvas = document.getElementById("game");
  ctx = canvas.getContext("2d");
  buildSprites();
  bindInput();
  bindTouch();
  bindHub();
  detectTouch();
  document.getElementById("startBtn").addEventListener("click", startGame);
  document.getElementById("retryBtn").addEventListener("click", startGame);
  document.getElementById("menuBtn").addEventListener("click", showMenu);
  requestAnimationFrame(loop);
}

init();
