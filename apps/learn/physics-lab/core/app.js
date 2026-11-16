/*
 * Physics Lab PS1d - PS1c plus hands-on input: drag a body to throw it, tap
 * empty space (or + Ball) to add a ball, double-tap a body to remove it, and
 * motion trails. The page draws the same world core/engine.js steps.
 */
(function () {
  'use strict';

  var P = window.PLPhysics;
  var W = 10, H = 6;
  var MAX_THROW = 12;

  var stage = document.getElementById('pl-stage');
  var canvas = document.getElementById('pl-canvas');
  var ctx = canvas.getContext('2d');
  var playBtn = document.getElementById('pl-play');
  var resetBtn = document.getElementById('pl-reset');
  var addBtn = document.getElementById('pl-add');
  var trailsBtn = document.getElementById('pl-trails');
  var bounce = document.getElementById('pl-bounce');
  var bounceOut = document.getElementById('pl-bounce-out');
  var friction = document.getElementById('pl-friction');
  var frictionOut = document.getElementById('pl-friction-out');
  var gravity = document.getElementById('pl-gravity');
  var timeEl = document.getElementById('pl-time');
  var bodyEl = document.getElementById('pl-body');
  var speedEl = document.getElementById('pl-speed');
  var heightEl = document.getElementById('pl-height');
  var keEl = document.getElementById('pl-ke');
  var peEl = document.getElementById('pl-pe');
  var totalEl = document.getElementById('pl-total');

  var world = P.world(W, H);
  var restitution = parseFloat(bounce.value) || 0.5;
  var grip = parseFloat(friction.value) || 0.4;
  var ramp = null;

  var running = true;
  var last = 0;
  var dpr = 1, cw = 0, ch = 0;
  var pal = null;
  var view = { ox: 0, oy: 0, s: 1 };
  var selected = null;
  var drag = null;
  var trailsOn = true;
  var trailTick = 0;
  var hudAt = 0;
  var lastTap = { body: null, t: 0 };

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function readPalette() {
    var cs = getComputedStyle(document.querySelector('.pl'));
    function v(name, fallback) { return cs.getPropertyValue(name).trim() || fallback; }
    return {
      bg: v('--pl-bg', '#0f1319'),
      grid: v('--pl-grid', 'rgba(255,255,255,.06)'),
      floor: v('--pl-floor', '#77839a'),
      hatch: v('--pl-hatch', 'rgba(255,255,255,.12)'),
      ball: v('--pl-ball', '#5fb8ad'),
      ballHi: v('--pl-ball-hi', '#a7e6dc'),
      ballEdge: v('--pl-ball-edge', 'rgba(0,0,0,.35)'),
      box: v('--pl-box', '#e0a458'),
      boxHi: v('--pl-box-hi', '#f2cf9a'),
      accent: v('--accent', '#8fa6c4')
    };
  }

  function reset() {
    world.clear();
    world.addSegment(0, 0, W, 0, 0.9);
    world.addSegment(0, 0, 0, H, 0.5);
    world.addSegment(W, 0, W, H, 0.5);
    ramp = world.addSegment(1.4, 0, 5.4, 2.5, 0.7);
    world.addBody(P.circle({
      x: 4.44, y: 2.26, r: 0.3, mass: 1,
      restitution: restitution, friction: grip, color: pal ? pal.ball : '#5fb8ad', label: 'ball'
    }));
    world.addBody(P.box({
      x: 7.2, y: 0.5, w: 0.7, h: 0.5, mass: 2, angle: 0.12, vx: -1.8,
      restitution: Math.min(restitution, 0.4), friction: grip, color: pal ? pal.box : '#e0a458', label: 'box'
    }));
    world.time = 0;
    selected = null;
    drag = null;
    updateHUD();
  }

  function addBallAt(x, y) {
    var b = P.circle({
      x: x, y: y, r: 0.28, mass: 1,
      restitution: restitution, friction: grip, color: pal ? pal.ball : '#5fb8ad', label: 'ball'
    });
    world.addBody(b);
    selected = b;
  }

  function addBall() {
    addBallAt(8.2 + (world.bodies.length % 3) * 0.35, 4.6);
  }

  function setBounce(v) {
    restitution = v;
    bounceOut.textContent = v.toFixed(2);
    for (var i = 0; i < world.bodies.length; i++) world.bodies[i].restitution = v;
  }

  function setFriction(v) {
    grip = v;
    frictionOut.textContent = v.toFixed(2);
    for (var i = 0; i < world.bodies.length; i++) world.bodies[i].friction = v;
  }

  function setTrails(v) {
    trailsOn = v;
    trailsBtn.setAttribute('aria-pressed', v ? 'true' : 'false');
  }

  function currentBody() {
    if (selected && world.bodies.indexOf(selected) >= 0) return selected;
    return world.bodies[0] || null;
  }

  function updateHUD() {
    timeEl.textContent = world.time.toFixed(2) + ' s';
    var b = currentBody();
    if (!b) {
      bodyEl.textContent = '\u2014';
      speedEl.textContent = '0.00 m/s';
      heightEl.textContent = '0.00 m';
      keEl.style.width = '0%';
      peEl.style.width = '0%';
      totalEl.textContent = '0.0 J';
      return;
    }
    var speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    var e = world.energy(b);
    var ke = Math.max(0, e.ke), pe = Math.max(0, e.pe), sum = ke + pe;
    var pct = sum > 0.001 ? (ke / sum) * 100 : 0;
    bodyEl.textContent = b.label || b.kind;
    speedEl.textContent = speed.toFixed(2) + ' m/s';
    heightEl.textContent = b.y.toFixed(2) + ' m';
    keEl.style.width = pct.toFixed(1) + '%';
    peEl.style.width = (100 - pct).toFixed(1) + '%';
    totalEl.textContent = e.total.toFixed(1) + ' J';
  }

  function resize() {
    var rect = stage.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = Math.max(1, Math.round(rect.width * dpr));
    ch = Math.max(1, Math.round(rect.height * dpr));
    canvas.width = cw;
    canvas.height = ch;
    pal = readPalette();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBody(b, px, py, s) {
    if (b.kind === 'circle') {
      var bx = px(b.x), by = py(b.y), br = b.r * s;
      var g = ctx.createRadialGradient(bx - br * 0.35, by - br * 0.4, br * 0.12, bx, by, br);
      g.addColorStop(0, pal.ballHi);
      g.addColorStop(1, b.color || pal.ball);
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = Math.max(1, 1.5 * dpr);
      ctx.strokeStyle = pal.ballEdge;
      ctx.stroke();
      return;
    }
    ctx.save();
    ctx.translate(px(b.x), py(b.y));
    ctx.rotate(-b.angle);
    var bw = b.w * s, bh = b.h * s, r = Math.min(bw, bh) * 0.16;
    roundRect(-bw / 2, -bh / 2, bw, bh, r);
    ctx.fillStyle = b.color || pal.box;
    ctx.fill();
    ctx.lineWidth = Math.max(1, 1.5 * dpr);
    ctx.strokeStyle = pal.ballEdge;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-bw / 2 + r, -bh / 2 + 2);
    ctx.lineTo(bw / 2 - r, -bh / 2 + 2);
    ctx.strokeStyle = pal.boxHi;
    ctx.lineWidth = Math.max(1, 1.2 * dpr);
    ctx.stroke();
    ctx.restore();
  }

  function drawTrails(px, py) {
    for (var i = 0; i < world.bodies.length; i++) {
      var b = world.bodies[i], t = b.trail;
      if (!t || t.length < 2) continue;
      ctx.beginPath();
      for (var j = 0; j < t.length; j++) {
        if (j === 0) ctx.moveTo(px(t[j].x), py(t[j].y));
        else ctx.lineTo(px(t[j].x), py(t[j].y));
      }
      ctx.strokeStyle = b.color || pal.ball;
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = 2 * dpr;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawSelection(b, px, py, s) {
    if (b.kind === 'circle') {
      ctx.beginPath();
      ctx.arc(px(b.x), py(b.y), (b.r + 0.07) * s, 0, Math.PI * 2);
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 2 * dpr;
      ctx.setLineDash([5 * dpr, 4 * dpr]);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    var corners = P.boxCorners(b);
    ctx.beginPath();
    for (var i = 0; i < 4; i++) {
      if (i === 0) ctx.moveTo(px(corners[i].x), py(corners[i].y));
      else ctx.lineTo(px(corners[i].x), py(corners[i].y));
    }
    ctx.closePath();
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 2 * dpr;
    ctx.setLineDash([5 * dpr, 4 * dpr]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function draw() {
    var s = Math.min(cw / W, ch / H);
    var ox = (cw - W * s) / 2;
    var oy = (ch - H * s) / 2;
    var i, x, y;
    view = { ox: ox, oy: oy, s: s };

    function px(v) { return ox + v * s; }
    function py(v) { return oy + (H - v) * s; }

    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, cw, ch);

    ctx.strokeStyle = pal.grid;
    ctx.lineWidth = Math.max(1, dpr);
    ctx.beginPath();
    for (x = 0; x <= W; x += 1) { ctx.moveTo(px(x), py(0)); ctx.lineTo(px(x), py(H)); }
    for (y = 0; y <= H; y += 1) { ctx.moveTo(px(0), py(y)); ctx.lineTo(px(W), py(y)); }
    ctx.stroke();

    for (i = 0; i < world.segments.length; i++) {
      var seg = world.segments[i];
      if (Math.abs(seg.ax - seg.bx) < 0.001) continue;
      ctx.strokeStyle = pal.floor;
      ctx.lineWidth = (seg === ramp ? 5 : 3) * dpr;
      ctx.beginPath();
      ctx.moveTo(px(seg.ax), py(seg.ay));
      ctx.lineTo(px(seg.bx), py(seg.by));
      ctx.stroke();
    }

    ctx.strokeStyle = pal.hatch;
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    for (x = 0.25; x < W; x += 0.5) {
      ctx.moveTo(px(x), py(0));
      ctx.lineTo(px(x) - 0.16 * s, py(-0.16));
    }
    ctx.stroke();

    if (trailsOn) drawTrails(px, py);
    for (i = 0; i < world.bodies.length; i++) drawBody(world.bodies[i], px, py, s);
    if (selected && world.bodies.indexOf(selected) >= 0) drawSelection(selected, px, py, s);
  }

  function recordTrails() {
    if (!trailsOn) return;
    trailTick++;
    if (trailTick % 3) return;
    for (var i = 0; i < world.bodies.length; i++) {
      var b = world.bodies[i];
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 150) b.trail.shift();
    }
  }

  // ---- pointer: select, drag and throw -----------------------------------
  function toWorld(e) {
    var r = canvas.getBoundingClientRect();
    var dx = (e.clientX - r.left) * dpr;
    var dy = (e.clientY - r.top) * dpr;
    return { x: (dx - view.ox) / view.s, y: H - (dy - view.oy) / view.s };
  }

  function bodyAt(x, y) {
    for (var i = world.bodies.length - 1; i >= 0; i--) {
      var b = world.bodies[i];
      if (b.kind === 'circle') {
        var dx = x - b.x, dy = y - b.y;
        if (dx * dx + dy * dy <= (b.r + 0.1) * (b.r + 0.1)) return b;
      } else {
        var c = Math.cos(b.angle), s = Math.sin(b.angle);
        var lx = (x - b.x) * c + (y - b.y) * s;
        var ly = -(x - b.x) * s + (y - b.y) * c;
        if (Math.abs(lx) <= b.w / 2 + 0.08 && Math.abs(ly) <= b.h / 2 + 0.08) return b;
      }
    }
    return null;
  }

  function release(e) {
    if (!drag) return;
    var b = drag.b, now = performance.now();
    b.fixed = false;
    if (now - drag.lt < 130) {
      b.vx = clamp(drag.vx, -MAX_THROW, MAX_THROW);
      b.vy = clamp(drag.vy, -MAX_THROW, MAX_THROW);
    }
    drag = null;
    if (canvas.hasPointerCapture && e && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    var p = toWorld(e);
    var b = bodyAt(p.x, p.y);
    if (!b) {
      if (p.x > 0.2 && p.x < W - 0.2 && p.y > 0.3 && p.y < H - 0.2) addBallAt(p.x, p.y);
      else selected = null;
      return;
    }
    var now = performance.now();
    if (lastTap.body === b && now - lastTap.t < 350) {
      world.remove(b);
      if (selected === b) selected = null;
      lastTap = { body: null, t: 0 };
      return;
    }
    lastTap = { body: b, t: now };
    selected = b;
    drag = { b: b, dx: b.x - p.x, dy: b.y - p.y, lx: p.x, ly: p.y, lt: now, vx: 0, vy: 0 };
    b.fixed = true;
    b.vx = 0; b.vy = 0; b.av = 0;
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    if (e.preventDefault) e.preventDefault();
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var p = toWorld(e), b = drag.b;
    b.x = p.x + drag.dx;
    b.y = p.y + drag.dy;
    var now = performance.now(), dt = (now - drag.lt) / 1000;
    if (dt > 0.012) {
      var vx = (p.x - drag.lx) / dt, vy = (p.y - drag.ly) / dt;
      if (Math.abs(vx) < 30 && Math.abs(vy) < 30) { drag.vx = vx; drag.vy = vy; }
      drag.lx = p.x; drag.ly = p.y; drag.lt = now;
    }
  });

  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  function frame(t) {
    requestAnimationFrame(frame);
    if (!last) last = t;
    var dt = (t - last) / 1000;
    last = t;
    if (running) { world.step(dt); recordTrails(); }
    draw();
    if (t - hudAt > 90) { updateHUD(); hudAt = t; }
  }

  function setRunning(v) {
    running = v;
    playBtn.textContent = v ? 'Pause' : 'Play';
  }

  playBtn.addEventListener('click', function () { setRunning(!running); });
  resetBtn.addEventListener('click', reset);
  addBtn.addEventListener('click', addBall);
  trailsBtn.addEventListener('click', function () { setTrails(!trailsOn); });
  bounce.addEventListener('input', function () { setBounce(parseFloat(bounce.value)); });
  friction.addEventListener('input', function () { setFriction(parseFloat(friction.value)); });
  gravity.addEventListener('change', function () { world.gravity = parseFloat(gravity.value) || 0; updateHUD(); });
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () { last = 0; });
  if (window.MutationObserver) {
    new MutationObserver(function () { pal = readPalette(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }

  pal = readPalette();
  reset();
  resize();
  setBounce(restitution);
  setFriction(grip);
  setTrails(true);
  updateHUD();
  setRunning(true);
  requestAnimationFrame(frame);
})();
