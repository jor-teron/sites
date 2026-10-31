/*
 * File: core/state.js
 * Project: tennis-throw (Tennis Ball Blitz)
 * Purpose: Shared namespace TT, canvas handles, and the mutable game state.
 *          Classic script (not an ES module) so the game also runs from file://.
 *          Loaded right after core/config.js.
 */
window.TT = window.TT || {};
(function (TT) {
  const CFG = TT.CFG = TENNIS_THROW_CONFIG;

  TT.canvas = document.getElementById('gameCanvas');
  TT.ctx = TT.canvas.getContext('2d');

  /** True if the event's code or key is in the binding list. */
  TT.isKey = (list, e) => list.includes(e.code) || list.includes(e.key);

  /** Launch point of every ball (bottom centre). */
  TT.launchPoint = () => ({ x: TT.canvas.width / 2, y: TT.canvas.height - CFG.ball.launchOffsetY });

  /**
   * The single game state object. Times are in seconds of *game* time
   * (game.clock advances only while running, so pausing freezes everything).
   */
  TT.game = {
    score: CFG.start.score,
    round: 1, roundScore: 0, roundGoal: 0, roundSeconds: 35, timeLeft: 0, banner: 0, // TB8
    combo: 0, best: 0, newBest: false,                                               // TB8
    time: 0,            // TB1: elapsed seconds as a number (formatted only for display)
    clock: 0,           // TB2: simulated seconds while running (drives cooldown + hints)
    lastThrow: -1e9,    // TB2: game.clock of the last throw (cooldown)
    isRunning: false,
    isFinished: false,
    isPaused: false,
    gravity: CFG.physics.gravity,     // px/s²
    ballSpeed: CFG.physics.ballSpeed, // px/s at full power
    aimAngle: CFG.start.aimAngle,     // degrees, 0 = right, 180 = left
    aimPower: CFG.start.aimPower,     // 0..1
    drag: null,         // TB2: active pointer drag {x0,y0,x1,y1} in canvas px, or null
    targets: [],
    balls: [],
    targetPool: CFG.targets.pool,
    arcDots: 0,         // number of preview dots drawn last frame (read by tests)
    fps: 0,             // TB2: measured draw rate (read by tests)
  };
})(window.TT);
