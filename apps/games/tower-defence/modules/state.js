/*
  File: modules/state.js
  Project: tower-defence
  Purpose: Mutable run state and tiny FX helpers shared by gameplay modules.
           DOM updates are not done here.
*/

import { START_GOLD, START_LIVES, FIRST_WAVE_DELAY } from './config.js';
import { clearEffects, updateEffects } from './effects.js';

/* Current map number 00-99. Set by main.js via setMap(). */
export let mapId = 0;

/* Enemy HP multiplier for the current map (higher maps are a bit tougher). */
export let mapHpMul = 1;

/* Player gold. */
export let gold = START_GOLD;

/* Base hit points. Game ends at 0. */
export let lives = START_LIVES;

/* Current wave number. 0 before the first wave starts. */
export let wave = 0;

/* Run score. */
export let score = 0;

/* 'idle' | 'playing' | 'paused' | 'gameover' */
export let gameState = 'idle';

/* Simulation steps per frame. 1, 2, or 3. */
export let speedMul = 1;

/* Pending spawns for the active wave: { type, time }. */
export let spawnQueue = [];

/* Seconds since the current wave started spawning. */
export let waveTimer = 0;

/* True while a wave is spawning or enemies are still alive. */
export let waveActive = false;

/* Countdown until the next startWave(). Set in resetRun and on wave clear. */
export let nextWaveIn = 0;

/* Tower type key armed for placement, or null. */
export let selectedBuildType = null;

/* Tower object selected for upgrade/sell, or null. */
export let selectedTower = null;

/* Placed towers. */
export const towers = [];

/* Live enemies. */
export const enemies = [];

/* In-flight shots. */
export const projectiles = [];

/* Rising gold and wave-clear labels. Positions in tiles. */
export const floatingTexts = [];

/* Optional hook set by main.js. Called when lives hit 0. */
export let onGameOver = null;

/* Store the chosen map number and its HP multiplier. */
export function setMap(id, hpMul) { mapId = id; mapHpMul = hpMul; }

/* Set gold. */
export function setGold(value) { gold = value; }

/* Set lives. */
export function setLives(value) { lives = value; }

/* Set wave number. */
export function setWave(value) { wave = value; }

/* Set score. */
export function setScore(value) { score = value; }

/* Set high-level game state string. */
export function setGameState(value) { gameState = value; }

/* Set speed multiplier. */
export function setSpeedMul(value) { speedMul = value; }

/* Replace the spawn queue. */
export function setSpawnQueue(value) { spawnQueue = value; }

/* Set wave clock. */
export function setWaveTimer(value) { waveTimer = value; }

/* Set whether a wave is in progress. */
export function setWaveActive(value) { waveActive = value; }

/* Set seconds until the next wave. */
export function setNextWaveIn(value) { nextWaveIn = value; }

/* Arm or clear a build type. */
export function setSelectedBuildType(value) { selectedBuildType = value; }

/* Select or clear a placed tower. */
export function setSelectedTower(value) { selectedTower = value; }

/* Register the game-over callback. */
export function setOnGameOver(fn) { onGameOver = fn; }

/* Add gold (may be negative). */
export function addGold(amount) { gold += amount; }

/* Add score. */
export function addScore(amount) { score += amount; }

/* Subtract lives. Returns the new value. */
export function loseLives(amount) {
  lives -= amount;
  return lives;
}

/* Advance the wave counter and return the new wave number. */
export function bumpWave() {
  wave += 1;
  return wave;
}

/* Advance the wave clock. */
export function addWaveTimer(dt) { waveTimer += dt; }

/* Tick the between-wave countdown. */
export function addNextWaveIn(dt) { nextWaveIn += dt; }

/*
  Rising label. x/y are in tiles so a resize keeps it in place.
*/
export function addFloatingText(x, y, text, color) {
  floatingTexts.push({ x, y, text, color, life: 1.0, maxLife: 1.0, vy: -0.6 });
}

/*
  Reset arrays and counters for a new run.
  Does not touch DOM or the onGameOver hook.
*/
export function resetRun() {
  towers.length = 0;
  enemies.length = 0;
  projectiles.length = 0;
  clearEffects();
  floatingTexts.length = 0;
  gold = START_GOLD;
  lives = START_LIVES;
  wave = 0;
  score = 0;
  selectedBuildType = null;
  selectedTower = null;
  waveActive = false;
  nextWaveIn = FIRST_WAVE_DELAY;
  waveTimer = 0;
  spawnQueue = [];
  speedMul = 1;
  gameState = 'playing';
}

/*
  Age effects (effects.js) and floating text. Called from the main loop.
*/
export function updateFx(dt) {
  updateEffects(dt);
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const f = floatingTexts[i];
    f.life -= dt;
    f.y += f.vy * dt;
    if (f.life <= 0) floatingTexts.splice(i, 1);
  }
}
