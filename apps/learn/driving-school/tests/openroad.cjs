/* DS-3: procedural open roads (core/roadgen.js, core/roadrules.js). Node only, no DOM. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = Object.assign({}, require('../core/physics.js'), require('../core/lessons.js'), require('../core/town.js'), require('../core/rules.js'),
  require('../core/roadgen.js'), require('../core/roadrules.js'), require('../core/session.js'));
const def = (id, route = 1, side = 'left') => D.roadDefinitions(side, route).find(d => d.id === id);
const sig = road => road.pts.map(p => [p.x.toFixed(3), p.y.toFixed(3), p.h.toFixed(3), p.type, p.width.toFixed(2)].join()).join('|') + '#' + road.events.map(e => e.kind + e.s + e.side).join();
// Lane-following autopilot for tests: aims at the own-lane point 10 m ahead, holds a target speed.
function drive(s, steps, opts = {}) {
  let maxPts = 0;
  for (let i = 0; i < steps && !s.l.done; i++) {
    const w = s.w, at = w.at || { s: 12, limit: 30 }, look = D.pointAtS(w.road, at.s + 10), off = D.laneOffset(look.width, look.lanes, w.side) + (opts.lat || 0);
    let tx = look.x + Math.sin(look.dir) * off, ty = look.y - Math.cos(look.dir) * off;
    // Roundabout: drive round the ring the right way (clockwise on the map for left-hand traffic).
    const rb = w.road.events.find(e => e.kind === 'roundabout' && e.x != null && Math.hypot(s.c.x - e.x, s.c.y - e.y) < D.ROUND.outer + 4);
    if (rb && Math.hypot(tx - rb.x, ty - rb.y) < D.ROUND.outer + 2) {
      const sg = w.side === 'right' ? -1 : 1, a = Math.atan2(s.c.y - rb.y, s.c.x - rb.x) + sg * .45, r = (D.ROUND.island + D.ROUND.outer) / 2 + 1;
      tx = rb.x + Math.cos(a) * r; ty = rb.y + Math.sin(a) * r;
    }
    const err = D.angle(Math.atan2(ty - s.c.y, tx - s.c.x) - s.c.heading);
    const target = (opts.kmh ? opts.kmh(w, at) : Math.min(at.limit - 5, 18)) / 3.6;
    D.tick(s, { throttle: s.c.v < target - .3 ? .7 : 0, brake: s.c.v > target + .8 ? .6 : 0, steer: Math.max(-1, Math.min(1, err * 3)) }, 1 / 60);
    maxPts = Math.max(maxPts, w.road.pts.length);
  }
  return maxPts;
}
function ready(id, route = 1, side = 'left') {
  const s = D.session(def(id, route, side), { auto: true, side }); D.start(s.c); D.shift(s.c, 1); s.c.handbrake = false; return s;
}
test('generator is deterministic: same route number, same road; different numbers differ', () => {
  for (const mode of ['endless', 'loop']) {
    const a = D.createRoad(7, mode), b = D.createRoad(7, mode), c = D.createRoad(8, mode);
    a.ensure(3000); b.ensure(3000); c.ensure(3000);
    assert.equal(sig(a), sig(b), mode); assert.notEqual(sig(a), sig(c), mode);
  }
  // Generating in small steps gives the same road as one big step (chunking does not change it).
  const big = D.createRoad(3), small = D.createRoad(3); big.ensure(2400);
  for (let s = 500; s <= 2400; s += 37) small.ensure(s);
  assert.equal(sig(big).split('#')[0].slice(0, 20000), sig(small).split('#')[0].slice(0, 20000));
  assert.equal(D.createRoad(0).seed, D.createRoad(1).seed, 'route numbers start at 1');
});
test('loop closes: last point joins the first, headings continuous, never crosses itself', () => {
  for (let r = 1; r <= 25; r++) {
    const road = D.createRoad(r, 'loop'), p = road.pts, N = p.length, a = p[0], z = p[N - 1];
    assert(Math.abs(Math.hypot(a.x - z.x, a.y - z.y) - D.ROAD_STEP) < .6, 'closing gap ' + r);
    assert(Math.abs(D.angle(a.dir - z.dir)) < .15, 'heading joins ' + r);
    assert(Math.abs(a.h - z.h) < .5, 'height joins ' + r);
    assert.equal(road.length, N * D.ROAD_STEP); assert(road.length > 1000 && road.length < 2400, 'length ' + road.length);
    assert.equal(road.point(N + 3), p[3], 'indices wrap');
    for (let i = 0; i < N; i += 3) for (let j = i + 30; j < N; j += 3) {
      if (N - (j - i) < 30) continue;
      assert(Math.hypot(p[i].x - p[j].x, p[i].y - p[j].y) > (p[i].width + p[j].width) / 2 + 4, 'self-crossing in loop ' + r);
    }
  }
});
test('endless road stays bounded in memory however far it goes', () => {
  const road = D.createRoad(5);
  for (let s = 0; s <= 30000; s += 50) { road.ensure(s + D.ROAD_AHEAD); road.trim(s - D.ROAD_BEHIND); }
  const span = road.pts[road.pts.length - 1].s - road.pts[0].s;
  assert(road.pts.length < (D.ROAD_AHEAD + D.ROAD_BEHIND) / D.ROAD_STEP + 140, 'points ' + road.pts.length);
  assert(span < D.ROAD_AHEAD + D.ROAD_BEHIND + 500); assert(road.events.length < 12); assert(road.signs.length < 30);
  assert(road.first() > 7000, 'old points were dropped'); assert.equal(road.point(road.first()).i, road.first());
  // A real drive: the session keeps generating ahead and dropping behind.
  const s = ready('endless', 2); const most = drive(s, 60 * 240);
  assert(s.c.distance > 900, 'drove ' + s.c.distance); assert(most < 200, 'window ' + most);
});
test('road types, limits, events and signs are placed by rules', () => {
  const kinds = new Set(), types = new Set();
  for (let r = 1; r <= 12; r++) for (const mode of ['endless', 'loop']) {
    const road = D.createRoad(r, mode); road.ensure(5000);
    road.pts.forEach(p => { types.add(p.type); assert.equal(p.limit, D.ROAD_TYPES[p.type].limit); assert(p.width >= 5 && p.width <= 14.01); });
    road.events.filter(e => e.s < road.pts[road.pts.length - 1].s).forEach(e => {
      kinds.add(e.kind); assert(e.s >= 120, 'no event at the very start');
      const p = D.pointAtS(road, e.s); assert(['city', 'village'].includes(p.type), e.kind + ' on ' + p.type);
    });
    for (let i = 1; i < road.events.length; i++) assert(road.events[i].s - road.events[i - 1].s >= 100, 'events kept apart');
    assert(road.signs.some(g => g.kind === 'limit'));
  }
  assert.deepEqual([...types].sort(), ['city', 'ghat', 'highway', 'village']);
  assert.deepEqual([...kinds].sort(), ['breaker', 'junction', 'roundabout', 'zebra']);
  assert.deepEqual(Object.fromEntries(Object.entries(D.ROAD_TYPES).map(([k, t]) => [k, t.limit])), { city: 40, highway: 80, ghat: 30, village: 25 });
  assert.equal(D.ROAD_TYPES.highway.lanes, 2);
  // Ghat roads have hairpins: somewhere the heading turns about 180 degrees within 80 m.
  let hairpin = false;
  for (let r = 1; r <= 12 && !hairpin; r++) { const road = D.createRoad(r); road.ensure(6000);
    for (let i = 0; i + 20 < road.pts.length; i++) if (road.pts[i].type === 'ghat' && Math.abs(D.angle(road.pts[i + 20].dir - road.pts[i].dir)) > 2.8) { hairpin = true; break; } }
  assert(hairpin, 'ghat hairpins');
});
test('a careful drive round the practice loop finishes the lap', () => {
  const s = ready('loop', 3);
  drive(s, 60 * 600, { kmh: (w, at) => { const e = w.road.events.find(e => { const g = D.roadDelta(w.road, at.s, e.s); return g > -15 && g < 40; });
    return e && e.kind === 'roundabout' ? 12 : e ? 15 : Math.min(at.limit - 5, 30); }, lat: 0 });
  assert(!s.l.faults.some(f => f.code === 'round_dir'), JSON.stringify(s.l.faults));
  assert(s.l.done, 'lap ' + (s.l.lap || 0).toFixed(2)); assert(s.w.progress >= s.w.road.length - 6);
});
// Put the car on a road at distance sAt, lateral offset lat (+ = left), heading along the road.
function place(s, sAt, lat = null, speed = 0) {
  const p = D.pointAtS(s.w.road, sAt), off = lat == null ? D.laneOffset(p.width, p.lanes, s.w.side) : lat;
  Object.assign(s.c, { x: p.x + Math.sin(p.dir) * off, y: p.y - Math.cos(p.dir) * off, heading: p.dir, v: speed });
  s.w.at = null; s.w.previous = null; D.updateRoad(s.w, s.c, 0); s.w.previous = { x: s.c.x, y: s.c.y, s: s.w.at.s, indicator: s.c.indicator };
}
const firstEvent = (s, kind) => { const e = s.w.road.events.find(e => e.kind === kind); return e && s.w.road.place(e); };
function findRoute(kind, mode = 'loop') { for (let r = 1; r < 40; r++) { const s = ready(mode, r); if (firstEvent(s, kind)) return s; } throw new Error('no ' + kind); }
const codes = s => s.l.faults.map(f => f.code);
const run = (s, steps, input) => { for (let i = 0; i < steps; i++) D.tick(s, typeof input === 'function' ? input(i) : input, 1 / 60); };
test('rules: off road, keep left and the speed limit', () => {
  let s = ready('loop', 1); place(s, 60, (D.pointAtS(s.w.road, 60).width / 2) + 2.5, 5); run(s, 30, { throttle: .3 });
  assert(codes(s).includes('off_road'), 'verge');
  s = ready('loop', 1); place(s, 60, -2, 6); run(s, 150, { throttle: .3 });
  assert(codes(s).includes('lane_line'), 'wrong side'); assert(!codes(s).includes('off_road'));
  s = ready('loop', 1); place(s, 60, null, 16); run(s, 30, { throttle: 1 });
  assert(codes(s).includes('speeding')); assert.match(s.l.faults.find(f => f.code === 'speeding').reason, /40 km\/h/);
  s = ready('loop', 1); place(s, 60, null, 6); run(s, 120, { throttle: .2 }); assert.deepEqual(codes(s), [], 'clean on own lane');
  // Right-hand traffic mirrors the lane: driving on the left is now the wrong side.
  s = ready('loop', 1, 'right'); place(s, 60, 1.8, 6); run(s, 150, { throttle: .3 }); assert(codes(s).includes('lane_line'));
});
test('rules: speed breaker, zebra pedestrian, roundabout give way and direction', () => {
  let s = findRoute('breaker'), e = firstEvent(s, 'breaker');
  place(s, e.s - 6, null, 9); run(s, 60, { throttle: .5 }); assert(codes(s).includes('breaker'), 'fast over hump');
  s = findRoute('breaker'); e = firstEvent(s, 'breaker'); place(s, e.s - 6, null, 4); run(s, 120, { throttle: .1 }); assert(!codes(s).includes('breaker'), 'slow is fine');
  s = findRoute('zebra'); e = firstEvent(s, 'zebra'); place(s, e.s - 30, null, 0);
  for (let i = 0; i < 60 * 3; i++) D.tick(s, { brake: 1 }, 1 / 60);    // wait: the person starts crossing
  assert(s.w.pedestrians.some(p => p.active), 'pedestrian on the crossing');
  place(s, e.s - 8, null, 7); run(s, 60, { throttle: .4 }); assert(codes(s).includes('pedestrian'));
  s = findRoute('roundabout'); e = firstEvent(s, 'roundabout');
  // Put the circulating car just upstream of the entry point, then drive in.
  place(s, e.s - D.ROUND.outer - 3, null, 5);
  const ang = Math.atan2(s.c.y - e.y, s.c.x - e.x), RING = (D.ROUND.island + D.ROUND.outer) / 2;
  s.w.time = ((ang - .5 - e.id * 1.7) * RING / 5); s.w.time -= 1 / 60;
  run(s, 50, { throttle: .3 }); assert(codes(s).includes('give_way'), JSON.stringify(codes(s)));
  s = findRoute('roundabout'); e = firstEvent(s, 'roundabout');
  // Wrong way: on the ring, driving against the flow.
  const a0 = Math.atan2(D.pointAtS(s.w.road, e.s - 30).y - e.y, D.pointAtS(s.w.road, e.s - 30).x - e.x) + 1;
  Object.assign(s.c, { x: e.x + Math.cos(a0) * RING, y: e.y + Math.sin(a0) * RING, heading: a0 - Math.PI / 2, v: 4 });
  s.w.at = null; s.w.previous = null; D.updateRoad(s.w, s.c, 0); s.w.previous = { x: s.c.x, y: s.c.y, s: s.w.at.s };
  s.w.time = 50; run(s, 20, { throttle: .2, steer: -.4 }); assert(codes(s).includes('round_dir'), JSON.stringify(codes(s)));
  assert(s.l.score < 100); assert(s.l.faults.every(f => ['minor', 'serious'].includes(f.severity)));
});
test('route defs: Open road group, endless + loop, route numbers, manual stays default', () => {
  const defs = D.roadDefinitions('left', 9);
  assert.deepEqual(defs.map(d => d.id), ['endless', 'loop']); assert(defs.every(d => d.group === 'Open road' && d.route === 9 && d.gates.length === 0));
  const s = D.session(defs[0], { side: 'left' }); assert.equal(s.c.auto, false);
  const p = D.spawnPose(s.w.road, 'left'); assert(Math.abs(s.c.x - p.x) < 1e-9);
  assert(s.w.at === null); D.tick(s, {}, 1 / 60); assert(s.w.at.lat > 0, 'spawns in the left lane');
  assert.match(D.hint(s.l, s.c), /Handbrake|Start|clutch|Press|engine/i);
});
