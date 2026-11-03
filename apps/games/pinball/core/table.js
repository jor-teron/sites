/*
 * Star Pinball — the table layout (PIN-1a, PIN-1b parts, PIN-1c ramp entry): an original space table, all drawn in code.
 * Plain data, read by core/physics.js (collisions) and ui/render.js (drawing).
 *   walls   — line segments { a, b, e, mu, kind: 'wall' | 'sling' | 'gate', n (gate: one-way normal) }
 *   arcs    — the curved top { c, R, a0, a1 } (angles in radians, y down; π..2π = top half)
 *   circles — pop bumpers { c, R, kind, id }
 *   sensors — rollover lanes { c, R, id, kind } (score only, the ball rolls over them)
 *   flippers, plunger (in the launch lane on the right), drainY (ball below = lost)
 *   PIN-1b: drops   — 4 drop targets on the left wall { id, segs } (solid while up; bevelled ends so no ledge)
 *           spinner — a flap across the right orbit lane { a, b } (no collision, spins when crossed)
 *           ramp    — PIN-1c: a covered entry channel leaning right (PB_CONFIG.rampEntry; was an upright mouth
 *                     that most left-flipper shots clipped); its walls are in `walls`, entry frame { base, ax, px, w, len, on } and a raised path
 *                     { path, hgt } that crosses the top and drops the ball into the left inlane
 *           hole    — kick-out saucer { c } under the middle star lane (catches, holds, kicks out)
 * Left / right parts are mirror images about the playfield centre x = 280.
 */
const PB_TABLE = (() => {
  const C = PB_CONFIG, MX = 560;                    // mirror: x -> MX - x  (playfield 20..540)
  const m = (p) => [MX - p[0], p[1]];
  const walls = [], circles = [], sensors = [];
  const wall = (a, b, kind, extra) => walls.push(Object.assign({ a, b, kind: kind || 'wall', e: C.wallE, mu: C.wallMu }, extra || {}));
  const both = (a, b, kind, extra) => { wall(a, b, kind, extra); wall(m(b), m(a), kind, extra); };

  // outer shell: left wall, right outer wall (launch lane side), lane separator, one-way gate at the lane top
  wall([20, 290], [20, 1120]);
  wall([585, 290], [585, 1140]);
  wall([545, 300], [545, 1140]);
  wall([545, 300], [585, 300], 'gate', { n: [0, -1] });   // the ball passes upwards only
  const arcs = [{ c: [302.5, 290], R: 282.5, a0: Math.PI, a1: 2 * Math.PI }];

  // lower playfield: outlane dividers, inlane guides to the flippers, slingshots (kicking face = 'sling')
  both([70, 790], [70, 915]);
  both([70, 915], [181.5, 978.7]);    // inlane slant: ends on the pivot cap's top tangent, in line with the resting flipper (no notch to stall in)
  both([115, 800], [170, 930], 'sling', { e: 0.5 });
  both([115, 900], [115, 800]);
  both([170, 930], [115, 900]);

  // top rollover lane guides
  wall([230, 150], [230, 215]); wall([330, 150], [330, 215]);
  [[180, 'L1'], [280, 'L2'], [380, 'L3']].forEach(([x, id]) => sensors.push({ c: [x, 190], R: 18, id, kind: 'top' }));
  sensors.push({ c: [45, 860], R: 16, id: 'outL', kind: 'out' }, { c: [515, 860], R: 16, id: 'outR', kind: 'out' });
  sensors.push({ c: [92, 870], R: 14, id: 'inL', kind: 'in' }, { c: [468, 870], R: 14, id: 'inR', kind: 'in' });

  // ramp entry (PIN-1b; leaning + wider PIN-1c): a covered channel open at the bottom, leaning to the right
  // so shots from either flipper line up with it, with a peaked roof (no shelf on top)
  const RE = C.rampEntry, ta = RE.tilt * Math.PI / 180;
  const ax = [Math.sin(ta), -Math.cos(ta)], px = [Math.cos(ta), Math.sin(ta)];          // up the channel / across it
  const at = (al, ac) => [RE.top[0] + ax[0] * (al - RE.len) + px[0] * ac, RE.top[1] + ax[1] * (al - RE.len) + px[1] * ac];
  const TL = at(RE.len, -RE.w / 2), TR = at(RE.len, RE.w / 2), BL = at(0, -RE.w / 2), BR = at(0, RE.w / 2), PK = at(RE.len + 25, 0);
  wall(TL, BL); wall(TR, BR); wall(TL, PK); wall(PK, TR);
  const ramp = {
    entry: { base: at(0, 0), ax, px, w: RE.w, len: RE.len, on: RE.len * RE.at },   // channel frame: past `on` moving up = on the ramp
    path: [at(RE.len * RE.at, 0), [465, 380], [452, 318], [405, 272], [320, 252], [230, 256], [160, 284], [115, 330], [97, 400], [93, 520], [92, 660], [92, 800]],
    hgt:  [0, 0.55, 0.8, 0.95, 1, 1, 0.97, 0.9, 0.75, 0.5, 0.3, 0.1],   // climb, cross the top, run down to the left inlane
  };
  // drop target bank (PIN-1b): 4 targets on the left wall; face 14 units out (less than the ball, nothing gets behind)
  const drops = [];
  for (let i = 0; i < 4; i++) {
    const y0 = 420 + 42 * i;
    drops.push({ id: 'D' + (i + 1), segs: [[[20, y0], [34, y0 + 10]], [[34, y0 + 10], [34, y0 + 32]], [[34, y0 + 32], [20, y0 + 42]]] });
  }
  const spinner = { a: [492, 540], b: [543, 540] };     // across the right orbit lane (490..545)
  const hole = { c: [280, 305] };                        // under the middle star lane

  // 3 pop bumpers in a triangle
  [[200, 400, 'B1'], [360, 400, 'B2'], [280, 505, 'B3']].forEach(([x, y, id]) => circles.push({ c: [x, y], R: 30, kind: 'bumper', id }));
  // side deflectors: short slants joined to the wall turn a ball running down the wall away from the outlane
  // (slanted, not posts, so there is no shelf beside the wall for a ball to come to rest on)
  wall([20, 610], [52, 665]); wall([545, 610], [510, 665]);

  const F = C.flipper;
  const flippers = [
    { side: 'L', p: [175, 990], len: F.len, rp: F.rp, rt: F.rt, rest: F.rest, up: F.up, dir: -1 },
    { side: 'R', p: [MX - 175, 990], len: F.len, rp: F.rp, rt: F.rt, rest: Math.PI - F.rest, up: Math.PI - F.up, dir: 1 },
  ];
  const plunger = { x0: 545, x1: 585, rest: 1062, laneX: 565 };
  return { walls, arcs, circles, sensors, flippers, plunger, drainY: 1135, playMaxX: 545, drops, spinner, ramp, hole };
})();
