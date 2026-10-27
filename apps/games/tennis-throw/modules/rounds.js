/*
 * File: modules/rounds.js
 * Project: tennis-throw — TB8
 * Purpose: The game loop rules: rounds with a goal and a countdown, rising
 *          difficulty, combo multiplier, best score in localStorage, and the
 *          win-round / time-up flow. Hooks TT.onHit / TT.onMiss from physics.
 */
(function (TT) {
  const CFG = TT.CFG, game = TT.game;

  /** Best score saved on this device (0 if storage is blocked). */
  TT.loadBest = function () {
    try { return parseInt(localStorage.getItem(CFG.bestKey), 10) || 0; } catch (e) { return 0; }
  };
  function saveBest(v) { try { localStorage.setItem(CFG.bestKey, String(v)); } catch (e) { /* private mode */ } }

  /** Goal (points to earn inside the round) for round n. */
  TT.roundGoal = n => Math.round((CFG.rounds.goalBase + CFG.rounds.goalStep * (n - 1)) * (game.goalScale || 1) / 5) * 5;

  /** Begin round n: fresh targets, full timer, short banner. */
  TT.startRound = function (n) {
    game.round = n;
    game.roundScore = 0;
    game.roundGoal = TT.roundGoal(n);
    game.timeLeft = game.roundSeconds;
    game.banner = CFG.rounds.betweenSeconds;   // seconds the 'Round n' banner shows (timer waits)
    game.balls = [];
    TT.spawnAllTargets();
    if (TT.fx) TT.fx.clear();
    if (TT.sound) TT.sound('round');
  };

  /** Physics hook: a ball hit target t. */
  TT.onHit = function (t, ball) {
    const C = CFG.combo;
    const mult = Math.min(C.max, 1 + C.step * game.combo);
    const pts = Math.round(t.points * mult);
    game.combo++;
    game.score += pts;
    game.roundScore += pts;
    TT.spawnTarget(t.type);
    if (TT.fx) TT.fx.hit(t, pts, mult);
    if (TT.sound) TT.sound('hit', mult);
  };

  /** Physics hook: a ball fell off the bottom without hitting anything. */
  TT.onMiss = function () {
    if (game.combo > 1 && TT.sound) TT.sound('miss');
    game.combo = 0;
  };

  function endGame() {
    game.isRunning = false;
    game.isFinished = true;
    game.newBest = game.score > game.best;
    if (game.newBest) { game.best = game.score; saveBest(game.best); }
    if (TT.showEnd) TT.showEnd();
    if (TT.sound) TT.sound('over');
  }

  /** Per-step rules (dt seconds, only while running). */
  TT.updateRounds = function (dt) {
    if (game.banner > 0) { game.banner -= dt; return; }
    if (game.roundScore >= game.roundGoal) { TT.startRound(game.round + 1); return; }
    game.timeLeft -= dt;
    if (game.timeLeft <= 0) { game.timeLeft = 0; endGame(); }
  };
})(window.TT);
