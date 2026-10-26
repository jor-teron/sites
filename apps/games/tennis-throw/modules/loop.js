/*
 * File: modules/loop.js
 * Project: tennis-throw
 * Purpose: TB2 clock. requestAnimationFrame drives a fixed 1/30 s timestep
 *          from real elapsed time: slow frames run extra steps, fast screens
 *          skip draws, so gameplay speed never depends on the display rate.
 */
(function (TT) {
  const CFG = TT.CFG, game = TT.game;
  const STEP = 1 / CFG.loop.fps;
  let last = null, acc = 0, fpsCount = 0, fpsT = 0;

  /** One fixed simulation step of STEP seconds. */
  function update(dt) {
    TT.applyHeldKeys(dt);
    if (!game.isRunning) return;
    game.clock += dt;
    game.time = game.clock;   // timer counts only running time (pause freezes it)
    TT.updateBalls(dt);
    TT.updateTargets(dt);
    TT.updateHud();           // TB3: score / finish checks only while running
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (last === null) last = now;
    acc += Math.min((now - last) / 1000, STEP * CFG.loop.maxCatchUpSteps);
    last = now;
    if (acc < STEP - 0.002) return;     // not time for a 30fps tick yet (2ms slack for jitter)
    let steps = 0;
    while (acc >= STEP - 0.002 && steps < CFG.loop.maxCatchUpSteps) { update(STEP); acc -= STEP; steps++; }
    if (acc < 0) acc = 0;
    TT.draw();
    fpsCount++; fpsT += steps * STEP;   // measured draw rate for tests / debugging
    if (fpsT >= 1) { game.fps = fpsCount / fpsT; fpsCount = 0; fpsT = 0; }
  }

  /** Start the clock. */
  TT.startLoop = () => requestAnimationFrame(frame);
})(window.TT);
