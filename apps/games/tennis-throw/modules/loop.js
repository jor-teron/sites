/*
 * File: modules/loop.js
 * Project: tennis-throw
 * Purpose: TB2 clock. requestAnimationFrame drives a fixed 1/fps s timestep (TB4: fps from Games settings)
 *          from real elapsed time: slow frames run extra steps, fast screens
 *          skip draws, so gameplay speed never depends on the display rate.
 *          TB9: FPS counter measured on real time; also steps fx.
 */
(function (TT) {
  const CFG = TT.CFG, game = TT.game;
  // TB4/GS1: step = 1 / Games-settings fpsLimit (30, 45 or 60). Physics is per
  // second and exact, so only the step rate changes, never the flight time.
  let STEP = 1 / TT.settings.fps();
  TT.settings.onChange(() => { STEP = 1 / TT.settings.fps(); });
  let last = null, acc = 0, fpsCount = 0, fpsT0 = null;

  /** One fixed simulation step of STEP seconds. */
  function update(dt) {
    TT.applyHeldKeys(dt);
    if (!game.isRunning) return;
    game.clock += dt;
    game.time = game.clock;   // timer counts only running time (pause freezes it)
    TT.updateBalls(dt);
    TT.updateTargets(dt);
    if (TT.fx) TT.fx.update(dt);
    TT.updateRounds(dt);      // TB8: round goal, countdown, game over
    if (game.isRunning) TT.updateHud();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (last === null) last = now;
    acc += Math.min((now - last) / 1000, STEP * CFG.loop.maxCatchUpSteps);
    last = now;
    if (acc < STEP - 0.002) return;     // not time for the next tick yet (2ms slack for jitter)
    let steps = 0;
    while (acc >= STEP - 0.002 && steps < CFG.loop.maxCatchUpSteps) { update(STEP); acc -= STEP; steps++; }
    if (acc < 0) acc = 0;
    TT.draw();
    // TB9: measured draw rate on real (wall-clock) time
    fpsCount++;
    if (fpsT0 === null) fpsT0 = now;
    if (now - fpsT0 >= 1000) { game.fps = fpsCount * 1000 / (now - fpsT0); fpsCount = 0; fpsT0 = now; }
  }

  /** Start the clock. */
  TT.startLoop = () => requestAnimationFrame(frame);
})(window.TT);
