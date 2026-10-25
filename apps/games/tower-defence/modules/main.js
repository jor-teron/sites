/*
  File: modules/main.js
  Project: tower-defence
  Purpose: Boot, resize, HUD, overlay, and the frame loop.
           Game rules live in the other modules.
*/

import { COLS, ROWS, BASE_TILE } from './config.js';
import { setTile, buildPath, setPathPoints } from './path.js';
import * as state from './state.js';
import { updateTowers } from './towers.js';
import { updateEnemies } from './enemies.js';
import { updateProjectiles } from './projectiles.js';
import { updateWaves } from './waves.js';
import { render } from './render.js';
import { bindInput, refreshTowerButtons } from './input.js';
import { getMap, mapFromUrl, mapLabel } from './maps.js';
import { lastMap, saveLastMap, saveBestWave, bestWave } from './progress.js';
import { bindPicker } from './picker.js';
import { initTheme } from './themes.js';

/* Canvas element. */
const canvas = document.getElementById('game');

/* 2D context. Transform is set to device pixels in resize. */
const ctx = canvas.getContext('2d');

/* Stage element used to measure available space. */
const stage = document.getElementById('stage');

/* Stats strip and its value nodes. */
const hudEl = document.getElementById('hud');
const timerEl = document.getElementById('hud-timer');
const livesEl = document.getElementById('hud-lives');
const goldEl = document.getElementById('hud-gold');
const waveEl = document.getElementById('hud-wave');
const scoreEl = document.getElementById('hud-score');

/* Overlay nodes. */
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayMsg = document.getElementById('overlay-msg');
const overlayMsg2 = document.getElementById('overlay-msg2');
const overlayBtn = document.getElementById('overlay-btn');

/* Toolbar nodes. */
const toolbarBtns = document.querySelectorAll('.tbtn');
const upgradeBtn = document.getElementById('btn-upgrade');
const sellBtn = document.getElementById('btn-sell');
const speedBtn = document.getElementById('btn-speed');
const pauseBtn = document.getElementById('btn-pause');
const hintEl = document.getElementById('hint');

/* Bundle passed to input.js. */
const ui = { canvas, toolbarBtns, upgradeBtn, sellBtn, speedBtn, pauseBtn, overlayBtn, hintEl };

/* Logical canvas width in CSS pixels. */
let CW = COLS * BASE_TILE;

/* Logical canvas height in CSS pixels. */
let CH = ROWS * BASE_TILE;

/*
  Switch the board to map n (00-99): waypoints, HP bump, saved as last map.
  Only called while no run is active (title / game over).
*/
function selectMap(n) {
  const map = getMap(n);
  state.setMap(map.id, map.hpMul);
  setPathPoints(map.points);
  buildPath();
  saveLastMap(map.id);
  /* Keep the address bar in sync so a link shares the map. */
  try {
    const url = new URL(location.href);
    url.searchParams.set('map', mapLabel(map.id));
    history.replaceState(null, '', url);
  } catch (e) { /* file:// may refuse; harmless */ }
}

/* Hint hide timer id. */
let hintTimer = 0;

/*
  Fit the grid to the stage. Rebuilds the path because tile size changed.
*/
function resize() {
  const rect = stage.getBoundingClientRect();
  const availW = Math.max(100, rect.width - 8);
  const availH = Math.max(100, rect.height - 8);
  const scale = Math.min(availW / (COLS * BASE_TILE), availH / (ROWS * BASE_TILE));
  const tile = Math.max(18, Math.floor(BASE_TILE * scale));
  setTile(tile);
  CW = COLS * tile;
  CH = ROWS * tile;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(CW * dpr);
  canvas.height = Math.floor(CH * dpr);
  canvas.style.width = CW + 'px';
  canvas.style.height = CH + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  buildPath();
  placeHud(tile);
}

/*
  Lay the stats strip over board row 0 and the hint just below it.
  Font scales with the tile but never drops below 11px.
*/
function placeHud(tile) {
  const cr = canvas.getBoundingClientRect();
  const sr = stage.getBoundingClientRect();
  const left = cr.left - sr.left;
  const top = cr.top - sr.top;
  hudEl.style.left = left + 'px';
  hudEl.style.top = top + 'px';
  hudEl.style.width = CW + 'px';
  hudEl.style.height = Math.max(tile, 18) + 'px';
  hudEl.style.fontSize = Math.max(11, Math.min(18, Math.round(tile * 0.5))) + 'px';
  hintEl.style.top = (top + Math.max(tile, 18) + 4) + 'px';
}

/* Last text written to each HUD node, so the DOM is only touched on change. */
const hudCache = new Map();

/* Write text into a node only if it differs from the last write. */
function setText(el, text) {
  if (hudCache.get(el) === text) return;
  hudCache.set(el, text);
  el.textContent = text;
}

/* Right side of the strip: countdown between waves, enemies left during one. */
function timerText() {
  if (state.gameState !== 'playing' && state.gameState !== 'paused') return '';
  if (state.waveActive) {
    return `${state.spawnQueue.length + state.enemies.length} LEFT`;
  }
  if (state.nextWaveIn > 0) return `NEXT WAVE ${state.nextWaveIn.toFixed(1)}s`;
  return '';
}

/*
  Push gold, lives, wave, score, and the wave timer into the strip and
  refresh buttons. Only nodes whose value changed are written.
*/
function updateHud() {
  setText(livesEl, String(Math.max(0, state.lives)));
  setText(goldEl, String(Math.floor(state.gold)));
  setText(waveEl, String(state.wave));
  setText(scoreEl, String(state.score));
  setText(timerEl, timerText());
  timerEl.classList.toggle('active', state.waveActive);
  refreshTowerButtons(ui);
}

/*
  Show a short hint over the canvas.
*/
function showHint(text, duration = 1600) {
  hintEl.textContent = text;
  hintEl.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hintEl.classList.remove('show'), duration);
}

/*
  Fill and show the overlay panel.
*/
function showOverlay(title, msg, msg2, btn, paused = false) {
  overlay.classList.toggle('paused', paused);
  overlayTitle.textContent = title;
  overlayMsg.textContent = msg;
  overlayMsg2.textContent = msg2 || '';
  overlayBtn.textContent = btn;
  overlay.classList.remove('hidden');
}

/* Hide the overlay. */
function hideOverlay() {
  overlay.classList.add('hidden');
}

/*
  End the run and store the best score in localStorage.
*/
function gameOver() {
  state.setGameState('gameover');
  const best = +(localStorage.getItem('td_best') || 0);
  if (state.score > best) localStorage.setItem('td_best', state.score);
  /* Per-map best wave for the picker. */
  const rec = saveBestWave(state.mapId, state.wave);
  showOverlay('GAME OVER', `Map ${mapLabel(state.mapId)}  •  Wave ${state.wave}  •  Score ${state.score}`,
    `${rec ? 'New best wave!' : 'Best wave ' + bestWave(state.mapId)}  •  Best score ${Math.max(best, state.score)}`, 'TRY AGAIN');
  picker.refresh();
  updateHud();
}

/*
  Start a fresh run. First wave begins after the countdown in resetRun.
*/
function startGame() {
  state.resetRun();
  speedBtn.textContent = '1×';
  pauseBtn.textContent = 'PAUSE';
  hideOverlay();
  updateHud();
}

/* Pause or resume. Overlay covers the board while paused. */
function togglePause() {
  if (state.gameState === 'playing') {
    state.setGameState('paused');
    pauseBtn.textContent = 'RESUME';
    showOverlay('PAUSED', 'Game paused', '', 'RESUME', true);
  } else if (state.gameState === 'paused') {
    state.setGameState('playing');
    pauseBtn.textContent = 'PAUSE';
    hideOverlay();
  }
  updateHud();
}

/* Cycle 1x, 2x, 3x. */
function cycleSpeed() {
  if (state.speedMul === 1) state.setSpeedMul(2);
  else if (state.speedMul === 2) state.setSpeedMul(3);
  else state.setSpeedMul(1);
  speedBtn.textContent = state.speedMul + '×';
}

/* Frame cap: at most 30 rendered frames per second. */
const FRAME_MS = 1000 / 30;

/* Small early-fire tolerance so a 60 Hz screen lands on every 2nd vsync. */
const FRAME_SLACK_MS = 1.5;

/* Last rAF timestamp seen, and the time of the last frame actually run. */
let lastTick = performance.now();
let lastStep = lastTick;

/* Time owed toward the next frame. Drift-safe: leftover carries over. */
let frameAcc = 0;

/*
  Frame loop, capped at 30 fps. rAF ticks that come too early are skipped.
  Movement uses real elapsed time (dt), so game speed does not depend on
  the cap or the screen refresh rate. Speed multiplies update steps, not
  the delta itself, matching the original game.
*/
function loop(now) {
  requestAnimationFrame(loop);
  frameAcc += now - lastTick;
  lastTick = now;
  if (frameAcc < FRAME_MS - FRAME_SLACK_MS) return;
  frameAcc -= FRAME_MS;
  /* After a stall (tab hidden, slow frame) do not try to catch up. */
  if (frameAcc > FRAME_MS || frameAcc < -FRAME_MS) frameAcc = 0;

  let dt = (now - lastStep) / 1000;
  lastStep = now;
  if (dt > 0.1) dt = 0.1;
  if (dt < 0) dt = 0;

  if (state.gameState === 'playing') {
    for (let i = 0; i < state.speedMul; i++) {
      updateWaves(dt);
      const ended = updateEnemies(dt);
      if (ended) break;
      updateTowers(dt);
      updateProjectiles(dt);
      state.updateFx(dt);
    }
    updateHud();
  }
  render(ctx, CW, CH);
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 60));

/* Theme from ?theme=<id>, else the saved one, else Meadow. */
initTheme();

/* Map from ?map=NN wins, else the last map played. */
const urlMap = mapFromUrl();
selectMap(urlMap !== null ? urlMap : lastMap());

/* Title row + 00-99 picker. Changing map only happens off-run. */
const picker = bindPicker({
  getMap: () => state.mapId,
  onChange: (n) => { if (state.gameState !== 'playing' && state.gameState !== 'paused') selectMap(n); }
});

state.setOnGameOver(gameOver);
bindInput(ui, {
  getSize: () => ({ CW, CH }),
  showHint,
  updateHud,
  togglePause,
  cycleSpeed,
  startGame
});

resize();
updateHud();

requestAnimationFrame(() => {
  resize();
  requestAnimationFrame(loop);
});
