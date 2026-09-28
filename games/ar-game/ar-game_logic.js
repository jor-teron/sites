/*
 * AR Theme Game — Main app (ar-game_logic.js)
 * Starts camera, loads default theme, handles taps and DLC switch.
 * Tunables come from AR_GAME_CONFIG (ar-game_config.js).
 */

/**
 * Registry of all theme packs.
 * Pet is the default. Zombie and Ghost are DLC stubs.
 */
const THEMES = {
  pet: PetTheme,
  zombie: ZombieTheme,
  ghost: GhostTheme
};

/**
 * Currently loaded theme object
 */
let activeTheme = null;

/**
 * Catch / blast / find score
 */
let score = AR_GAME_CONFIG.startScore;

/**
 * HUD score node
 */
let scoreEl = null;

/**
 * HUD theme name node
 */
let themeEl = null;

/**
 * Center message node
 */
let msgEl = null;

/**
 * Pending auto-hide timer for a temporary message (0 = none)
 */
let msgTimer = 0;

/**
 * Lasting message (e.g. "Camera blocked…") restored after a temporary
 * message hides. Empty string = nothing to restore.
 */
let lastingMsg = "";

/**
 * Boot the game after the DOM is ready.
 */
async function boot() {
  // Cache HUD nodes
  const video = document.getElementById("camera");
  const canvas = document.getElementById("view");
  scoreEl = document.getElementById("score");
  themeEl = document.getElementById("theme-name");
  msgEl = document.getElementById("msg");

  initAR(canvas);

  try {
    await startCamera(video);
    hideMsg();
  } catch (err) {
    showMsg(AR_GAME_CONFIG.text.cameraBlocked);
    console.error(err);
  }

  // Default theme is Pet
  loadTheme(AR_GAME_CONFIG.defaultTheme);

  // Tap / click to catch the target
  canvas.addEventListener("pointerdown", onTap);

  // Theme / DLC buttons
  document.querySelectorAll("[data-theme]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      loadTheme(btn.getAttribute("data-theme"));
    });
  });

  loop();
}

/**
 * Swap the active DLC pack and rebuild the target.
 * @param {string} id - pet | zombie | ghost
 */
function loadTheme(id) {
  const next = THEMES[id];
  if (!next) {
    return;
  }

  activeTheme = next;
  setTarget(next.create());
  themeEl.textContent = next.label;

  // Highlight the active DLC button
  document.querySelectorAll("[data-theme]").forEach(function (btn) {
    btn.classList.toggle("active", btn.getAttribute("data-theme") === id);
  });
}

/**
 * Handle a tap on the overlay. Score if the ray hits the target.
 * @param {PointerEvent} ev
 */
function onTap(ev) {
  if (!activeTheme) {
    return;
  }
  if (hitTest(ev.clientX, ev.clientY)) {
    score += 1;
    scoreEl.textContent = String(score);
    showMsg(activeTheme.onCatch(), AR_GAME_CONFIG.catchMsgMs);
    // Respawn so the player can chase again
    setTarget(activeTheme.create());
  }
}

/**
 * Show a status line.
 * With ms > 0 the message is temporary: it hides after ms, and any lasting
 * message (e.g. "Camera blocked…") comes back. Without ms (or 0) the message
 * is lasting: it stays until replaced and is remembered for restore.
 * Only one auto-hide timer is active at a time.
 * @param {string} text
 * @param {number} [ms] auto-hide delay
 */
function showMsg(text, ms) {
  clearMsgTimer();
  msgEl.textContent = text;
  msgEl.style.display = "block";
  if (ms) {
    msgTimer = setTimeout(onMsgTimeout, ms);
  } else {
    lastingMsg = text;
  }
}

/**
 * Temporary message expired: restore the lasting message, or hide.
 */
function onMsgTimeout() {
  msgTimer = 0;
  if (lastingMsg) {
    msgEl.textContent = lastingMsg;
    msgEl.style.display = "block";
  } else {
    msgEl.style.display = "none";
  }
}

/**
 * Cancel a pending auto-hide timer, if any.
 */
function clearMsgTimer() {
  if (msgTimer) {
    clearTimeout(msgTimer);
    msgTimer = 0;
  }
}

/**
 * Hide the center status line and forget any lasting message.
 */
function hideMsg() {
  clearMsgTimer();
  lastingMsg = "";
  msgEl.style.display = "none";
}

/**
 * Render loop.
 */
function loop() {
  requestAnimationFrame(loop);
  renderFrame(activeTheme);
}

window.addEventListener("load", boot);
window.addEventListener("pagehide", stopCamera);
