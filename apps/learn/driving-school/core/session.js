(function (root, factory) {
  const api = factory(typeof module === 'object' ? Object.assign({}, require('./physics.js'), require('./lessons.js'), require('./town.js'), require('./rules.js'), require('./roadgen.js'), require('./roadrules.js')) : root.DS);
  if (typeof module === 'object') module.exports = api;
  else Object.assign(root.DS, api);
})(typeof window === 'object' ? window : globalThis, function (D) {
  function session(def, options = {}) {
    if (def.road) {
      const w = D.roadWorld(def, options.side || 'left'), p = w.spawn;
      return { c: D.car({ x: p.x, y: p.y, heading: p.heading, auto: !!options.auto }), l: D.lesson(def), paused: false, saved: false, w };
    }
    const [x, y, heading] = def.spawn;
    return { c: D.car({ x, y, heading, auto: !!options.auto }), l: D.lesson(def), paused: false, saved: false, w: def.town ? D.world(options.side || 'left', def.time || 0) : null };
  }
  function tick(s, input, dt) {
    if (s.paused || s.l.done) return;
    D.step(s.c, input, dt);
    if (s.w && s.w.road) {   // DS-3 open road: no map edge, the road goes on
      if (s.c.stalls > s.l.stallCount) { D.penalize(s.l, 'stall', 'Engine stalled: use clutch and gentle throttle.', 5); s.l.stallCount = s.c.stalls; }
      D.updateRoad(s.w, s.c, dt); D.checkRoadRules(s.w, s.c, s.l, dt); D.updateDriveLesson(s.l, s.c, s.w, dt);
      return;
    }
    const maxX = s.w ? 257 : 237, maxY = s.w ? 237 : 197;
    if (s.c.x < 3 || s.c.x > maxX || s.c.y < 3 || s.c.y > maxY) {
      s.c.x = D.clamp(s.c.x, 3, maxX); s.c.y = D.clamp(s.c.y, 3, maxY); s.c.v = 0;
    }
    if (s.w) {
      if (s.c.stalls > s.l.stallCount) { D.penalize(s.l, 'stall', 'Engine stalled: use clutch and gentle throttle.', 5); s.l.stallCount = s.c.stalls; }
      D.updateWorld(s.w, s.c, dt); D.checkRules(s.w, s.c, s.l, dt);
      D.updateRoadLesson(s.l, s.c, s.w, dt);
    } else D.updateLesson(s.l, s.c, dt);
  }
  return { session, tick };
});
