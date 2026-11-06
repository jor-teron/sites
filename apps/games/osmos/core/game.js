/* ============================================================
 * File:        core/game.js
 * Project:     Osmos OSM1a
 * Purpose:     Level state, win/lose, progress, main step.
 * Depends on:  OSMOS_CONFIG, OSMOS_LEVELS, OSMOS_PHYSICS
 * ============================================================ */
var OSMOS_GAME = (function () {
  var C = OSMOS_CONFIG;
  var P = OSMOS_PHYSICS;
  var state = null;

  function loadProgress() {
    try {
      var raw = localStorage.getItem(C.saveKey);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* blocked */ }
    return { unlocked: 1, best: {}, theme: 0 };
  }

  function saveProgress(p) {
    try { localStorage.setItem(C.saveKey, JSON.stringify(p)); } catch (e) { /* blocked */ }
  }

  function start(levelIndex) {
    var prog = loadProgress();
    if (levelIndex == null) levelIndex = 0;
    levelIndex = Math.max(0, Math.min(C.levels - 1, levelIndex | 0));
    var level = OSMOS_LEVELS.build(levelIndex);
    var cells = level.cells.map(function (c) {
      return {
        id: c.id, kind: c.kind, x: c.x, y: c.y, vx: c.vx, vy: c.vy,
        mass: c.mass, alive: true, life: c.life
      };
    });
    state = {
      level: level,
      cells: cells,
      player: cells[0],
      status: 'play', /* play | win | lose | pause */
      progress: prog,
      ejectCd: 0,
      time: 0
    };
    return state;
  }

  function player() { return state && state.player; }
  function get() { return state; }

  function togglePause() {
    if (!state) return;
    if (state.status === 'play') state.status = 'pause';
    else if (state.status === 'pause') state.status = 'play';
  }

  function aim(tx, ty, force) {
    if (!state || state.status !== 'play') return;
    if (state.ejectCd > 0 && !force) return;
    var blob = P.eject(state.player, tx, ty);
    if (blob) {
      blob.id = state.cells.length;
      state.cells.push(blob);
      state.ejectCd = 0.07;
    }
  }

  function step(dt) {
    if (!state || state.status !== 'play') return state;
    state.time += dt;
    if (state.ejectCd > 0) state.ejectCd -= dt;

    var cells = state.cells;
    var i, j;
    for (i = 0; i < cells.length; i++) P.stepCell(cells[i], dt);

    var player = state.player;
    for (i = 0; i < cells.length; i++) {
      if (cells[i] === player || !cells[i].alive) continue;
      P.collide(player, cells[i]);
    }
    /* gentle food–food separation skipped for calm/cheap */

    if (player.mass < C.player.minMass) {
      state.status = 'lose';
      return state;
    }
    if (player.mass >= state.level.targetMass) {
      state.status = 'win';
      var prog = state.progress;
      var idx = state.level.index;
      prog.best[idx] = Math.max(prog.best[idx] || 0, Math.round(player.mass));
      if (idx + 1 < C.levels) prog.unlocked = Math.max(prog.unlocked, idx + 2);
      else prog.unlocked = C.levels;
      saveProgress(prog);
    }
    return state;
  }

  function unlockCount() {
    return loadProgress().unlocked || 1;
  }

  return {
    start: start, get: get, player: player, step: step, aim: aim,
    togglePause: togglePause, loadProgress: loadProgress,
    saveProgress: saveProgress, unlockCount: unlockCount
  };
})();
