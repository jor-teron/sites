/*
  File: core/hud.js
  Project: Demolisher
  Purpose: Level picker (localStorage last / best), HUD numbers, hint, toast, overlay cards.
  Plain script (no modules): top-level const / let / function share one global scope with the
  other core/*.js files, loaded in the order listed in demolisher.html.
  Uses: state.js .. modes.js.
*/

'use strict';

/* ============================================================
   LEVEL PICKER (DM1a): last level + best score per level in localStorage
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
