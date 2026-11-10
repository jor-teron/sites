/*
 * Battleship — motion and effects (SHIP-2b). Cannon arcs, splash, explosion, fire and smoke,
 * sinking, a radar sweep and a last-shot pulse. The animation loop runs only while something
 * is playing, and is skipped entirely when Low graphics is on or the device asks for reduced motion.
 */
const BSFx = (() => {
  const views = [];
  const items = []; // { kind, view, c, t, dur, done, meta }
  let raf = 0, now = 0, last = 0, listen = false;

  function off() {
    return !!(BS_SETTINGS.get('lowGraphics')) ||
      !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function fpsMs() {
    try { return (window.GameSettings && GameSettings.frameMs()) || 1000 / 30; } catch (_) { return 1000 / 30; }
  }
  function busy() { return items.some((fx) => fx.t < fx.dur && fx.kind !== 'fire' && fx.kind !== 'radar' && fx.kind !== 'pulse'); }
  function time() { return now; }

  function hook(view, id) { view.fxId = id; views.push(view); return view; }

  function add(kind, view, c, dur, meta) {
    const fx = { kind, view, c, t: off() ? dur : 0, dur, meta: meta || {} };
    items.push(fx);
    if (!off()) kick();
    return fx;
  }
  function clearView(view) {
    for (let i = items.length - 1; i >= 0; i--) if (items[i].view === view) items.splice(i, 1);
  }
  /** Drop every effect without running onDone (used when a new game starts mid-shot). */
  function drop() {
    for (const fx of items) if (fx.meta) fx.meta.onDone = null;
    items.length = 0; stop();
  }

  function kick() {
    if (raf || off()) return;
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  function loop(ts) {
    const cap = fpsMs();
    if (ts - last < cap - 2) { raf = requestAnimationFrame(loop); return; }
    const dt = Math.min(0.05, (ts - last) / 1000);
    last = ts; now = ts / 1000;
    for (const fx of items) fx.t = Math.min(fx.dur, fx.t + dt);
    const finished = items.filter((fx) => fx.t >= fx.dur && fx.meta && fx.meta.onDone);
    for (let i = items.length - 1; i >= 0; i--) {
      const fx = items[i];
      if (fx.t >= fx.dur && fx.kind !== 'fire' && fx.kind !== 'radar' && fx.kind !== 'pulse') items.splice(i, 1);
    }
    views.forEach((v) => v.draw());
    finished.forEach((fx) => { const fn = fx.meta.onDone; fx.meta.onDone = null; if (fn) fn(); });
    if (needLoop()) raf = requestAnimationFrame(loop);
    else raf = 0;
  }
  function needLoop() {
    if (off()) return false;
    return items.some((fx) => fx.kind === 'fire' || fx.kind === 'radar' || fx.kind === 'pulse' || fx.t < fx.dur);
  }

  /** Called by the renderer after the board is drawn. */
  function paint(g, view, ctx) {
    const mine = items.filter((fx) => fx.view === view);
    for (const fx of mine) {
      if (fx.kind === 'radar') radar(g, fx, ctx);
      else if (fx.kind === 'arc') arc(g, fx, ctx);
      else if (fx.kind === 'splash') splash(g, fx, ctx);
      else if (fx.kind === 'boom') boom(g, fx, ctx);
      else if (fx.kind === 'sink') sink(g, fx, ctx);
      else if (fx.kind === 'pulse') pulse(g, fx, ctx);
      else if (fx.kind === 'fire') fire(g, fx, ctx);
    }
  }

  function cellXY(ctx, c) {
    return { x: ctx.cx(c % BSRules.N) + ctx.cell / 2, y: ctx.cy(Math.floor(c / BSRules.N)) + ctx.cell / 2 };
  }
  function k(fx) { return fx.dur ? Math.max(0, Math.min(1, fx.t / fx.dur)) : 1; }

  function arc(g, fx, ctx) {
    const p = k(fx), to = cellXY(ctx, fx.c), from = fx.meta.from || { x: ctx.px / 2, y: ctx.px + ctx.cell };
    const lift = (fx.meta.lift || ctx.cell * 3.2);
    const x = from.x + (to.x - from.x) * p;
    const y = from.y + (to.y - from.y) * p - Math.sin(p * Math.PI) * lift;
    // trail
    g.save(); g.globalAlpha = 0.45;
    for (let i = 4; i >= 1; i--) {
      const q = Math.max(0, p - i * 0.04);
      const tx = from.x + (to.x - from.x) * q;
      const ty = from.y + (to.y - from.y) * q - Math.sin(q * Math.PI) * lift;
      g.fillStyle = '#fde68a'; g.beginPath(); g.arc(tx, ty, Math.max(1.2, ctx.cell * 0.06 * (1 - i / 6)), 0, 7); g.fill();
    }
    g.restore();
    const ang = Math.atan2(to.y - from.y - Math.cos(p * Math.PI) * lift * Math.PI, to.x - from.x);
    g.save(); g.translate(x, y); g.rotate(ang);
    g.fillStyle = '#e5e7eb'; g.strokeStyle = '#111827'; g.lineWidth = 1;
    g.beginPath(); g.ellipse(0, 0, ctx.cell * 0.16, ctx.cell * 0.07, 0, 0, 7); g.fill(); g.stroke();
    g.restore();
  }

  function splash(g, fx, ctx) {
    const p = k(fx), c = cellXY(ctx, fx.c), r = ctx.cell * (0.2 + 0.7 * p);
    g.save();
    g.globalAlpha = 1 - p;
    g.strokeStyle = 'rgba(226,245,255,.95)'; g.lineWidth = Math.max(1.2, ctx.cell * 0.06 * (1 - p));
    for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(c.x, c.y, r * (0.4 + i * 0.3), 0, 7); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,.85)';
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05 + 0.2, d = ctx.cell * (0.15 + 0.55 * p);
      g.beginPath(); g.arc(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d - p * ctx.cell * 0.15, ctx.cell * 0.05 * (1 - p), 0, 7); g.fill();
    }
    g.restore();
  }

  function boom(g, fx, ctx) {
    const p = k(fx), c = cellXY(ctx, fx.c);
    g.save();
    // flash
    g.globalAlpha = Math.max(0, 0.7 - p * 1.2);
    g.fillStyle = '#fff7ed'; g.beginPath(); g.arc(c.x, c.y, ctx.cell * 0.55, 0, 7); g.fill();
    // fireball
    g.globalAlpha = Math.max(0, 1 - p);
    const grd = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, ctx.cell * (0.2 + 0.6 * p));
    grd.addColorStop(0, '#fef08a'); grd.addColorStop(0.45, '#f97316'); grd.addColorStop(1, 'rgba(127,29,29,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(c.x, c.y, ctx.cell * (0.2 + 0.6 * p), 0, 7); g.fill();
    // sparks
    g.fillStyle = '#fdba74';
    for (let i = 0; i < 8; i++) {
      const a = i * 0.8 + 0.3, d = ctx.cell * (0.2 + 0.7 * p);
      g.beginPath(); g.arc(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, ctx.cell * 0.05 * (1 - p), 0, 7); g.fill();
    }
    g.restore();
  }

  function pulse(g, fx, ctx) {
    if (fx.c < 0) return;
    const c = cellXY(ctx, fx.c), w = 0.5 + 0.5 * Math.sin(now * 5);
    const pad = ctx.cell * (0.08 + 0.1 * w);
    g.save();
    g.strokeStyle = '#facc15'; g.globalAlpha = 0.45 + 0.55 * w;
    g.lineWidth = Math.max(2, ctx.cell * (0.07 + 0.04 * w));
    g.strokeRect(c.x - ctx.cell / 2 + 1.5 - pad * 0.2, c.y - ctx.cell / 2 + 1.5 - pad * 0.2, ctx.cell - 3 + pad * 0.4, ctx.cell - 3 + pad * 0.4);
    g.restore();
  }

  function radar(g, fx, ctx) {
    const ox = ctx.cx(0), oy = ctx.cy(0), s = BSRules.N * ctx.cell;
    const cx0 = ox + s / 2, cy0 = oy + s / 2, ang = (now * 1.15) % (Math.PI * 2);
    g.save();
    g.beginPath(); g.rect(ox, oy, s, s); g.clip();
    g.translate(cx0, cy0);
    const span = 0.7;
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, s * 0.7);
    grd.addColorStop(0, 'rgba(74,222,128,.18)'); grd.addColorStop(1, 'rgba(74,222,128,0)');
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, s * 0.72, ang - span, ang); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(74,222,128,.7)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(ang) * s * 0.72, Math.sin(ang) * s * 0.72); g.stroke();
    g.restore();
  }

  function fire(g, fx, ctx) {
    const cells = fx.meta.cells || [];
    for (const c of cells) {
      const p = cellXY(ctx, c);
      for (let i = 0; i < 3; i++) {
        const flicker = 0.65 + 0.35 * Math.sin(now * (7 + i * 1.7) + c * 0.4 + i);
        const h = ctx.cell * (0.22 + 0.28 * flicker) * (1 - i * 0.15);
        const w = ctx.cell * (0.1 + 0.06 * flicker);
        g.save();
        g.translate(p.x + (i - 1) * ctx.cell * 0.12, p.y + ctx.cell * 0.12);
        g.fillStyle = i === 0 ? 'rgba(251,191,36,.9)' : (i === 1 ? 'rgba(249,115,22,.85)' : 'rgba(185,28,28,.7)');
        g.beginPath(); g.moveTo(-w, 0); g.quadraticCurveTo(0, -h, w, 0); g.quadraticCurveTo(0, w * 0.4, -w, 0); g.fill();
        g.restore();
      }
      // smoke
      const sy = p.y - ctx.cell * (0.3 + (now * 0.25 + c * 0.05) % 0.5);
      g.save(); g.globalAlpha = 0.28; g.fillStyle = '#94a3b8';
      g.beginPath(); g.ellipse(p.x + Math.sin(now * 1.3 + c) * 3, sy, ctx.cell * 0.14, ctx.cell * 0.1, 0, 0, 7); g.fill();
      g.restore();
    }
  }

  function sink(g, fx, ctx) {
    const sh = fx.meta.ship; if (!sh) return;
    const p = k(fx);
    g.save();
    g.globalAlpha = 1 - p * 0.35;
    const dip = ctx.cell * 0.45 * p, tilt = (fx.meta.tilt || 0.18) * p;
    const x = ctx.cx(sh.x), y = ctx.cy(sh.y);
    g.translate(x + (sh.o === 'h' ? sh.size * ctx.cell : ctx.cell) / 2, y + (sh.o === 'v' ? sh.size * ctx.cell : ctx.cell) / 2 + dip);
    g.rotate(tilt);
    g.translate(-((sh.o === 'h' ? sh.size * ctx.cell : ctx.cell) / 2), -((sh.o === 'v' ? sh.size * ctx.cell : ctx.cell) / 2));
    BSShips.draw(g, Object.assign({}, sh, { x: 0, y: 0 }), {
      cell: ctx.cell, x: 0, y: 0, dark: fx.meta.dark, sunk: true, loose: true, alpha: 1,
    });
    g.restore();
    // bubbles
    const mid = cellXY(ctx, fx.c);
    g.save(); g.fillStyle = 'rgba(226,245,255,.8)';
    for (let i = 0; i < 6; i++) {
      const u = (p + i * 0.12) % 1;
      g.globalAlpha = 0.8 * (1 - u);
      g.beginPath(); g.arc(mid.x + Math.sin(i * 1.7) * ctx.cell * 0.4, mid.y - u * ctx.cell * 1.2, ctx.cell * 0.06 * (1 - u * 0.4), 0, 7); g.fill();
    }
    g.restore();
  }

  /** Play a shot: arc, then opts.onImpact(), then splash or boom, then optional sink. */
  function playShot(opts) {
    return new Promise((resolve) => {
      const view = opts.view, c = opts.c, hit = !!opts.hit, sunk = !!opts.sunk;
      const finish = () => resolve();
      const impact = () => { if (opts.onImpact) opts.onImpact(); };
      if (off()) {
        impact();
        if (hit) BSSound.hit(); else BSSound.miss();
        if (sunk) BSSound.sunk();
        finish(); return;
      }
      BSSound.cannon();
      add('arc', view, c, 0.42, {
        from: opts.from, lift: opts.lift,
        onDone: () => {
          impact();
          if (hit) { BSSound.hit(); add('boom', view, c, 0.5, { onDone: afterImpact }); }
          else { BSSound.miss(); add('splash', view, c, 0.48, { onDone: afterImpact }); }
        }
      });
      function afterImpact() {
        if (sunk && opts.ship) {
          BSSound.sunk();
          add('sink', view, c, 0.7, { ship: opts.ship, dark: opts.dark, tilt: opts.ship.o === 'h' ? 0.2 : -0.16, onDone: finish });
        } else finish();
      }
    });
  }

  function setAmbient(view, { radarOn, fireCells, last }) {
    function find(kind) { return items.find((fx) => fx.view === view && fx.kind === kind); }
    function drop(kind) {
      for (let i = items.length - 1; i >= 0; i--) if (items[i].view === view && items[i].kind === kind) items.splice(i, 1);
    }
    if (off()) { drop('radar'); drop('fire'); drop('pulse'); return; }
    if (radarOn) { if (!find('radar')) add('radar', view, 0, 1); }
    else drop('radar');
    if (fireCells && fireCells.length) {
      const f = find('fire');
      if (f) f.meta.cells = fireCells;
      else add('fire', view, fireCells[0], 1, { cells: fireCells });
    } else drop('fire');
    if (last >= 0) {
      const f = find('pulse');
      if (f) f.c = last;
      else add('pulse', view, last, 1);
    } else drop('pulse');
    if (needLoop()) kick();
  }

  function bindSettings() {
    if (listen) return;
    listen = true;
    BS_SETTINGS.onChange((ch) => {
      if ('lowGraphics' in ch || 'theme' in ch) {
        if (off()) stop();
        views.forEach((v) => v.draw());
        if (!off() && needLoop()) kick();
      }
    });
    if (window.matchMedia) {
      try { matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => { if (off()) stop(); else if (needLoop()) kick(); views.forEach((v) => v.draw()); }); } catch (_) {}
    }
  }

  return { off, busy, time, hook, paint, playShot, setAmbient, kick, stop, add, clearView, drop, bindSettings, needLoop };
})();
if (typeof window !== 'undefined') window.BSFx = BSFx;
