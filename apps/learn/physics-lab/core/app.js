/*
 * Physics Lab PS1c - canvas, loop, buttons and the bounce / friction sliders.
 * The page draws the same world core/engine.js steps: floor, walls, one ramp,
 * a ball and a box. Palette comes from the CSS variables in
 * ui/physics-lab.css so light and dark stay in one place.
 */
(function () {
  'use strict';

  var P = window.PLPhysics;
  var W = 10, H = 6;

  var stage = document.getElementById('pl-stage');
  var canvas = document.getElementById('pl-canvas');
  var ctx = canvas.getContext('2d');
  var playBtn = document.getElementById('pl-play');
  var resetBtn = document.getElementById('pl-reset');
  var bounce = document.getElementById('pl-bounce');
  var bounceOut = document.getElementById('pl-bounce-out');
  var friction = document.getElementById('pl-friction');
  var frictionOut = document.getElementById('pl-friction-out');

  var world = P.world(W, H);
  var restitution = parseFloat(bounce.value) || 0.5;
  var grip = parseFloat(friction.value) || 0.4;
  var ramp = null;

  var running = true;
  var last = 0;
  var dpr = 1, cw = 0, ch = 0;
  var pal = null;

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
      boxHi: v('--pl-box-hi', '#f2cf9a')
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
    // a small top edge so rotation is easy to see
    ctx.beginPath();
    ctx.moveTo(-bw / 2 + r, -bh / 2 + 2);
    ctx.lineTo(bw / 2 - r, -bh / 2 + 2);
    ctx.strokeStyle = pal.boxHi;
    ctx.lineWidth = Math.max(1, 1.2 * dpr);
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    var s = Math.min(cw / W, ch / H);
    var ox = (cw - W * s) / 2;
    var oy = (ch - H * s) / 2;
    var i, x, y;

    function px(v) { return ox + v * s; }
    function py(v) { return oy + (H - v) * s; }

    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, cw, ch);

    // one-metre grid
    ctx.strokeStyle = pal.grid;
    ctx.lineWidth = Math.max(1, dpr);
    ctx.beginPath();
    for (x = 0; x <= W; x += 1) { ctx.moveTo(px(x), py(0)); ctx.lineTo(px(x), py(H)); }
    for (y = 0; y <= H; y += 1) { ctx.moveTo(px(0), py(y)); ctx.lineTo(px(W), py(y)); }
    ctx.stroke();

    // floor and ramp (skip the vertical side walls)
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

    // ground hatching under the floor line
    ctx.strokeStyle = pal.hatch;
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    for (x = 0.25; x < W; x += 0.5) {
      ctx.moveTo(px(x), py(0));
      ctx.lineTo(px(x) - 0.16 * s, py(-0.16));
    }
    ctx.stroke();

    for (i = 0; i < world.bodies.length; i++) drawBody(world.bodies[i], px, py, s);
  }

  function frame(t) {
    requestAnimationFrame(frame);
    if (!last) last = t;
    var dt = (t - last) / 1000;
    last = t;
    if (running) world.step(dt);
    draw();
  }

  function setRunning(v) {
    running = v;
    playBtn.textContent = v ? 'Pause' : 'Play';
  }

  playBtn.addEventListener('click', function () { setRunning(!running); });
  resetBtn.addEventListener('click', reset);
  bounce.addEventListener('input', function () { setBounce(parseFloat(bounce.value)); });
  friction.addEventListener('input', function () { setFriction(parseFloat(friction.value)); });
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
  setRunning(true);
  requestAnimationFrame(frame);
})();
