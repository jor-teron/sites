/*
 * Star Pinball — the table layout (PIN-1a): an original space table, all drawn in code.
 * Plain data, read by core/physics.js (collisions) and ui/render.js (drawing).
 *   walls   — line segments { a, b, e, mu, kind: 'wall' | 'sling' | 'gate', n (gate: one-way normal) }
 *   arcs    — the curved top { c, R, a0, a1 } (angles in radians, y down; π..2π = top half)
 *   circles — pop bumpers { c, R, kind, id }
 *   sensors — rollover lanes { c, R, id, kind } (score only, the ball rolls over them)
 *   flippers, plunger (in the launch lane on the right), drainY (ball below = lost)
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
  return { walls, arcs, circles, sensors, flippers, plunger, drainY: 1135, playMaxX: 545 };
})();
