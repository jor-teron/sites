/*
 * Star Pinball — config (PIN-1a, targets + missions PIN-1b, nudge + tilt + fairer ramp PIN-1c). All tunable numbers live here.
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
  // PIN-1b parts
  drop: { minHit: 90, resetDelay: 1.0 },              // drop targets: approach speed that knocks one down; bank reset delay (s)
  spinner: { kick: 0.03, decay: 1.4 },                // spin added per unit/s of crossing speed (rad/s); loss per second
  ramp: { g: 820000, drag: 0.25, exitMin: 250, exitMax: 750 },    // climb: need ~1250/s at the entry to make it (PIN-1c: was 1e6)
  rampEntry: { top: [420, 500], tilt: 30, w: 63, len: 85, at: 0.45 },  // PIN-1c: covered entry channel (top centre, lean to the right in degrees, inside width, length; past `at` of its length = on the ramp)
  hole: { R: 14, maxSpeed: 1700, hold: 1.2, kick: 650, cool: 0.8 }, // catch radius, faster balls skip over, hold (s), kick-out
  nudge: { side: 170, up: 150, gap: 0.25 },          // PIN-1c: push (units / s) sideways + up; Shift key repeats under `gap` s are ignored
  tilt: { window: 4, warnAt: 3, tiltAt: 5 },         // nudges inside `window` s: warning at the 3rd, tilt at the 5th (flippers off, bonus lost)
  ballSave: 6,              // s after a new ball leaves the launch lane: a drain gives the ball back (once per ball)
  multMax: 5,               // bonus multiplier cap (all 3 star lanes lit = +1)
  msgMs: 2600,              // how long a panel message shows
  score: { bumper: 100, sling: 30, topLane: 250, allLanes: 2000, inlane: 50, outlane: 100, launch: 10,
    drop: 250, dropsClear: 1500, spin: 25, rampMade: 1500, hole: 500, missionBase: 2500 },
  bonus: { bumper: 20, sling: 10, drop: 100, spin: 10, ramp: 500, lanes: 1000, hole: 200, mission: 2000 },   // end-of-ball bonus
  bestKey: 'pinball.best',  // high score (folder prefix, so "Clear all game progress" finds it)
  saveKey: 'pinball.save',  // game in progress: score, ball, rank, mission + progress, bonus, lit lanes, drop targets
};
