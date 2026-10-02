/*
  File: modules/waves.js
  Project: tower-defence
  Purpose: Countdown, build a spawn queue, and pay the clear bonus.
           First wave is not special-cased: nextWaveIn is set in resetRun.
*/

import { BETWEEN_WAVE_DELAY } from './config.js';
import * as state from './state.js';
import { spawnEnemy } from './enemies.js';

/*
  Fill the spawn queue for the current wave number and mark the wave active.
*/
export function startWave() {
  const wave = state.bumpWave();
  state.setWaveActive(true);
  state.setNextWaveIn(0);
  const queue = [];
  const isBossWave = wave % 5 === 0;
  const baseCount = 6 + Math.floor(wave * 1.4);

  if (isBossWave) {
    queue.push({ type: 'boss', time: 0 });
    for (let i = 0; i < baseCount; i++) {
      queue.push({ type: 'grunt', time: 1 + i * 0.5 });
      if (i % 3 === 0) queue.push({ type: 'runner', time: 1.2 + i * 0.5 });
    }
  } else if (wave < 3) {
    for (let i = 0; i < baseCount; i++) {
      queue.push({ type: 'grunt', time: i * 0.9 });
    }
  } else {
    for (let i = 0; i < baseCount; i++) {
      const roll = Math.random();
      let type = 'grunt';
      if (roll < 0.35) type = 'runner';
      else if (roll < 0.55 && wave >= 4) type = 'tank';
      queue.push({ type, time: i * 0.7 });
    }
    if (wave >= 5 && Math.random() < 0.5) {
      queue.push({ type: 'tank', time: 2 });
    }
  }

  state.setSpawnQueue(queue);
  state.setWaveTimer(0);
}

/*
  Between waves, count down and start the next wave.
  During a wave, spawn due enemies and clear when the field is empty.
  canvasW/canvasH center the wave-clear label.
*/
export function updateWaves(dt, canvasW, canvasH) {
  if (!state.waveActive) {
    /* Do not gate on wave > 0. The first wave uses nextWaveIn from resetRun. */
    state.addNextWaveIn(-dt);
    if (state.nextWaveIn <= 0) startWave();
    return;
  }

  state.addWaveTimer(dt);
  while (state.spawnQueue.length > 0 && state.spawnQueue[0].time <= state.waveTimer) {
    const s = state.spawnQueue.shift();
    spawnEnemy(s.type);
  }

  if (state.spawnQueue.length === 0 && state.enemies.length === 0) {
    state.setWaveActive(false);
    const bonus = 20 + state.wave * 5;
    state.addGold(bonus);
    state.addScore(bonus);
    state.addFloatingText(canvasW / 2, canvasH / 2, `WAVE CLEAR +$${bonus}`, '#FFD700');
    state.setNextWaveIn(BETWEEN_WAVE_DELAY);
  }
}
