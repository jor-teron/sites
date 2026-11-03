/*
 * Star Pinball — config (PIN-1a). All tunable numbers live here.
 * Table units: 600 wide x 1120 tall, y grows down the table (towards the flippers).
 * The physics runs in fixed sub-steps of `step` seconds (1/1440 s = 24 per frame at 60 fps,
 * 48 at 30 fps, never fewer than 8 below 180 fps). Fast balls move under 3 units per sub-step,
 * far less than the ball radius, so nothing can be skipped.
 */
const PB_CONFIG = {
  W: 600, H: 1120,
  ballR: 15,
  gravity: 1350,            // units / s² down the tilted table (about 6.5° of tilt)
  step: 1 / 1440,           // fixed physics sub-step (s)
  maxStepsPerFrame: 120,    // after a long stall: drop the rest instead of freezing
  vmax: 4000,               // ball speed cap (units / s) → at most 2.8 units per sub-step
  drag: 0.05,               // rolling loss per second
  spinDecay: 0.6,           // spin loss per second
  wallE: 0.45, wallMu: 0.12,
  postE: 0.6,
  bumperKick: 520, bumperCooldown: 0.08,
  slingKick: 480, slingMinHit: 120, slingCooldown: 0.12,
  flipper: { len: 90, rp: 13, rt: 7, rest: 0.52, up: -0.49, wUp: 30, wDown: 14, e: 0.25, mu: 0.25 },
  plunger: { travel: 45, pullTime: 0.9, minSpeed: 250, maxSpeed: 3600 },
  balls: 3,
  drainDelayMs: 900,
  score: { bumper: 100, sling: 30, topLane: 250, allLanes: 2000, inlane: 50, outlane: 100, launch: 10 },
  bestKey: 'pinball.best',  // high score (folder prefix, so "Clear all game progress" finds it)
};
