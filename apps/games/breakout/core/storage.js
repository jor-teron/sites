/* Versioned per-game saves; broken/old data is ignored, blocked storage is harmless. */
'use strict';
BRK.store = {
  read(key) { try { return JSON.parse(localStorage.getItem('breakout.' + key)); } catch (_) { return null; } },
  best() { const n = this.read('best'); return Number.isFinite(n) && n >= 0 ? n : 0; },
  write(key, value) { try { localStorage.setItem('breakout.' + key, JSON.stringify(value)); } catch (_) {} },
  save(model) {
    const { level, score, lives, time, paddle, buffs, bricks, balls, drops, shots, mode, laserCooldown } = model;
    this.write('save', { version: 1, level, score, lives, time, paddle, buffs, bricks, balls, drops, shots, mode, laserCooldown });
  },
  load() {
    const s = this.read('save'), C = BRK.C;
    const number = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
    const pos = (o, loY = 0, hiY = C.height + 40) => o && number(o.x, 0, C.width) && number(o.y, loY, hiY);
    if (!s || s.version !== 1 || !['ready', 'playing', 'over'].includes(s.mode) ||
        !Number.isInteger(s.level) || !number(s.level, 1, 100000) || !number(s.score, 0, 1e12) ||
        !Number.isInteger(s.lives) || !number(s.lives, 0, 9) || !number(s.time, 0, 1e10) ||
        !s.paddle || !number(s.paddle.x, 0, C.width) || !s.buffs ||
        !['wide', 'slow', 'laser'].every(k => number(s.buffs[k], 0, C.powerSeconds)) ||
        !number(s.laserCooldown, -1e10, 1) ||
        !Array.isArray(s.bricks) || !s.bricks.length || s.bricks.length > 100 ||
        !s.bricks.every(b => pos(b, 0, 400) && [-1, 0, 1, 2, 3].includes(b.hp) && [-1, 1, 2, 3].includes(b.max)) ||
        !Array.isArray(s.balls) || s.balls.length > 8 ||
        !s.balls.every(b => pos(b) && number(b.vx, -C.maxSpeed, C.maxSpeed) && number(b.vy, -C.maxSpeed, C.maxSpeed) && number(b.speed, 1, C.maxSpeed)) ||
        !Array.isArray(s.drops) || s.drops.length > 100 || !s.drops.every(d => pos(d) && C.powerTypes.includes(d.type)) ||
        !Array.isArray(s.shots) || s.shots.length > 100 || !s.shots.every(p => pos(p)) ||
        (s.mode !== 'over' && (!s.balls.length || s.lives < 1)) ||
        (s.mode === 'ready' && s.balls.length !== 1) || (s.mode === 'over' && s.lives !== 0)) return null;
    const model = new BRK.Model();
    for (const k of ['level', 'score', 'lives', 'time', 'paddle', 'buffs', 'bricks', 'balls', 'drops', 'shots', 'mode', 'laserCooldown']) model[k] = s[k];
    model.movePaddle(model.paddle.x);
    return model;
  },
};
