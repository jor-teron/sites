(function (root, factory) {
  const api = factory(typeof module === 'object' ? Object.assign({}, require('./physics.js'), require('./lessons.js')) : root.DS);
  if (typeof module === 'object') module.exports = api;
  else Object.assign(root.DS, api);
})(typeof window === 'object' ? window : globalThis, function (D) {
  function session(def, options = {}) {
    const [x, y, heading] = def.spawn;
    return { c: D.car({ x, y, heading, auto: !!options.auto }), l: D.lesson(def), paused: false, saved: false };
  }
  function tick(s, input, dt) {
    if (s.paused || s.l.done) return;
    D.step(s.c, input, dt);
    if (s.c.x < 3 || s.c.x > 237 || s.c.y < 3 || s.c.y > 197) {
      s.c.x = D.clamp(s.c.x, 3, 237); s.c.y = D.clamp(s.c.y, 3, 197); s.c.v = 0;
    }
    D.updateLesson(s.l, s.c, dt);
  }
  return { session, tick };
});
