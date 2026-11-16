/* DS-3 procedural roads. DOM-free and three.js-free, so Node can test it.
   Idea adapted from the OutRun-style "chain of sections" (enter, hold, leave, curve, hill):
   a seeded generator turns a route number into sections, and the same number always gives
   the same road. Two modes:
     endless: sections are generated ahead of the car and old points are dropped behind it,
              so memory stays bounded however far you drive.
     loop:    a closed, star-shaped loop (polar radius made of a few seeded waves), so it can
              never cross itself and the last point joins back to the first.
   World: x east, y south, metres (as core/physics.js). h = road height in metres.
   Lateral offset: + is the left of the road direction. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object') module.exports = api;
  else Object.assign(root.DS = root.DS || {}, api);
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const STEP = 4, CHUNK = 25;                 // metres between centreline points; points per 3D chunk (100 m)
  const AHEAD = 420, BEHIND = 160;            // endless window kept around the car, metres
  const TAU = Math.PI * 2;
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  // Road types: width (m, both directions), lanes each way, speed limit (km/h).
  const TYPES = {
    city: { name: 'City road', width: 7.4, lanes: 1, limit: 40 },
    highway: { name: 'Highway', width: 14, lanes: 2, limit: 80 },
    ghat: { name: 'Ghat road', width: 7, lanes: 1, limit: 30 },
    village: { name: 'Village road', width: 5.2, lanes: 1, limit: 25 }
  };
  const ROUND = { island: 6.5, outer: 14 };   // roundabout: island radius, outer edge of the ring road
  function rng(seed) {                        // mulberry32
    let a = (seed >>> 0) || 1;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const routeSeed = (route, mode) => (Math.imul((Math.max(1, route | 0)) ^ 0x9e3779b9, 2654435761) ^ (mode === 'loop' ? 0x51ed27 : 0x1b873593)) >>> 0;
  function hash(a, b) { let h = Math.imul(a ^ 0x85ebca6b, 0xc2b2ae35) ^ Math.imul(b + 0x27d4eb2f, 0x165667b1); h ^= h >>> 13; return (Math.imul(h, 0x9e3779b1) >>> 0); }

  // ---------- endless: sections ----------
  // A section is { len, turn (total radians), hill (total height change), type, event? }.
  // The curve profile is eased (enter, hold, leave) with a half sine, so steering builds and unwinds.
  function stretchSections(R, type, heading, first) {
    const out = [], r = (a, b) => a + (b - a) * R(), sign = () => R() < .5 ? -1 : 1;
    // Pull the heading back towards east so the road never doubles back over itself.
    const turnSign = () => heading > .35 ? -1 : heading < -.35 ? 1 : sign();
    const curve = (len, ang) => { const s = turnSign(); out.push({ len, turn: s * ang, hill: 0, type }); heading += s * ang; };
    const straight = (len, hill = 0) => out.push({ len, turn: 0, hill, type, straight: true });
    if (first) straight(120);
    if (type === 'city') {
      for (let i = 0, n = 2 + (R() * 2 | 0); i < n; i++) { straight(Math.round(r(100, 150) / STEP) * STEP); curve(Math.round(r(40, 70) / STEP) * STEP, r(.3, .8)); }
    } else if (type === 'highway') {
      for (let i = 0; i < 2; i++) { straight(Math.round(r(160, 260) / STEP) * STEP, i ? 0 : r(2, 4)); curve(Math.round(r(140, 220) / STEP) * STEP, r(.15, .35)); }
    } else if (type === 'village') {
      for (let i = 0, n = 3 + (R() * 2 | 0); i < n; i++) { straight(Math.round(r(84, 120) / STEP) * STEP); curve(Math.round(r(32, 56) / STEP) * STEP, r(.35, .9)); }
    } else {   // ghat: straighten, then climbing switchbacks (hairpin pairs), then a winding descent
      if (Math.abs(heading) > .05) { out.push({ len: 60, turn: -heading, hill: 0, type }); heading = 0; }
      straight(60);
      const pairs = 1 + (R() < .5 ? 1 : 0), first = sign();
      for (let i = 0; i < pairs; i++) {
        const rad = r(15, 18), rise = r(4, 6);
        out.push({ len: Math.round(Math.PI * rad / STEP) * STEP, turn: first * Math.PI, hill: rise / 2, type, hairpin: true });
        straight(Math.round(r(48, 72) / STEP) * STEP, rise / 2);
        out.push({ len: Math.round(Math.PI * rad / STEP) * STEP, turn: -first * Math.PI, hill: rise / 2, type, hairpin: true });
        straight(Math.round(r(44, 60) / STEP) * STEP, -rise / 2);
      }
      out.push({ len: 120, turn: 0, hill: 0, type, descend: true });
    }
    return { sections: out, heading };
  }
  // Road events by rules: only on long straights, never near the start, kept apart; few and simple.
  const EVENT_RULES = { city: ['zebra', 'roundabout', 'breaker', 'junction'], village: ['breaker', 'junction', 'zebra'], highway: [], ghat: [] };
  function pickEvent(R, type, used) {
    const list = EVENT_RULES[type].filter(k => !used.has(k));
    return list.length && R() < .85 ? list[R() * list.length | 0] : null;
  }

  function createEndless(seed) {
    const R = rng(seed), road = { mode: 'endless', seed, pts: [], base: 0, events: [], signs: [], length: Infinity };
    let x = 0, y = 0, dir = 0, h = 0, width = TYPES.city.width, s = 0, queue = [], heading = 0, stretch = 0, lastType = '';
    const order = ['city', 'village', 'highway', 'ghat'];
    function nextStretch() {
      let type = stretch === 0 ? 'city' : order[R() * order.length | 0];
      if (type === lastType) type = order[(order.indexOf(type) + 1 + (R() * 3 | 0)) % order.length];
      const st = stretchSections(R, type, heading, stretch === 0); heading = st.heading;
      // Events go in the middle of straights at least 100 m long.
      const used = new Set();
      for (const sec of st.sections) if (sec.straight && sec.len >= 100 && !sec.hill) { const k = pickEvent(R, type, used); if (k) { sec.event = k; used.add(k); } }
      // Descend back to ground level when a ghat finishes.
      for (const sec of st.sections) if (sec.descend) sec.hill = -1;   // resolved when the section starts
      road.signs.push({ s: Math.max(8, s - 30), kind: 'limit', text: String(TYPES[type].limit), type });
      if (type === 'ghat') road.signs.push({ s: s + 30, kind: 'warn', text: 'GHAT', type });
      stretch++; lastType = type; queue = queue.concat(st.sections);
    }
    let sec = null, secAt = 0, h0 = 0;
    function push() {
      const T = TYPES[sec.type], target = T.width;
      width += clamp(target - width, -.35, .35);
      road.pts.push({ i: road.base + road.pts.length, s, x, y, h, dir, type: sec.type, width, limit: T.limit, lanes: width > 10 ? 2 : 1 });
    }
    function startSection() {
      if (!queue.length) nextStretch();
      sec = queue.shift(); secAt = 0; h0 = h;
      if (sec.hill === -1) sec.hill = -h;
      if (sec.event && s + sec.len / 2 < 150) sec.event = null;
      if (sec.event) {
        const at = s + sec.len / 2, side = R() < .5 ? 1 : -1;
        road.events.push({ kind: sec.event, s: Math.round(at / STEP) * STEP, side, id: road.events.length + 1 + stretch * 10 });
        const warn = { zebra: 'ZEBRA', roundabout: 'ROUND', breaker: 'HUMP', junction: 'T' }[sec.event];
        road.signs.push({ s: Math.round((at - 40) / STEP) * STEP, kind: 'warn', text: warn, type: sec.type });
      }
      if (sec.hairpin) road.signs.push({ s: Math.max(0, s - 24), kind: 'warn', text: 'BEND', type: sec.type });
    }
    function step() {
      if (!sec || secAt >= sec.len - 1e-6) startSection();
      const f0 = secAt / sec.len, f1 = (secAt + STEP) / sec.len;
      // Half-sine curvature: integral over the section equals sec.turn.
      const dTurn = sec.turn * ((1 - Math.cos(Math.PI * f1)) - (1 - Math.cos(Math.PI * f0))) / 2;
      const dirMid = dir + dTurn / 2;
      x += Math.cos(dirMid) * STEP; y += Math.sin(dirMid) * STEP; dir = wrap(dir + dTurn);
      h = h0 + sec.hill * (1 - Math.cos(Math.PI * Math.min(1, f1))) / 2; h = Math.max(0, h);
      s += STEP; secAt += STEP; push();
    }
    sec = null; startSection(); push();
    road.ensure = function (sAhead) { while (s < sAhead) step(); };
    road.trim = function (sBehind) {
      let n = 0; while (n < road.pts.length - 2 && road.pts[n].s < sBehind) n++;
      if (n) { road.pts.splice(0, n); road.base += n; }
      road.events = road.events.filter(e => e.s > sBehind - 40); road.signs = road.signs.filter(g => g.s > sBehind - 10);
    };
    road.point = i => road.pts[i - road.base];
    road.has = i => i >= road.base && i < road.base + road.pts.length;
    road.first = () => road.base; road.last = () => road.base + road.pts.length - 1;
    road.ensure(AHEAD);
    return road;
  }

  // ---------- loop ----------
  function createLoop(seed) {
    const R = rng(seed), r = (a, b) => a + (b - a) * R();
    const R0 = r(210, 290), waves = [[1, r(.06, .12), r(0, TAU)], [2, r(.05, .1), r(0, TAU)], [3, r(.02, .05), r(0, TAU)]];
    // Stretches around the loop; the first is always a city road where the route starts.
    const kinds = ['city', 'village', 'highway', 'ghat'], n = 4;
    const order = ['city'].concat([1, 2, 3].map(() => kinds[1 + (R() * 3 | 0)]));
    for (let i = 2; i < n; i++) if (order[i] === order[i - 1]) order[i] = kinds[1 + (kinds.indexOf(order[i]) % 3)];
    const cuts = [0, r(.2, .3), r(.45, .55), r(.7, .8), 1];
    const typeAt = u => order[cuts.findIndex((c, i) => u >= c && u < cuts[i + 1])] || order[n - 1];
    const ghatWeight = u => { const i = order.indexOf('ghat'); if (i < 0) return 0; const a = cuts[i], b = cuts[i + 1]; if (u < a || u > b) return 0; return Math.sin(Math.PI * (u - a) / (b - a)); };
    const villageWeight = u => { const i = order.indexOf('village'); if (i < 0) return 0; const a = cuts[i], b = cuts[i + 1]; return u < a || u > b ? 0 : Math.sin(Math.PI * (u - a) / (b - a)); };
    const hillPhase = r(0, TAU);
    const radius = u => { const th = u * TAU; let k = 1; for (const [f, a, p] of waves) k += a * Math.sin(f * th + p); return R0 * (k + .035 * ghatWeight(u) * Math.sin(12 * th) + .02 * villageWeight(u) * Math.sin(18 * th)); };
    const pos = u => { const th = u * TAU, rr = radius(u); return [rr * Math.cos(th), rr * Math.sin(th)]; };
    // Arc length, then resample at an even STEP so every point is the same distance apart.
    const fine = 4000, acc = [0]; let prev = pos(0);
    for (let i = 1; i <= fine; i++) { const p = pos(i / fine); acc.push(acc[i - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1])); prev = p; }
    const total = acc[fine], N = Math.round(total / STEP), L = N * STEP, pts = [];
    let j = 0, width = TYPES[typeAt(0)].width;
    for (let i = 0; i < N; i++) {
      const target = i / N * total; while (j < fine && acc[j + 1] < target) j++;
      const u = (j + (target - acc[j]) / ((acc[j + 1] - acc[j]) || 1)) / fine, [x, y] = pos(u), type = typeAt(u), T = TYPES[type];
      const h = 7 * ghatWeight(u) + 1.5 * (1 + Math.sin(2 * u * TAU + hillPhase));
      pts.push({ i, s: i * STEP, x, y, h, dir: 0, type, width: T.width, limit: T.limit, lanes: 1, u });
    }
    // Headings from neighbours; widths blended across type changes (both ways round, so it closes).
    for (let i = 0; i < N; i++) { const a = pts[(i - 1 + N) % N], b = pts[(i + 1) % N]; pts[i].dir = Math.atan2(b.y - a.y, b.x - a.x); }
    for (let pass = 0; pass < 2; pass++) for (let k = 0; k < 2 * N; k++) { const i = k % N, p = pts[i], q = pts[(i - 1 + N) % N]; p.width = q.width + clamp(p.width - q.width, -.35, .35); }
    for (let pass = 0; pass < 1; pass++) for (let k = 2 * N; k > 0; k--) { const i = k % N, p = pts[i], q = pts[(i + 1) % N], T = TYPES[p.type]; p.width = Math.max(Math.min(p.width, T.width), q.width + clamp(p.width - q.width, -.35, .35) - .35); }
    for (const p of pts) p.lanes = p.width > 10 ? 2 : 1;
    // Signs and events by rules, on the straightest parts of city/village stretches.
    const road = { mode: 'loop', seed, pts, base: 0, events: [], signs: [], length: L, n: N };
    const bend = i => Math.abs(wrap(pts[(i + 6) % N].dir - pts[(i - 6 + N) % N].dir));
    for (let k = 0; k < n; k++) {
      const a = Math.ceil(cuts[k] * N), b = Math.floor(cuts[k + 1] * N), type = order[k];
      road.signs.push({ s: ((a - 8 + N) % N) * STEP, kind: 'limit', text: String(TYPES[type].limit), type });
      if (type === 'ghat') road.signs.push({ s: ((a + 8) % N) * STEP, kind: 'warn', text: 'GHAT', type });
      const used = new Set(), want = EVENT_RULES[type].slice(0, 2);
      for (const kind of want) {
        let best = -1, bestBend = 1e9;
        for (let i = a + 15; i < b - 15; i++) {
          const s0 = i * STEP; if (s0 < 120 || s0 > L - 60) continue;
          if (road.events.some(e => Math.abs(e.s - s0) < 110)) continue;
          const bb = bend(i); if (bb < bestBend) { bestBend = bb; best = i; }
        }
        if (best >= 0 && bestBend < .3 && !used.has(kind)) {
          used.add(kind); road.events.push({ kind, s: best * STEP, side: R() < .5 ? 1 : -1, id: road.events.length + 1 });
          road.signs.push({ s: ((best - 10 + N) % N) * STEP, kind: 'warn', text: { zebra: 'ZEBRA', roundabout: 'ROUND', breaker: 'HUMP', junction: 'T' }[kind], type });
        }
      }
    }
    road.events.sort((p, q) => p.s - q.s);
    road.ensure = () => {}; road.trim = () => {};
    road.point = i => pts[((i % N) + N) % N];
    road.has = () => true; road.first = () => 0; road.last = () => N - 1;
    return road;
  }
  function createRoad(route = 1, mode = 'endless') {
    const seed = routeSeed(route, mode);
    const road = mode === 'loop' ? createLoop(seed) : createEndless(seed);
    road.route = Math.max(1, route | 0);
    // Events carry their position, so rules and drawing need no lookups.
    road.place = function (e) { if (e.x == null) { const p = pointAtS(road, e.s); if (!p) return e; Object.assign(e, { x: p.x, y: p.y, h: p.h, dir: p.dir, width: p.width }); } return e; };
    return road;
  }
  // Point on the centreline at distance s (interpolated).
  function pointAtS(road, s) {
    if (road.mode === 'loop') s = ((s % road.length) + road.length) % road.length;
    const i = Math.floor(s / STEP), f = s / STEP - i, a = road.point(i), b = road.point(i + 1) || a;
    if (!a) return null;
    const d = wrap(b.dir - a.dir);
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, h: a.h + (b.h - a.h) * f, dir: wrap(a.dir + d * f), width: a.width + (b.width - a.width) * f, type: a.type, limit: a.limit, lanes: a.lanes, s };
  }
  // Nearest centreline position to (x, y). hint = last known index, to search only nearby.
  function project(road, x, y, hint) {
    let lo, hi;
    if (hint == null) { lo = road.first(); hi = road.mode === 'loop' ? road.n - 1 : road.last() - 1; }
    else { lo = hint - 30; hi = hint + 30; if (road.mode !== 'loop') { lo = Math.max(road.first(), lo); hi = Math.min(road.last() - 1, hi); } }
    let best = null;
    for (let i = lo; i <= hi; i++) {
      const a = road.point(i), b = road.point(i + 1); if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1e-9, f = clamp(((x - a.x) * dx + (y - a.y) * dy) / L2, 0, 1);
      const px = a.x + dx * f, py = a.y + dy * f, d = Math.hypot(x - px, y - py);
      if (!best || d < best.d) {
        const dir = Math.atan2(dy, dx);
        best = { d, i, f, x: px, y: py, dir, lat: (x - px) * Math.sin(dir) - (y - py) * Math.cos(dir), h: a.h + (b.h - a.h) * f,
          s: a.s + f * STEP, width: a.width + (b.width - a.width) * f, type: a.type, limit: a.limit, lanes: a.lanes };
      }
    }
    return best;
  }
  // Lane centre offset for traffic travelling along the road (dir +1) or against it (-1).
  function laneOffset(width, lanes, side, dir = 1, k = 0) {
    const sgn = side === 'right' ? -1 : 1, w = width / (2 * lanes);
    return (lanes - .5 - k) * w * sgn * dir;
  }
  function spawnPose(road, side) {
    const p = pointAtS(road, 12), off = laneOffset(p.width, p.lanes, side);
    return { x: p.x + Math.sin(p.dir) * off, y: p.y - Math.cos(p.dir) * off, heading: p.dir };
  }
  // Chunk k covers point indices [k*CHUNK, (k+1)*CHUNK] (shared end point, so chunks join).
  const chunkOf = i => Math.floor(i / CHUNK);
  function chunkWindow(road, i, back = 2, ahead = 4) {
    const k = chunkOf(i), out = [];
    if (road.mode === 'loop') {
      const total = Math.ceil(road.n / CHUNK);
      for (let d = -back; d <= ahead && out.length < total; d++) out.push(((k + d) % total + total) % total);
      return out;
    }
    for (let d = -back; d <= ahead; d++) { const c = k + d; if (c * CHUNK >= road.first() && (c + 1) * CHUNK <= road.last()) out.push(c); }
    return out;
  }
  function chunkPoints(road, k) {
    const out = [], end = road.mode === 'loop' ? Math.min((k + 1) * CHUNK, road.n) : (k + 1) * CHUNK;
    for (let i = k * CHUNK; i <= end; i++) { const p = road.point(i); if (p) out.push(p); }
    return out;
  }
  // Scenery by rules, seeded per chunk so a rebuilt chunk looks the same.
  function chunkScenery(road, k) {
    const R = rng(hash(road.seed, k)), pts = chunkPoints(road, k), out = { trees: [], poles: [], houses: [] };
    const nearEvent = (x, y) => road.events.some(e => { road.place(e); return e.x != null && Math.hypot(e.x - x, e.y - y) < (e.kind === 'roundabout' ? 30 : e.kind === 'junction' ? 18 : 6); });
    const put = (list, p, side, off, extra) => {
      const x = p.x + Math.sin(p.dir) * off * side, y = p.y - Math.cos(p.dir) * off * side;
      if (!nearEvent(x, y)) list.push(Object.assign({ x, y, h: p.h, dir: p.dir }, extra));
    };
    pts.forEach((p, j) => {
      if (j === pts.length - 1) return;
      const half = p.width / 2;
      if (p.type === 'city') {
        if (j % 5 === 0) put(out.poles, p, j % 10 ? 1 : -1, half + 1.2);
        if (j % 4 === 1) for (const side of [1, -1]) if (R() < .7) put(out.houses, p, side, half + 7 + R() * 3, { w: 8 + R() * 6, d: 8, ht: 6 + R() * 9, c: R() * 4 | 0 });
      } else if (p.type === 'highway') {
        if (j % 12 === 0) put(out.poles, p, 1, half + 2);
        if (j % 3 === 0) for (const side of [1, -1]) if (R() < .45) put(out.trees, p, side, half + 6 + R() * 8, { ht: 5 + R() * 4 });
      } else if (p.type === 'ghat') {
        if (j % 2 === 0) for (const side of [1, -1]) if (R() < .6) put(out.trees, p, side, half + 3 + R() * 9, { ht: 6 + R() * 6 });
      } else {
        if (j % 3 === 0) for (const side of [1, -1]) if (R() < .55) put(out.trees, p, side, half + 3 + R() * 7, { ht: 4 + R() * 4 });
        if (j % 9 === 4 && R() < .6) put(out.houses, p, R() < .5 ? 1 : -1, half + 6 + R() * 2, { w: 5, d: 5, ht: 3, c: 4 });
      }
    });
    return out;
  }
  return { ROAD_STEP: STEP, ROAD_CHUNK: CHUNK, ROAD_AHEAD: AHEAD, ROAD_BEHIND: BEHIND, ROAD_TYPES: TYPES, ROUND, roadRng: rng, routeSeed,
    createRoad, pointAtS, projectRoad: project, laneOffset, spawnPose, chunkOf, chunkWindow, chunkPoints, chunkScenery };
});
