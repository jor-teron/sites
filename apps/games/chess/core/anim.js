/* Chess move animation. Visual only: the game state is already updated when a glide starts.
   Pieces glide in a straight line at a constant speed in squares per second, so the
   duration is distance / speed and the pixel speed scales with the board size. */
(function (root) {
  const Chess = root.Chess = root.Chess || {};
  let cur = null, raf = 0, redraw = null, waiters = [];

  function now() { return (root.performance && performance.now) ? performance.now() : Date.now(); }
  function dist(a, b) { return Math.hypot((a & 7) - (b & 7), (a >> 3) - (b >> 3)); }
  function speed() { return (Chess.config.anim && Chess.config.anim.squaresPerSecond) || 8; }

  /* Build the glide for move m (already made on the board). */
  function plan(m) {
    const white = m.p > 0, moves = [{ piece: m.p, f: m.f, t: m.t }], fades = [];
    if (m.fl === 3) moves.push({ piece: white ? 4 : -4, f: white ? 7 : 63, t: white ? 5 : 61 });
    else if (m.fl === 4) moves.push({ piece: white ? 4 : -4, f: white ? 0 : 56, t: white ? 3 : 59 });
    if (m.fl === 2) fades.push({ piece: m.c, sq: m.t + (white ? -8 : 8) });
    else if (m.c) fades.push({ piece: m.c, sq: m.t });
    let far = 0;
    moves.forEach(function (x) { far = Math.max(far, dist(x.f, x.t)); });
    return { moves: moves, fades: fades, hide: moves.map(function (x) { return x.t; }), dur: far / speed() * 1000, dist: far };
  }
  function settle() {
    cur = null;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    const w = waiters; waiters = [];
    w.forEach(function (r) { r(); });
  }
  function tick() {
    raf = 0;
    if (!cur) return;
    if (now() - cur.start >= cur.dur) { settle(); if (redraw) redraw(); return; }
    if (redraw) redraw();
    raf = requestAnimationFrame(tick);
  }

  Chess.anim = {
    onFrame: function (fn) { redraw = fn; },
    start: function (m) {
      if (cur) settle();
      const p = plan(m);
      if (!(p.dur > 0) || typeof requestAnimationFrame === 'undefined') return;
      p.start = now();
      cur = p;
      raf = requestAnimationFrame(tick);
    },
    /* Jump to the end of any running glide. */
    finish: function () { if (cur) { settle(); if (redraw) redraw(); } },
    active: function () { return !!cur; },
    done: function () { return cur ? new Promise(function (r) { waiters.push(r); }) : Promise.resolve(); },
    /* Frame snapshot for the board painter: progress 0..1 from wall-clock time. */
    frame: function () {
      if (!cur) return null;
      const t = Math.max(0, Math.min(1, (now() - cur.start) / cur.dur));
      return { t: t, moves: cur.moves, fades: cur.fades, hide: cur.hide };
    },
    info: function () { return cur ? { dur: cur.dur, dist: cur.dist } : null; },
    plan: plan,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
