/*
  File: core/ui.js
  Project: Demolisher
  Purpose: All DOM UI: element handles, level picker (localStorage last / best), HUD numbers,
           hint toast, overlay cards (menu / paused / dead / won), and the button, picker and
           card-tap listeners. Game rules live in modes.js; touch sticks and keys in input.js.
  Plain script (no modules): top-level const / let / function share one global scope with the
  other core/*.js files, loaded in the order listed in demolisher.html.
  Uses: state.js .. modes.js.
*/

'use strict';

/* ============================================================
   UI ELEMENTS
   ============================================================ */

/* HP number. */
const hudHp = document.getElementById('hud-hp');
/* Score number. */
const hudScore = document.getElementById('hud-score');
/* Remaining targets. */
const hudTargets = document.getElementById('hud-targets');
/* Living enemies. */
const hudEnemies = document.getElementById('hud-enemies');
/* HP chip. Gets class low under 30. */
const statHealth = document.getElementById('stat-health');
/* Ammo labels keyed by weapon id. */
const ammoEls = {};
for (const k of WEAPON_ORDER) ammoEls[k] = document.getElementById('ammo-' + k);
/* Weapon bar buttons. */
const weaponBtns = document.querySelectorAll('.weapon');
/* Reset button. Reloads the current mode. */
const resetBtn = document.getElementById('btn-reset');
/* Toast element. */
const hintEl = document.getElementById('hint');
/* Full-stage card. */
const overlay = document.getElementById('overlay');
/* Card title. */
const overlayTitle = document.getElementById('overlay-title');
/* Card body line. */
const overlayLine = document.getElementById('overlay-line');
/* Controls line. */
const overlayKeys = document.getElementById('overlay-keys');
/* Primary card button. */
const overlayBtn = document.getElementById('overlay-btn');
/* Secondary card button. */
const overlayBtn2 = document.getElementById('overlay-btn2');
/* Level picker (menu card). */
const levelPick = document.getElementById('level-pick');
const levelInput = document.getElementById('lvl-input');
const levelPrevBtn = document.getElementById('lvl-prev');
const levelNextBtn = document.getElementById('lvl-next');
const levelGoBtn = document.getElementById('lvl-go');
const levelInfo = document.getElementById('lvl-info');

/* ============================================================
   LEVEL PICKER: last level + best score per level in localStorage
   ============================================================ */

const LAST_KEY = 'demolisher.level';        // "00".."30"
const BEST_KEY = 'demolisher.best';         // { "07": score, ... }
function loadLastLevel() {
  try {
    const v = localStorage.getItem(LAST_KEY);
    if (/^\d{1,3}$/.test(v || '') && SEED.isLevelNumber(parseInt(v, 10))) return parseInt(v, 10);
  } catch (_) { /* storage blocked */ }
  return 0;
}
function saveLastLevel(n) { try { localStorage.setItem(LAST_KEY, SEED.pad2(n)); } catch (_) { /* ignore */ } }
function readBest() {
  try { const o = JSON.parse(localStorage.getItem(BEST_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (_) { return {}; }
}
function bestFor(n) { const v = readBest()[SEED.pad2(n)]; return Number.isFinite(v) && v > 0 ? v : 0; }
/* True when this score beats the stored best (then it is stored). */
function recordBest(n, sc) {
  if (!(sc > 0) || sc <= bestFor(n)) return false;
  const o = readBest(); o[SEED.pad2(n)] = sc;
  try { localStorage.setItem(BEST_KEY, JSON.stringify(o)); } catch (_) { /* ignore */ }
  return true;
}

/* Picker value, arrows and the info line follow levelNo. */
function syncPicker() {
  if (document.activeElement !== levelInput) levelInput.value = SEED.pad2(levelNo);
  levelPrevBtn.disabled = levelNo <= 0;
  levelNextBtn.disabled = levelNo >= SEED.MAX_LEVEL;
  const best = bestFor(levelNo), n = SEED.pad2(levelNo);
  levelInfo.textContent = levelNo === 0 ? TX.levelDemo : best ? fmt(TX.levelInfo, { n, best }) : fmt(TX.levelInfoNone, { n });
}
let pickerFlagTimer = 0;
function flagBadLevel(msg) {
  levelPick.classList.add('bad');
  levelInfo.textContent = fmt(msg, { max: SEED.MAX_LEVEL });
  clearTimeout(pickerFlagTimer);
  pickerFlagTimer = setTimeout(() => { levelPick.classList.remove('bad'); syncPicker(); }, 1600);
}
/* Accept a typed 0-30 (or flag it); the field always snaps back to a valid number. */
function commitLevelInput() {
  const v = levelInput.value.trim(), junk = levelInput.dataset.junk === '1';
  levelInput.dataset.junk = '';
  if (!junk && /^\d{1,3}$/.test(v) && SEED.isLevelNumber(parseInt(v, 10))) { levelNo = parseInt(v, 10); saveLastLevel(levelNo); levelPick.classList.remove('bad'); }
  else flagBadLevel(junk ? TX.levelBadDigits : v === '' ? TX.levelBadEmpty : TX.levelBadRange);
  levelInput.value = SEED.pad2(levelNo);
  if (!levelPick.classList.contains('bad')) syncPicker();
}

/* ============================================================
   HUD AND OVERLAY
   ============================================================ */

function targetsLeft() { return targets.filter(t => !t.destroyed).length; }
function enemiesLeft() { return enemies.filter(e => e.alive).length; }

/*
  Push HP, score, and counts into the chips (and the hub bar).
*/
function updateHud() {
  if (player) {
    hudHp.textContent = Math.max(0, Math.floor(player.hp));
    statHealth.classList.toggle('low', player.hp < 30);
  }
  hudScore.textContent = score;
  hudTargets.textContent = targetsLeft();
  hudEnemies.textContent = enemiesLeft();
  hubSendStats();
}

/*
  Write ammo counts and grey empty weapons.
*/
function updateAmmoUI() {
  for (const k of WEAPON_ORDER) {
    if (ammoEls[k]) ammoEls[k].textContent = ammoRemaining[k] === Infinity ? '∞' : ammoRemaining[k];
  }
  for (const btn of weaponBtns) {
    const ammo = ammoRemaining[btn.dataset.w];
    btn.classList.toggle('empty', ammo !== Infinity && ammo <= 0);
  }
}

/* Hint timer id. */
let hintTimer = 0;

/*
  Show a short toast. duration 0 leaves it up.
*/
function showHint(text, duration) {
  hintEl.textContent = text;
  hintEl.classList.add('show');
  clearTimeout(hintTimer);
  if (duration > 0) hintTimer = setTimeout(() => hintEl.classList.remove('show'), duration);
}

/*
  Hide the card. Play state owns the stage.
*/
function hideOverlay() {
  overlay.classList.add('hidden');
  updatePauseBtn();
}

/* Pause button glyph; hidden while a card is up. */
function updatePauseBtn() {
  if (!btnPause) return;
  btnPause.textContent = gameState === 'paused' ? '▶' : '❚❚';
  btnPause.hidden = !(gameState === 'playing' || gameState === 'paused');
}

/*
  Fill the card from state. Buttons are never removed, only relabeled.
*/
function showOverlay(state) {
  const keysText = IS_TOUCH ? TX.keysTouch : TX.keysPc;
  if (state === 'menu') {
    overlayTitle.textContent = TX.title;
    overlayLine.innerHTML = TX.tagline;
    overlayKeys.textContent = keysText;
    overlayBtn.textContent = TX.sandbox;
    overlayBtn2.textContent = TX.mission;
    syncPicker();
  } else if (state === 'paused') {
    overlayTitle.textContent = TX.paused;
    overlayLine.textContent = currentMode === 'level' ? fmt(TX.levelPaused, { n: SEED.pad2(levelNo), score }) : 'Score: ' + score;
    overlayKeys.textContent = keysText;
    overlayBtn.textContent = TX.resume;
    overlayBtn2.textContent = TX.menu;
  } else if (state === 'dead') {
    overlayTitle.textContent = TX.died;
    overlayLine.textContent = 'Score: ' + score;
    overlayKeys.textContent = TX.endKeys;
    overlayBtn.textContent = TX.retry;
    overlayBtn2.textContent = TX.menu;
  } else if (state === 'won' && currentMode === 'level') {
    const isNew = recordBest(levelNo, score), best = bestFor(levelNo);
    overlayTitle.textContent = fmt(TX.levelClear, { n: SEED.pad2(levelNo) });
    overlayLine.textContent = fmt(TX.levelClearLine, { score, best: isNew ? TX.bestNew : fmt(TX.bestOld, { best }) });
    overlayKeys.textContent = TX.endKeys;
    overlayBtn.textContent = levelNo < SEED.MAX_LEVEL ? TX.nextLevel : TX.playAgain;
    overlayBtn2.textContent = TX.menu;
  } else if (state === 'won' || state === 'exit') {
    overlayTitle.textContent = state === 'exit' ? TX.exit : TX.won;
    overlayLine.textContent = fmt(state === 'exit' ? TX.exitLine : TX.wonLine, { score });
    overlayKeys.textContent = TX.endKeys;
    overlayBtn.textContent = TX.playAgain;
    overlayBtn2.textContent = TX.menu;
  }
  levelPick.hidden = levelInfo.hidden = state !== 'menu';
  overlay.classList.remove('hidden');
  updatePauseBtn();
}

/*
  Rising combat text.
*/
function addFloater(x, y, text, color) {
  floaters.push({ x, y, text, color: color || '#FFD700', life: 0.8, maxLife: 0.8 });
}

/* True while Mission targets remain (the east gate is locked). */
function gateLocked() {
  return currentMode !== 'sandbox' && targetsLeft() > 0;
}

/*
  Death, mission-clear and east-gate checks.
*/
function checkGameConditions() {
  if (!player || gameState !== 'playing') return;
  if (player.hp <= 0) {
    gameState = 'dead';
    clearInput();
    hubRumble(RUMBLE.death);
    showOverlay('dead');
    return;
  }
  if (currentMode !== 'sandbox' && targets.length > 0 && targets.every(t => t.destroyed)) {
    gameState = 'won';
    clearInput();
    hubRumble(RUMBLE.missionComplete);
    showOverlay('won');
    return;
  }
  if (player.body.position.y > WORLD_H - 30) {
    Body.setPosition(player.body, { x: player.body.position.x, y: WORLD_H - 80 });
    Body.setVelocity(player.body, { x: player.body.velocity.x, y: 0 });
  }
  const gateX = WORLD_W - 40;
  if (gateLocked() && player.body.position.x > gateX - 30) {
    // Locked: push back and say why
    Body.setPosition(player.body, { x: gateX - 30, y: player.body.position.y });
    Body.setVelocity(player.body, { x: Math.min(0, player.body.velocity.x), y: player.body.velocity.y });
    const now = performance.now();
    if (now - lastGateHint > 1500) {
      lastGateHint = now;
      showHint(fmt(TX.gateLocked, { n: targetsLeft() }), 1600);
    }
    return;
  }
  if (player.body.position.x > gateX) {
    Body.setPosition(player.body, { x: gateX, y: player.body.position.y });
    Body.setVelocity(player.body, { x: 0, y: player.body.velocity.y });
    gameState = 'exit';
    clearInput();
    showOverlay('exit');
  }
}

/* ============================================================
   UI LISTENERS
   ============================================================ */

for (const btn of weaponBtns) {
  btn.addEventListener('click', () => selectWeapon(btn.dataset.w));
}
resetBtn.addEventListener('click', () => {
  if (gameState !== 'menu') newGame();
});
if (btnPause) btnPause.addEventListener('click', togglePause);
overlayBtn.addEventListener('click', () => {
  if (gameState === 'menu') startMode('sandbox');
  else primaryAction();
});
overlayBtn2.addEventListener('click', () => {
  if (gameState === 'menu') startMode('mission');
  else toMenu();
});
/* Level picker: arrows, typed number (Enter / leaving the box), LEVEL starts it. */
const stepLevel = (d) => { levelNo = Math.max(0, Math.min(SEED.MAX_LEVEL, levelNo + d)); saveLastLevel(levelNo); syncPicker(); };
levelPrevBtn.addEventListener('click', () => stepLevel(-1));
levelNextBtn.addEventListener('click', () => stepLevel(1));
levelGoBtn.addEventListener('click', () => { commitLevelInput(); if (!levelPick.classList.contains('bad')) startMode('level'); });
levelInput.addEventListener('focus', () => { levelInput.dataset.junk = ''; levelInput.select(); });
levelInput.addEventListener('input', () => {
  const raw = levelInput.value, digits = raw.replace(/\D/g, '');
  if (digits !== raw) { levelInput.value = digits; levelInput.dataset.junk = '1'; flagBadLevel(TX.levelBadDigits); }
});
levelInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); commitLevelInput(); levelInput.blur(); if (!levelPick.classList.contains('bad')) startMode('level'); }
  else if (e.key === 'Escape') { levelInput.dataset.junk = ''; levelInput.value = SEED.pad2(levelNo); levelPick.classList.remove('bad'); levelInput.blur(); }
});
levelInput.addEventListener('blur', () => {
  if (gameState === 'menu' && (levelInput.dataset.junk === '1' || levelInput.value !== SEED.pad2(levelNo))) commitLevelInput();
});
/* Buttons never keep focus: Enter / Space must not click them again (RESET!). */
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('button');
  if (b) b.blur();
});
/* Tap the card (not a button) = start / resume / play again. */
let cardTap = null;
overlay.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button, .level-pick')) return;
  cardTap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
});
overlay.addEventListener('pointerup', (e) => {
  const t = cardTap; cardTap = null;
  if (!t || t.id !== e.pointerId || e.target.closest('button, .level-pick')) return;
  if (performance.now() - t.t <= TOUCH.tapMaxMs && Math.hypot(e.clientX - t.x, e.clientY - t.y) <= TOUCH.tapMaxMovePx) primaryAction();
});
