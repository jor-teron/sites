/*
 * File: tennis-throw_logic.js
 * Project: tennis-throw (Tennis Ball Blitz)
 * Purpose: Entry point. Wires the modules together: new game, pause,
 *          HUD / end screen, then starts the 30fps loop.
 * Modules (classic scripts on window.TT, loaded before this file):
 *   modules/state.js    shared state, canvas, helpers
 *   modules/targets.js  target spawning and bird movement
 *   modules/physics.js  throwing, ball flight, hits
 *   modules/rounds.js   TB8 rounds, countdown, combo, best score
 *   modules/render.js   drawing
 *   modules/input.js    keyboard + touch/mouse drag
 *   modules/settings.js TB4/GS1 Games settings bridge (defaults if the shared script is missing)
 *   modules/loop.js     fixed-timestep clock
 */
(function (TT) {
  const CFG = TT.CFG, game = TT.game;
  const $ = id => document.getElementById(id);

  // On-screen text from config
  document.querySelector('.controls-hint').textContent = CFG.text.controls;
  document.querySelector('.restart-hint').textContent = CFG.text.restart;

  /** Start a fresh run (round 1). */
  TT.init = function () {
    // TB4/GS1: difficulty from Games settings (numbers in CFG.difficulty)
    const d = CFG.difficulty[TT.settings.get('difficulty')] || CFG.difficulty.normal;
    game.difficulty = TT.settings.get('difficulty');
    game.goalScale = d.goalScale;
    game.roundSeconds = d.roundSeconds;
    game.birdSpeedScale = d.birdSpeedScale;
    game.extraCount = d.extraCount;
    Object.assign(game, {
      score: CFG.start.score, time: 0, clock: 0, lastThrow: -1e9, combo: 0,
      isRunning: true, isFinished: false, isPaused: false, drag: null,
      aimAngle: CFG.start.aimAngle, aimPower: CFG.start.aimPower, balls: [],
      best: TT.loadBest(), newBest: false,
    });
    $('endScreen').classList.remove('show');
    TT.startRound(1);
    TT.updateHud();
  };

  /** Pause / resume a running game (game time stops while paused). */
  TT.togglePause = function () {
    if (game.isFinished) return;
    if (game.isPaused) { game.isPaused = false; game.isRunning = true; }
    else if (game.isRunning) { game.isPaused = true; game.isRunning = false; game.drag = null; }
  };

  const getRank = n => CFG.ranks.find(r => n >= r.minRound) || CFG.ranks[CFG.ranks.length - 1];

  /** TB8: time-up screen with round, score and best. */
  TT.showEnd = function () {
    TT.updateHud();
    const rank = getRank(game.round);
    $('endTitle').textContent = CFG.text.gameOver + (game.newBest ? ' ' + CFG.text.newBest : '');
    $('rankText').textContent = rank.name;
    $('badge').textContent = rank.emoji;
    $('finalRound').textContent = game.round;
    $('finalScore').textContent = game.score;
    $('finalBest').textContent = game.best;
    $('endScreen').classList.add('show');
  };

  /** Update the HUD text (score, round goal, countdown, combo, best). */
  TT.updateHud = function () {
    $('scoreValue').textContent = game.score;
    $('roundValue').textContent = game.round;
    $('goalValue').textContent = Math.min(game.roundScore, game.roundGoal) + '/' + game.roundGoal;
    $('timerValue').textContent = Math.ceil(game.timeLeft);
    $('timerValue').parentNode.classList.toggle('low', game.timeLeft < 6 && game.banner <= 0);
    const m = Math.min(CFG.combo.max, 1 + CFG.combo.step * game.combo);
    $('comboValue').textContent = game.combo > 0 ? '×' + m.toFixed(1).replace('.0', '') : '';
    $('bestValue').textContent = Math.max(game.best, game.score);
  };

  // TB2: tap the end screen to play again
  $('endScreen').addEventListener('pointerdown', e => { e.preventDefault(); if (game.isFinished) TT.init(); });

  // Globals kept for the console and tests (same names as TB1)
  window.game = game;
  window.minReachableY = TT.minReachableY;
  window.throwBall = TT.throwBall;

  // ---- TB4/GS1: Games settings hooks ----
  const S = TT.settings;
  const applyHints = () => { document.querySelector('.controls-hint').style.display = S.get('showHints') ? '' : 'none'; };
  applyHints();
  S.onChange(ch => {
    if ('showHints' in ch) applyHints();
    if ('difficulty' in ch) TT.init();   // new difficulty = new run
  });
  // autoPause: pause when the tab/app goes to the background
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && S.get('autoPause') && game.isRunning && !game.isPaused) TT.togglePause();
  });
  S.mountGear(document.querySelector('.container'), 'tennis-throw');

  TT.init();
  TT.startLoop();
})(window.TT);
