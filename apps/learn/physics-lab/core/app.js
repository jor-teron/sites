/*
 * Physics Lab PS1b - canvas, loop, buttons and the bounce slider.
 * The page draws the same world core/engine.js steps, so what you see is the
 * physics state (no separate animation maths). Palette comes from the CSS
 * variables in ui/physics-lab.css, so light and dark stay in one place.
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

  var world = P.world(W, H);
  var restitution = parseFloat(bounce.value) || 0.7;
  var running = true;
  var last = 0;
  var dpr = 1, cw = 0, ch = 0;
  var pal = null;

  function readPalette() {
    var cs = getComputedStyle(document.querySelector('.pl'));
    return {
      bg: cs.getPropertyValue('--pl-bg').trim() || '#0f1319',
      grid: cs.getPropertyValue('--pl-grid').trim() || 'rgba(255,255,255,.06)',
      floor: cs.getPropertyValue('--pl-floor').trim() || '#77839a',
      hatch: cs.getPropertyValue('--pl-hatch').trim() || 'rgba(255,255,255,.12)',
      ball: cs.getPropertyValue('--pl-ball').trim() || '#5fb8ad',
      ballHi: cs.getPropertyValue('--pl-ball-hi').trim() || '#a7e6dc',
      ballEdge: cs.getPropertyValue('--pl-ball-edge').trim() || 'rgba(0,0,0,.35)'
    };
  }

  function reset() {
    world.clear();
    world.addSegment(0, 0, W, 0, 0.9);
    world.addSegment(0, 0, 0, H, 0.5);
    world.addSegment(W, 0, W, H, 0.5);
    world.addBody(P.circle({ x: 5, y: 4.7, r: 0.34, mass: 1, restitution: restitution }));
    world.time = 0;
  }

  function setBounce(v) {
    restitution = v;
    bounceOut.textContent = v.toFixed(2);
    for (var i = 0; i < world.bodies.length; i++) world.bodies[i].restitution = v;
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

  function draw() {
    var s = Math.min(cw / W, ch / H);
    var ox = (cw - W * s) / 2;
    var oy = (ch - H * s) / 2;
    var x, y;

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

    // floor
    ctx.strokeStyle = pal.floor;
    ctx.lineWidth = 3 * dpr;
    ctx.beginPath();
    ctx.moveTo(px(0), py(0));
    ctx.lineTo(px(W), py(0));
    ctx.stroke();

    // ground hatching under the floor line
    ctx.strokeStyle = pal.hatch;
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    for (x = 0.25; x < W; x += 0.5) {
      ctx.moveTo(px(x), py(0));
      ctx.lineTo(px(x) - 0.16 * s, py(-0.16));
    }
    ctx.stroke();

    // the ball
    var b = world.bodies[0];
    if (!b) return;
    var bx = px(b.x), by = py(b.y), br = b.r * s;
    var g = ctx.createRadialGradient(bx - br * 0.35, by - br * 0.4, br * 0.12, bx, by, br);
    g.addColorStop(0, pal.ballHi);
    g.addColorStop(1, pal.ball);
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = Math.max(1, 1.5 * dpr);
    ctx.strokeStyle = pal.ballEdge;
    ctx.stroke();
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
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () { last = 0; });
  if (window.MutationObserver) {
    new MutationObserver(function () { pal = readPalette(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }

  reset();
  resize();
  setBounce(restitution);
  setRunning(true);
  requestAnimationFrame(frame);
})();
