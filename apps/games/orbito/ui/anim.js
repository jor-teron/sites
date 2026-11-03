/*
 * Orbito — short animations (ORB-1): a rival marble sliding one square, and the board turning
 * (both rings one step counter-clockwise). One animation at a time, capped at ORB_CONFIG.animFps (30)
 * and only running while something moves: there is no game loop. Skipped (jumps straight to the end)
 * when the device asks for reduced motion or the shared Low graphics setting is on. The game state is
 * saved before an animation starts, so a reload mid-turn simply shows the finished turn.
 */
const OBAnim = (() => {
  const C = ORB_CONFIG;
  let cur = null, raf = 0, forceOff = false;

  const off = () => forceOff || !!OB_SETTINGS.get('lowGraphics') ||
    !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  /** Run frame(t 0..1) over ms, then done(). Instant when animations are off. */
  function run(ms, frame, done) {
    finish();
    if (off() || ms <= 0) { frame(1); if (done) done(); return; }
    const t0 = performance.now(), gap = 1000 / C.animFps - 2;
    let last = -1e9;
    cur = { frame, done };
    const step = (now) => {
      if (!cur || cur.frame !== frame) return;
      const e = now - t0;
      if (e >= ms) { cur = null; raf = 0; frame(1); if (done) done(); return; }
      if (now - last >= gap) { last = now; frame(e / ms); }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }
  /** Jump the running animation to its end (new game, setup, theme change). */
  function finish() {
    if (!cur) return;
    const c = cur; cur = null; cancelAnimationFrame(raf); raf = 0;
    c.frame(1); if (c.done) c.done();
  }
  return { run, finish, busy: () => !!cur, off, setOff: (b) => { forceOff = !!b; } };
})();
