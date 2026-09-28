/*
 * AR Theme Game — main entry (ES module).
 * Overlay mode: camera <video> + transparent Three.js canvas (all browsers).
 * WebXR mode: immersive-ar with hit-test + dom-overlay (Android Chrome/ARCore).
 */
import { AR_GAME_CONFIG } from "./ar-game_config.js";
import { startCamera, stopCamera } from "./js/camera.js";
import { view, initRenderer, setTarget, hitTestScreen } from "./js/ar.js";
import { isArSupported, startAr, endAr, isPresenting, isPlaced, wrapForAr, respawnNearby, updateXr } from "./js/xr.js";
import { prefetchPets, loadSavedPetId, savePetId } from "./js/pets.js";
import { PetTheme } from "./js/themes/pet.js";
import { ZombieTheme } from "./js/themes/zombie.js";
import { GhostTheme } from "./js/themes/ghost.js";

const THEMES = { pet: PetTheme, zombie: ZombieTheme, ghost: GhostTheme };

/** All mutable game state in one object (no top-level globals leak: module scope). */
const game = {
  themeId: AR_GAME_CONFIG.defaultTheme,
  theme: null,
  themeRoot: null,      // theme object (inside AR holder when in XR)
  score: AR_GAME_CONFIG.startScore,
  cameraFailed: false,
  catchT: 0,            // >0 while the catch/happy animation plays
  els: {},
  msgTimer: 0,
  lastingMsg: "",
};

/* ---------------- messages (single timer, lasting message restore) ---------------- */

function showMsg(text, ms) {
  clearMsgTimer();
  const el = game.els.msg;
  el.textContent = text;
  el.style.display = "block";
  if (ms) {
    game.msgTimer = setTimeout(onMsgTimeout, ms);
  } else {
    game.lastingMsg = text;
  }
}

function onMsgTimeout() {
  game.msgTimer = 0;
  const el = game.els.msg;
  if (game.lastingMsg) {
    el.textContent = game.lastingMsg;
    el.style.display = "block";
  } else {
    el.style.display = "none";
  }
}

function clearMsgTimer() {
  if (game.msgTimer) {
    clearTimeout(game.msgTimer);
    game.msgTimer = 0;
  }
}

function hideMsg() {
  clearMsgTimer();
  game.lastingMsg = "";
  game.els.msg.style.display = "none";
}

/* ---------------- theme / pet management ---------------- */

function disposeTarget(old) {
  // `old` is either the theme root (overlay) or an AR holder wrapping it
  const themeRoot = old.userData.themeRoot || old;
  const owner = themeRoot.userData.themeOwner || game.theme;
  if (owner && typeof owner.dispose === "function") owner.dispose(themeRoot);
}

function spawnTarget() {
  const theme = game.theme;
  const root = theme.create();
  root.userData.themeOwner = theme;
  game.themeRoot = root;
  if (isPresenting()) {
    setTarget(wrapForAr(root, theme.height()), disposeTarget);
  } else {
    setTarget(root, disposeTarget);
  }
}

function loadTheme(id) {
  const next = THEMES[id];
  if (!next) return;
  game.themeId = id;
  game.theme = next;
  game.catchT = 0;
  spawnTarget();
  game.els.themeName.textContent = next.label;
  document.querySelectorAll("[data-theme]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-theme") === id);
  });
  game.els.petPicker.hidden = id !== "pet";
}

function selectPet(petId) {
  PetTheme.setPetId(petId);
  savePetId(petId);
  document.querySelectorAll("[data-pet]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-pet") === petId);
  });
  if (game.themeId === "pet") spawnTarget();
}

/* ---------------- catching ---------------- */

function onCatch() {
  if (game.catchT > 0 || !game.themeRoot) return;
  game.score += 1;
  game.els.score.textContent = String(game.score);
  showMsg(game.theme.onCatch(game.themeRoot), AR_GAME_CONFIG.catchMsgMs);
  game.catchT = AR_GAME_CONFIG.catchMsgMs / 1000; // let the happy anim play, then respawn
}

function finishCatch() {
  if (isPresenting()) {
    // Fresh instance (resets anim state), then move it to a nearby spot
    spawnTarget();
    respawnNearby();
  } else {
    spawnTarget();
  }
}

function onPointerDown(ev) {
  if (isPresenting()) return; // XR uses 'select'
  if (hitTestScreen(ev.clientX, ev.clientY)) onCatch();
}

/* ---------------- WebXR ---------------- */

async function toggleAr() {
  if (isPresenting()) {
    endAr();
    return;
  }
  try {
    await startAr(game.els.uiRoot, {
      onStart: onArStart,
      onEnd: onArEnd,
      onPlace: () => showMsg(AR_GAME_CONFIG.text.arCatch, 1500),
      onSelectHit: onCatch,
    });
  } catch (err) {
    console.error("[ar-game] AR session failed:", err);
    showMsg(AR_GAME_CONFIG.text.arUnsupported, 2000);
  }
}

function onArStart() {
  // XR provides camera passthrough — stop and hide our own camera
  stopCamera();
  game.els.video.classList.add("xr-hidden");
  game.els.arBtn.textContent = "Exit AR";
  game.els.arBtn.classList.add("active");
  game.lastingMsg = ""; // "camera blocked" doesn't apply inside XR
  showMsg(AR_GAME_CONFIG.text.arPlace);
  spawnTarget(); // rebuild at AR scale inside a holder (hidden until placed)
}

async function onArEnd() {
  game.els.arBtn.textContent = "Enter AR";
  game.els.arBtn.classList.remove("active");
  game.els.video.classList.remove("xr-hidden");
  hideMsg();
  spawnTarget(); // back to overlay-scale target
  await tryStartCamera();
}

/* ---------------- boot / loop ---------------- */

async function tryStartCamera() {
  try {
    await startCamera(game.els.video);
    game.cameraFailed = false;
    hideMsg();
  } catch (err) {
    game.cameraFailed = true;
    showMsg(AR_GAME_CONFIG.text.cameraBlocked);
    console.error(err);
  }
}

function frame(_time, xrFrame) {
  const dt = Math.min(0.1, view.clock.getDelta());
  const root = game.themeRoot;

  if (game.catchT > 0) {
    game.catchT -= dt;
    if (game.catchT <= 0) {
      game.catchT = 0;
      finishCatch();
    }
  }

  if (isPresenting()) {
    updateXr(xrFrame, dt, game.theme, game.catchT > 0);
  } else if (root && game.theme) {
    game.theme.update(root, dt);
  }
  view.renderer.render(view.scene, view.camera);
}

async function boot() {
  const $ = (id) => document.getElementById(id);
  game.els = {
    uiRoot: $("ui-root"),
    video: $("camera"),
    canvas: $("view"),
    score: $("score"),
    themeName: $("theme-name"),
    msg: $("msg"),
    petPicker: $("pet-picker"),
    arBtn: $("ar-btn"),
  };

  initRenderer(game.els.canvas);
  prefetchPets();

  // Restore saved pet before first spawn
  const savedPet = loadSavedPetId();
  PetTheme.setPetId(savedPet);
  document.querySelectorAll("[data-pet]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-pet") === savedPet);
    btn.addEventListener("click", () => selectPet(btn.getAttribute("data-pet")));
  });

  document.querySelectorAll("[data-theme]").forEach((btn) => {
    btn.addEventListener("click", () => loadTheme(btn.getAttribute("data-theme")));
  });

  // UI taps inside the XR dom-overlay must not also fire an XR 'select'
  [game.els.petPicker, $("themes"), game.els.arBtn].forEach((el) => {
    el.addEventListener("beforexrselect", (ev) => ev.preventDefault());
  });

  game.els.canvas.addEventListener("pointerdown", onPointerDown);
  game.els.arBtn.addEventListener("click", toggleAr);

  loadTheme(AR_GAME_CONFIG.defaultTheme);
  view.renderer.setAnimationLoop(frame);

  await tryStartCamera();

  if (await isArSupported()) {
    game.els.arBtn.hidden = false;
  }
}

// Module scripts are deferred, so the DOM is ready here.
boot();
window.addEventListener("pagehide", () => {
  if (!isPresenting()) stopCamera();
});

// Debug hook for automated checks (read-only snapshot)
window.__arGame = {
  state: () => ({
    theme: game.themeId,
    pet: PetTheme.getPetId(),
    score: game.score,
    xr: isPresenting(),
    placed: isPlaced(),
    hasModel: !!(game.themeRoot && game.themeRoot.userData.model),
    hasMixer: !!(game.themeRoot && game.themeRoot.userData.mixer),
    anim: game.themeRoot ? game.themeRoot.userData.animState : null,
  }),
};
