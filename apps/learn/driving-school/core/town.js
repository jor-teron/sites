(function (root, factory) {
  const api = factory();
  if (typeof module === 'object') module.exports = api;
  else Object.assign(root.DS = root.DS || {}, api);
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  function roadLessons(side = 'left') {
    const o = side === 'left' ? -3.5 : 3.5, east = 60 + o, west = 60 - o, south = 60 - o;
    const defs = [
      { id: 'lane', name: '7 · Lane keeping', spawn: [25, east, 0], gates: [[45, east], [76, east], [96, east]],
        cards: ['Start, check mirrors and drive straight along your lane. Keep below 30 km/h.', 'Keep to your side of the dashed centre line. Follow all three rings.'] },
      { id: 'turn', name: '8 · Turn with signals', spawn: [100, west, Math.PI], gates: [[82, west], [south, west], [south, 82], [south, 105]],
        cards: ['Check mirrors, signal LEFT before the junction and slow to walking pace.', 'Turn left into the correct lane. Unwind steering and cancel the signal after the turn.'], requiredSignal: 'left' },
      { id: 'signals', name: '9 · Traffic signals', spawn: [125, east, 0], time: 13, gates: [[138, east], [155, east], [170, east]],
        cards: ['Red: stop before the white line. Wait; do not enter on amber.', 'Green: check the junction and move off only if it is clear.'], needsWait: true },
      { id: 'roundabout', name: '10 · Roundabout', spawn: [138, 180 + o, 0],
        gates: (side === 'left' ? [[155,176.5],[165,169],[180,165],[195,178],[187,194],[170,192],[165,180]] : [[155,183.5],[165,191],[180,195],[195,182],[187,166],[170,168],[165,180]]),
        cards: ['Slow before entry. Give way to traffic already circulating. Follow the blue rings.', side === 'left' ? 'Keep clockwise around the island. Signal before the exit.' : 'Keep anticlockwise around the island. Signal before the exit.'] },
      { id: 'yield', name: '11 · Stop and give way', spawn: [south, 24, Math.PI / 2], gates: [[south, 45], [south, 72], [south, 100]],
        cards: ['At STOP make a complete stop before the white line for at least one second.', 'Look both ways. Yield to traffic and people before crossing.'], needsStop: true },
      { id: 'parallel', name: '12 · Parallel parking', spawn: [88, east, 0], gates: [[108, east], [112, 50], [104, 45]],
        cards: ['Signal towards the bay, check mirrors, stop beside the blue parking bay.', 'Select reverse. Back slowly into the bay. Straighten, stop, neutral and handbrake.'],
        parking: { x: 104, y: 45, heading: 0, width: 12, height: 3 } },
      { id: 'bay', name: '13 · Reverse into a bay', spawn: [190, 180 + o, 0], gates: [[208, 180 + o], [207, 172], [201.5, 167]],
        cards: ['Move beside the parking bay; check all around then stop and select reverse.', 'Reverse at walking pace. Turn into the bay, straighten, stop, neutral and handbrake.'],
        parking: { x: 201.5, y: 167, heading: Math.PI / 2, width: 3, height: 7 } }
    ];
    return defs.map(d => Object.assign({ town: true, side }, d));
  }
  function signalAt(t) {
    const phase = ((t % 24) + 24) % 24;
    return phase < 9 ? 'green' : phase < 12 ? 'amber' : 'red';
  }
  function pathPose(points, travelled) {
    const lengths = points.map((p, i) => Math.hypot(p[0] - points[(i + 1) % points.length][0], p[1] - points[(i + 1) % points.length][1]));
    const length = lengths.reduce((a, b) => a + b, 0); let d = ((travelled % length) + length) % length;
    for (let i = 0; i < lengths.length; i++) {
      if (d <= lengths[i]) {
        const p = points[i], q = points[(i + 1) % points.length], f = d / lengths[i];
        return { x: p[0] + (q[0] - p[0]) * f, y: p[1] + (q[1] - p[1]) * f, heading: Math.atan2(q[1] - p[1], q[0] - p[0]) };
      }
      d -= lengths[i];
    }
    return { x: points[0][0], y: points[0][1], heading: 0 };
  }
  function world(side = 'left', time = 0) {
    const o = side === 'left' ? -3.5 : 3.5;
    const outer = side === 'left' ?
      [[60+o,60+o],[180-o,60+o],[180-o,156],[192,167],[196,180],[187,195],[172,195],[158,180-o],[60+o,180-o]] :
      [[60-o,60-o],[60-o,180+o],[155,180+o],[166,192],[180,196],[194,187],[195,172],[180+o,157],[180+o,60-o]];
    const cars = [25, 135, 255].map((d, i) => Object.assign({ id: i, path: outer, travel: d, v: 0, auto: true, steer: 0 }, pathPose(outer, d)));
    // One circulating car demonstrates right-of-way and circulation direction.
    const ring = Array.from({ length: 32 }, (_, i) => { const a = i * Math.PI / 16 * (side === 'left' ? 1 : -1); return [180 + 16 * Math.cos(a), 180 + 16 * Math.sin(a)]; });
    cars.push(Object.assign({ id: 3, path: ring, travel: 35, v: 0, auto: true, steer: 0 }, pathPose(ring, 35)));
    return { side, time, cars, pedestrians: [], stopDwell: 0, stopSatisfied: false, waitDwell: 0,
      cooldown: {}, faults: [], totalFaults: 0, previous: null, turnStart: null, turnSignalled: false };
  }
  function updateWorld(w, player, dt) {
    w.time += dt;
    const phase = w.time % 18, walking = phase > 2 && phase < 10;
    w.pedestrians = walking ? [{ x: 116, y: 49 + (phase - 2) * 2.75, active: true }] : [];
    const snapshots = w.cars.map(c => ({ x: c.x, y: c.y }));
    for (const ai of w.cars) {
      const ahead = p => { const dx = p.x - ai.x, dy = p.y - ai.y; return dx * Math.cos(ai.heading) + dy * Math.sin(ai.heading) > 0 && Math.abs(-dx * Math.sin(ai.heading) + dy * Math.cos(ai.heading)) < 2.6; };
      let target = ai.id === 3 ? 3 : 5;
      if (Math.cos(ai.heading) > .7 && Math.abs(ai.y - 60) < 7 && ai.x < 141 && ai.x > 124 && signalAt(w.time) !== 'green') target = 0;
      const obstacles = snapshots.filter((_, i) => w.cars[i] !== ai).concat([player], w.pedestrians);
      if (obstacles.some(p => ahead(p) && distance(ai, p) < (p.active ? 11 : 9))) target = 0;
      ai.v += Math.max(-dt * 4, Math.min(dt * 2, target - ai.v));
      ai.travel += ai.v * dt; Object.assign(ai, pathPose(ai.path, ai.travel));
    }
  }
  function updateRoadLesson(l, c, w, dt) {
    l.elapsed += dt; l.distance = c.distance;
    if (c.distance > 3) l.phase = 1;
    if (l.def.needsStop && !w.stopSatisfied) l.phase = 0;
    if (l.def.needsWait && w.waitDwell < 1) l.phase = 0;
    const gate = l.def.gates[l.gate];
    if (gate && Math.hypot(c.x - gate[0], c.y - gate[1]) < 5 && Math.abs(c.v) < 9) l.gate++;
    if (l.gate >= l.def.gates.length) {
      const p = l.def.parking;
      if (p) {
        const dx = Math.abs(c.x - p.x), dy = Math.abs(c.y - p.y);
        const aligned = Math.abs(wrap(c.heading - p.heading)) < .2;
        l.done = dx < p.width / 2 - .8 && dy < p.height / 2 - .6 && aligned && Math.abs(c.v) < .1 && c.handbrake && c.gear === 0;
      } else l.done = (!l.def.needsStop || w.stopSatisfied) && (!l.def.needsWait || w.waitDwell >= 1);
    }
    l.score = Math.max(0, 100 - l.faults.reduce((n, f) => n + (f.severity === 'serious' ? 25 : 5), 0));
  }
  return { roadLessons, signalAt, pathPose, world, updateWorld, updateRoadLesson };
});
