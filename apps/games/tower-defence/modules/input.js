/*
  File: modules/input.js
  Project: tower-defence
  Purpose: Pointer, keyboard, and toolbar wiring.
           Placement rules match the original single-file game.
*/

import { COLS, ROWS, TOWER_TYPES } from './config.js';
import { TILE, isPathTile } from './path.js';
import * as state from './state.js';
import { makeTower, upgradeTower, sellTower, getUpgradeCost, getSellValue } from './towers.js';

/* Hint hide timer. */
let hintTimer = 0;

/*
  Bind DOM controls. callbacks: { canvas, CW, CH, showHint, updateHud, togglePause, cycleSpeed, startGame }
  CW and CH are getters so resize stays correct: callbacks.getSize().
*/
export function bindInput(ui, callbacks) {
  const { canvas, toolbarBtns, upgradeBtn, sellBtn, speedBtn, pauseBtn, overlayBtn, hintEl } = ui;

  /* Map a pointer event to logical canvas pixels. */
  function canvasCoords(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const size = callbacks.getSize();
    return {
      x: (clientX - rect.left) * (size.CW / rect.width),
      y: (clientY - rect.top) * (size.CH / rect.height)
    };
  }

  /* Place, select, or clear selection. */
  function handlePointerDown(clientX, clientY) {
    if (state.gameState !== 'playing') return;
    const { x, y } = canvasCoords(clientX, clientY);
    const tc = Math.floor(x / TILE);
    const tr = Math.floor(y / TILE);
    if (tc < 0 || tc >= COLS || tr < 0 || tr >= ROWS) return;

    if (state.selectedBuildType) {
      const def = TOWER_TYPES[state.selectedBuildType];
      if (state.gold < def.cost) { callbacks.showHint('Not enough gold'); return; }
      if (isPathTile(tc, tr)) { callbacks.showHint('Cannot build on path'); return; }
      if (state.towers.some(t => t.c === tc && t.r === tr)) { callbacks.showHint('Already a tower here'); return; }
      state.addGold(-def.cost);
      state.towers.push(makeTower(tc, tr, state.selectedBuildType));
      state.setSelectedBuildType(null);
      callbacks.updateHud();
      return;
    }

    const clicked = state.towers.find(t => t.c === tc && t.r === tr);
    if (clicked) {
      state.setSelectedTower(clicked);
      callbacks.updateHud();
      return;
    }
    state.setSelectedTower(null);
    callbacks.updateHud();
  }

  /* Arm or toggle a tower type for placement. */
  function selectBuild(type) {
    if (state.gameState !== 'playing') return;
    if (state.gold < TOWER_TYPES[type].cost) { callbacks.showHint('Not enough gold'); return; }
    if (state.selectedBuildType === type) {
      state.setSelectedBuildType(null);
    } else {
      state.setSelectedBuildType(type);
      state.setSelectedTower(null);
      callbacks.showHint(`Tap a grass tile to build ${TOWER_TYPES[type].name}`);
    }
    callbacks.updateHud();
  }

  canvas.addEventListener('mousedown', (e) => handlePointerDown(e.clientX, e.clientY));
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.touches[0];
    handlePointerDown(t.clientX, t.clientY);
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.key === '1') selectBuild('gun');
    else if (e.key === '2') selectBuild('cannon');
    else if (e.key === '3') selectBuild('frost');
    else if (e.key === 'Escape') {
      state.setSelectedBuildType(null);
      state.setSelectedTower(null);
      callbacks.updateHud();
    } else if (e.key === ' ') {
      e.preventDefault();
      callbacks.togglePause();
    } else if (e.key.toLowerCase() === 'u' && state.selectedTower) {
      if (upgradeTower(state.selectedTower)) callbacks.updateHud();
    } else if (e.key.toLowerCase() === 's' && state.selectedTower) {
      sellTower(state.selectedTower);
      callbacks.updateHud();
    } else if (e.key.toLowerCase() === 'f') {
      callbacks.cycleSpeed();
    }
  });

  for (const btn of toolbarBtns) {
    btn.addEventListener('click', () => selectBuild(btn.dataset.tower));
  }
  upgradeBtn.addEventListener('click', () => {
    if (state.selectedTower && upgradeTower(state.selectedTower)) callbacks.updateHud();
  });
  sellBtn.addEventListener('click', () => {
    if (state.selectedTower) {
      sellTower(state.selectedTower);
      callbacks.updateHud();
    }
  });
  speedBtn.addEventListener('click', () => callbacks.cycleSpeed());
  pauseBtn.addEventListener('click', () => callbacks.togglePause());
  overlayBtn.addEventListener('click', () => {
    if (state.gameState === 'paused') callbacks.togglePause();
    else callbacks.startGame();
  });

  /* Keep hintEl referenced so the binder owns the node. */
  hintTimer = hintEl ? 0 : 0;
}

/*
  Enable or disable toolbar buttons from current gold and selection.
*/
export function refreshTowerButtons(ui) {
  for (const btn of ui.toolbarBtns) {
    const type = btn.dataset.tower;
    const cost = TOWER_TYPES[type].cost;
    btn.disabled = state.gold < cost || state.gameState === 'gameover' || state.gameState === 'paused';
    btn.classList.toggle('active', state.selectedBuildType === type);
  }
  if (state.selectedTower) {
    const uc = getUpgradeCost(state.selectedTower);
    ui.upgradeBtn.textContent = `UP $${uc}`;
    ui.upgradeBtn.disabled = state.gold < uc;
    ui.sellBtn.textContent = `SELL $${getSellValue(state.selectedTower)}`;
    ui.sellBtn.disabled = false;
  } else {
    ui.upgradeBtn.textContent = 'UPGRADE';
    ui.upgradeBtn.disabled = true;
    ui.sellBtn.textContent = 'SELL';
    ui.sellBtn.disabled = true;
  }
}
