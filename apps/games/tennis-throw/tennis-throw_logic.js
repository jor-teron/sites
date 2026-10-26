/*
 * File: tennis-throw_logic.js
 * Project: tennis-throw (Tennis Ball Blitz)
 * Purpose: Entry point. Wires the modules together: new game, pause,
 *          HUD / end screen, then starts the 30fps loop.
 * Modules (classic scripts on window.TT, loaded before this file):
 *   modules/state.js    shared state, canvas, helpers
 *   modules/targets.js  target spawning and bird movement
 *   modules/physics.js  throwing, ball flight, hits
 *   modules/render.js   drawing
 *   modules/input.js    keyboard + touch/mouse drag
 *   modules/loop.js     fixed-timestep clock
 */
(function (TT) {
  const CFG = TT.CFG, game = TT.game;
  const $ = id => document.getElementById(id);

  // On-screen text from config
  document.querySelector('.controls-hint').textContent = CFG.text.controls;
  document.querySelector('.restart-hint').textContent = CFG.text.restart;
  document.querySelector('.score').lastChild.textContent = '/' + CFG.targetScore;

  /** Start a fresh run. */
  TT.init = function () {
    Object.assign(game, {
      score: CFG.start.score, time: 0, clock: 0, lastThrow: -1e9,
      isRunning: true, isFinished: false, isPaused: false, drag: null,
      aimAngle: CFG.start.aimAngle, aimPower: CFG.start.aimPower, balls: [],
    });
    $('endScreen').classList.remove('show');
    TT.spawnAllTargets();
  };

  /** Pause / resume a running game (game time stops while paused). */
  TT.togglePause = function () {
    if (game.isFinished) return;
    if (game.isPaused) { game.isPaused = false; game.isRunning = true; }
    else if (game.isRunning) { game.isPaused = true; game.isRunning = false; game.drag = null; }
  };

  const getRank = s => CFG.ranks.find(r => s < r.maxSeconds) || CFG.ranks[CFG.ranks.length - 1];

  function finishGame() {
    game.isRunning = false;
    game.isFinished = true;
    const rank = getRank(game.time);
    $('rankText').textContent = rank.name;
    $('badge').textContent = rank.emoji;
    $('finalTime').textContent = game.time.toFixed(1);
    $('endScreen').classList.add('show');
  }

  /** Update timer and score text; finish when the goal is reached. */
  TT.updateHud = function () {
    $('timerValue').textContent = game.time.toFixed(1);
    $('scoreValue').textContent = game.score;
    if (game.score >= game.targetScore && !game.isFinished) finishGame();
  };

  // TB2: tap the end screen to play again
  $('endScreen').addEventListener('pointerdown', e => { e.preventDefault(); if (game.isFinished) TT.init(); });

  // Globals kept for the console and tests (same names as TB1)
  window.game = game;
  window.minReachableY = TT.minReachableY;
  window.throwBall = TT.throwBall;

  TT.init();
  TT.startLoop();
})(window.TT);
