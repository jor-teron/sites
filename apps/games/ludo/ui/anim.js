/*
 * Ludo — short animations (LUDO-1c): a token sliding square by square, and the die tumbling.
 * One animation at a time, capped at LD_CONFIG.animFps (30) and only running while something moves:
 * there is still no game loop. Skipped (jumps straight to the end) when the device asks for reduced
 * motion or the shared Low graphics setting is on. The game state is already saved before an
 * animation starts, so a reload mid-slide simply shows the finished move.
 */
const LDAnim = (() => {
  const C = LD_CONFIG;
  let cur = null, raf = 0, forceOff = false;

  const off = () => forceOff || !!LD_SETTINGS.get('lowGraphics') ||
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
  /** Slide along pts ([x, y] grid points, one per square): onPoint(x, y, squareIndex) each frame. */
  function path(pts, onPoint, done) {
    const n = pts.length - 1;
    run(n * C.stepMs, (t) => {
      const f = Math.min(n, t * n), i = Math.min(n - 1, Math.floor(f)), u = f - i;
      const a = pts[Math.max(0, i)], b = pts[Math.min(n, i + 1)];
      onPoint(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, t >= 1 ? n : i);
    }, done);
  }
  /** Die tumble: onFace(face) with a random face every few frames, then the real one. */
  function die(v, onFace, done) {
    let lastSwap = -1;
    run(C.dieMs, (t) => {
      if (t >= 1) { onFace(v); return; }
      const slot = Math.floor(t * 6);
      if (slot !== lastSwap) { lastSwap = slot; onFace(1 + Math.floor(Math.random() * 6)); }
    }, done);
  }
  return { run, path, die, finish, busy: () => !!cur, off, setOff: (b) => { forceOff = !!b; } };
})();
