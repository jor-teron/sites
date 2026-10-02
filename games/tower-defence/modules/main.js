/*
  File: modules/main.js
  Project: tower-defence
  Purpose: Boot, resize, HUD, overlay, and the frame loop.
           Game rules live in the other modules.
*/

import { COLS, ROWS, BASE_TILE } from './config.js';
import { setTile, buildPath } from './path.js';
import * as state from './state.js';
import { updateTowers } from './towers.js';
import { updateEnemies } from './enemies.js';
import { updateProjectiles } from './projectiles.js';
import { updateWaves } from './waves.js';
import { render } from './render.js';
import { bindInput, refreshTowerButtons } from './input.js';

/* Canvas element. */
const canvas = document.getElementById('game');

/* 2D context. Transform is set to device pixels in resize. */
const ctx = canvas.getContext('2d');

/* Stage element used to measure available space. */
const stage = document.getElementById('stage');

/* HUD value nodes. */
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
}

/*
  Push gold, lives, wave, and score into the HUD and refresh buttons.
*/
function updateHud() {
  livesEl.textContent = Math.max(0, state.lives);
  goldEl.textContent = Math.floor(state.gold);
  waveEl.textContent = state.wave;
  scoreEl.textContent = state.score;
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
function showOverlay(title, msg, msg2, btn) {
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
  showOverlay('GAME OVER', `Wave ${state.wave}  •  Score ${state.score}`, `Best ${Math.max(best, state.score)}`, 'TRY AGAIN');
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
    showOverlay('PAUSED', 'Game paused', '', 'RESUME');
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

/* Previous frame timestamp. */
let lastTime = performance.now();

/*
  Frame loop. Speed multiplies update steps, not the delta itself,
  matching the original game.
*/
function loop(now) {
  requestAnimationFrame(loop);
  let dt = (now - lastTime) / 1000;
  lastTime = now;
  if (dt > 0.1) dt = 0.1;

  if (state.gameState === 'playing') {
    for (let i = 0; i < state.speedMul; i++) {
      updateWaves(dt, CW, CH);
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
