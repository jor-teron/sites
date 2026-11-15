/* DS-3 open-road drive: lesson definitions, the world around the car (generation window,
   roundabout traffic, zebra pedestrians, waiting junction cars) and the road rules.
   Reuses the fault shape of core/rules.js (code, reason, minor/serious, time) and its scoring.
   Roundabout give-way / direction / exit-signal checks are adapted from the DS-2b roundabout. */
(function (root, factory) {
  const api = factory(typeof module === 'object' ? require('./roadgen.js') : root.DS);
  if (typeof module === 'object') module.exports = api;
  else Object.assign(root.DS, api);
})(typeof window === 'object' ? window : globalThis, function (G) {
  'use strict';
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const R = G.ROUND, RING = (R.island + R.outer) / 2;
  const reasons = {
    off_road: ['Off the road onto the verge. Steer back onto the tarmac gently.', 'minor'],
    lane_line: ['Keep to your side of the road.', 'minor'],
    speeding: ['Over the speed limit here. Slow down.', 'minor'],
    breaker: ['Too fast over the speed breaker. Slow to 20 km/h or less.', 'minor'],
    pedestrian: ['Did not stop for the person on the zebra crossing.', 'serious'],
    give_way: ['Give way to traffic already on the roundabout.', 'serious'],
    round_dir: ['Wrong way round the roundabout.', 'serious'],
    round_exit: ['Signal before you leave the roundabout.', 'minor'],
    collision: ['Collision. Brake and leave more space.', 'serious']
  };
  function roadDefinitions(side = 'left', route = 1) {
    route = Math.max(1, route | 0);
    const cards = ['Start the engine, check mirrors, move off and keep left.', 'Follow the road. Watch the signs: speed limits change with the road type.'];
    return [
      { id: 'endless', name: 'Endless drive', group: 'Open road', road: 'endless', route, side, spawn: [0, 0, 0], gates: [], cards },
      { id: 'loop', name: 'Practice loop', group: 'Open road', road: 'loop', route, side, spawn: [0, 0, 0], gates: [], cards: cards.concat('Drive one full lap back to the start line.') }
    ];
  }
  function roadWorld(def, side = 'left') {
    const road = G.createRoad(def.route, def.road);
    return { road, side, time: 0, cars: [], pedestrians: [], walkers: {}, cooldown: {}, faults: [], totalFaults: 0,
      previous: null, at: null, progress: 0, wrongSide: 0, ring: null, lastSignal: null, spawn: G.spawnPose(road, side) };
  }
  function fault(w, l, code, reason) {
    if ((w.cooldown[code] ?? -100) + 5 > w.time) return;
    w.cooldown[code] = w.time;
    const [text, severity] = reasons[code], item = { code, reason: reason || text, severity, time: +w.time.toFixed(1) };
    w.faults.push(item); w.totalFaults++; l.faults.push(item);
  }
  // Signed distance along the road from a to b (loops wrap the short way round).
  function ds(road, a, b) { let d = b - a; if (road.mode === 'loop') { const L = road.length; d = ((d % L) + L * 1.5) % L - L / 2; } return d; }
  const sgnOf = side => side === 'right' ? -1 : 1;
  // Generate/drop road, move roundabout cars, start pedestrians, park junction cars.
  function updateRoad(w, c, dt) {
    w.time += dt;
    const road = w.road;
    const at = G.projectRoad(road, c.x, c.y, w.at ? w.at.i : null) || w.at;
    if (road.mode === 'endless') { road.ensure(at.s + G.ROAD_AHEAD); road.trim(at.s - G.ROAD_BEHIND); }
    w.at = at; c.z = at.h;
    const sgn = sgnOf(w.side), cars = [], peds = [];
    for (const e of road.events) {
      const gap = ds(road, at.s, e.s); if (gap < -80 || gap > 220) continue;
      road.place(e); if (e.x == null) continue;
      if (e.kind === 'roundabout') {
        // One car circulates (clockwise on the map for left-hand traffic), never stopping.
        const a = e.id * 1.7 + sgn * w.time * 5 / RING;
        cars.push({ id: 'r' + e.id, ring: e.id, x: e.x + Math.cos(a) * RING, y: e.y + Math.sin(a) * RING, h: e.h, heading: a + sgn * Math.PI / 2, v: 5 });
      } else if (e.kind === 'junction') {
        // A car waits in the side road, at its give-way line.
        const n = e.side, off = e.width / 2 + 6, back = 1.5 * n * sgn;
        cars.push({ id: 'j' + e.id, x: e.x + Math.sin(e.dir) * n * off + Math.cos(e.dir) * back, y: e.y - Math.cos(e.dir) * n * off + Math.sin(e.dir) * back, h: e.h, heading: e.dir + n * Math.PI / 2, v: 0 });
      } else if (e.kind === 'zebra') {
        // When the car gets within 45 m, a person starts to cross from the kerb (once per pass).
        const st = w.walkers[e.id] || (w.walkers[e.id] = { t: -1 });
        if (st.t < 0 && gap > 0 && gap < 45) st.t = 0;
        if (gap < -60 || gap > 200) st.t = -1;
        if (st.t >= 0) {
          st.t += dt; const along = -e.width / 2 - 1.5 + st.t * 1.3;
          if (along < e.width / 2 + 1.5) peds.push({ id: e.id, x: e.x + Math.sin(e.dir) * along * e.side, y: e.y - Math.cos(e.dir) * along * e.side, h: e.h, active: Math.abs(along) < e.width / 2 + .8, zebra: e.id });
        }
      }
    }
    w.cars = cars; w.pedestrians = peds;
  }
  function signalled(w, c, need) { return c.indicator === need || (w.lastSignal && w.lastSignal.dir === need && c.elapsed - w.lastSignal.at < 4); }
  function checkRoadRules(w, c, l, dt) {
    const road = w.road, at = w.at, side = w.side, sgn = sgnOf(side);
    const prev = w.previous || { x: c.x, y: c.y, s: at.s, indicator: c.indicator };
    const speed = Math.abs(c.v), kmh = speed * 3.6, move = ds(road, prev.s, at.s);
    if (c.indicator) w.lastSignal = { dir: c.indicator, at: c.elapsed };
    w.progress += move;
    const near = road.events.filter(e => e.x != null && Math.abs(ds(road, at.s, e.s)) < 40);
    const round = near.find(e => e.kind === 'roundabout' && Math.hypot(c.x - e.x, c.y - e.y) < R.outer + 8);
    const junction = near.find(e => e.kind === 'junction' && Math.abs(ds(road, at.s, e.s)) < 5);
    // Speed limit for this road type (1 km/h grace).
    // A lower limit counts 60 m after the road type changes, so there is room to slow down.
    const back = G.pointAtS(road, at.s - 60), limit = Math.max(at.limit, back ? back.limit : 0);
    if (kmh > limit + 1) fault(w, l, 'speeding', 'Over the ' + at.limit + ' km/h limit on this ' + G.ROAD_TYPES[at.type].name.toLowerCase() + '. Slow down.');
    if (round) {
      const d = Math.hypot(c.x - round.x, c.y - round.y), dPrev = Math.hypot(prev.x - round.x, prev.y - round.y), ang = Math.atan2(c.y - round.y, c.x - round.x);
      const forward = c.gear !== -1;
      if (dPrev >= R.outer + 1 && d < R.outer + 1 && forward && speed > .8) {
        // Entering: a circulating car just upstream has priority.
        const coming = w.cars.some(ai => { if (ai.ring !== round.id) return false; const a = Math.atan2(ai.y - round.y, ai.x - round.x), delta = wrap(ang - a) * sgn; return delta > 0 && delta < 1.25; });
        if (coming) fault(w, l, 'give_way');
        w.ring = { id: round.id, angle: 0, last: ang };
      }
      if (d > R.island && d < R.outer + .5 && speed > 1 && forward) {
        const vx = Math.cos(c.heading) * c.v, vy = Math.sin(c.heading) * c.v, spin = ((c.x - round.x) * vy - (c.y - round.y) * vx) / Math.max(1, d * speed);
        if (spin * sgn < -.6) fault(w, l, 'round_dir', side === 'left' ? 'Wrong way: go clockwise, keeping the island on your right.' : 'Wrong way: go anticlockwise, keeping the island on your left.');
      }
      if (w.ring && w.ring.id === round.id) { w.ring.angle += wrap(ang - w.ring.last) * sgn; w.ring.last = ang; }
      if (w.ring && d > R.outer + 1.5 && dPrev <= R.outer + 1.5) {
        const need = side === 'left' ? 'left' : 'right';
        if (w.ring.angle > .6 && !signalled(w, c, need)) fault(w, l, 'round_exit', 'Signal ' + need + ' before you leave the roundabout.');
        w.ring = null;
      }
      if (d < R.island + .9) { fault(w, l, 'collision'); c.v = 0; c.message = 'You hit the island. Stop and check all around.'; }
      if (d > R.outer + .5 && Math.abs(at.lat) > at.width / 2 + .3) fault(w, l, 'off_road');
    } else if (!junction) {
      // Off the tarmac (the verge slows the car), or on the wrong half of the road for too long.
      if (Math.abs(at.lat) > at.width / 2 + .3) { fault(w, l, 'off_road'); c.v *= 1 - Math.min(1, dt * .9); }
      const along = Math.cos(wrap(c.heading - at.dir)) >= 0 ? 1 : -1;
      if (speed > .6 && at.lat * sgn * along < -.4) { w.wrongSide += dt; if (w.wrongSide > 1.5) { fault(w, l, 'lane_line', side === 'left' ? 'Keep left: you are on the wrong side of the road.' : 'Keep right: you are on the wrong side of the road.'); w.wrongSide = 0; } }
      else w.wrongSide = 0;
    }
    for (const e of near) {
      // Zebra: the line that counts is 3 m before the stripes (stop before them, not on them).
      const line = e.kind === 'zebra' ? e.s - 3 * Math.sign(move) : e.s;
      const a = ds(road, prev.s, line), crossed = move > 0 ? a > 0 && a <= move : move < 0 && a <= 0 && a > move;
      if (!crossed) continue;
      if (e.kind === 'breaker') { if (kmh > 21) { fault(w, l, 'breaker'); c.v *= .8; } }
      else if (e.kind === 'zebra' && w.pedestrians.some(p => p.zebra === e.id && p.active)) fault(w, l, 'pedestrian');
    }
    const hit = w.cars.some(ai => Math.hypot(ai.x - c.x, ai.y - c.y) < 3.1) || w.pedestrians.some(p => Math.hypot(p.x - c.x, p.y - c.y) < 1.6);
    if (hit) { fault(w, l, 'collision'); c.v = 0; c.message = 'Collision: stop and check all around before moving again.'; }
    w.previous = { x: c.x, y: c.y, s: at.s, indicator: c.indicator };
  }
  function updateDriveLesson(l, c, w, dt) {
    l.elapsed += dt; l.distance = c.distance;
    if (c.distance > 3) l.phase = 1;
    if (w.road.mode === 'loop') { l.lap = Math.max(0, w.progress) / w.road.length; if (w.progress >= w.road.length - 6) l.done = true; }
    l.score = Math.max(0, 100 - l.faults.reduce((n, f) => n + (f.severity === 'serious' ? 25 : 5), 0));
    l.tip = roadTip(w, c);
  }
  // A short look-ahead hint: the next event or sign within 120 m, else the road type and limit.
  function roadTip(w, c) {
    const road = w.road, at = w.at; if (!at || !c.engine || c.distance < 3) return '';
    let next = null, gap = 1e9;
    for (const e of road.events) { const g = ds(road, at.s, e.s); if (g > -2 && g < 120 && g < gap) { gap = g; next = e; } }
    const m = Math.max(0, Math.round(gap));
    if (next) return {
      roundabout: 'Roundabout in ' + m + ' m: slow down, give way to traffic on it, go ' + (w.side === 'left' ? 'clockwise' : 'anticlockwise') + ' and signal to exit.',
      zebra: 'Zebra crossing in ' + m + ' m: be ready to stop for people crossing.',
      breaker: 'Speed breaker in ' + m + ' m: slow to 20 km/h or less.',
      junction: 'T-junction in ' + m + ' m: watch for the car waiting in the side road.' }[next.kind];
    return G.ROAD_TYPES[at.type].name + ' · limit ' + at.limit + ' km/h. Keep ' + w.side + '.';
  }
  return { roadDefinitions, roadWorld, updateRoad, checkRoadRules, updateDriveLesson, roadTip, roadRuleReasons: reasons, roadDelta: ds };
});
