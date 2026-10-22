// Solar System Explorer R1a: Sun + 8 planets on compressed circular orbits, pan and zoom.
// Distances: r = 70 * ln(1 + 2.5 * AU) world units (log-compressed so Neptune fits).
// Sizes: exaggerated but in true relative order. Speeds: real period ratios, Earth = 20 s per orbit.
(function () {
  'use strict';
  var PLANETS = [
    // name, AU, period (Earth years), radius (world units), colour
    ['Mercury', 0.39, 0.241, 2.2, '#b5aca3'],
    ['Venus', 0.72, 0.615, 3.6, '#e8c98a'],
    ['Earth', 1.00, 1.000, 3.8, '#4f8fe8'],
    ['Mars', 1.52, 1.881, 2.8, '#d0603a'],
    ['Jupiter', 5.20, 11.86, 11, '#d9b38c'],
    ['Saturn', 9.58, 29.46, 9.5, '#e6d2a0'],
    ['Uranus', 19.2, 84.01, 6.5, '#9fd8e0'],
    ['Neptune', 30.1, 164.8, 6.2, '#4f6fe0']
  ];
  var SUN_R = 16, EARTH_SECONDS = 20, fitZ = 1; // zoom is clamped to fitZ x0.5 .. x25
  var bodies = PLANETS.map(function (p, i) {
    return { name: p[0], orbit: 70 * Math.log(1 + 2.5 * p[1]), period: p[2], r: p[3], color: p[4],
      phase: i * 2.399 }; // golden-angle start so planets don't line up
  });
  var maxOrbit = bodies[bodies.length - 1].orbit + 20;

  var cv = document.getElementById('c'), ctx = cv.getContext('2d');
  var W = 0, H = 0, dpr = 1, cam = { x: 0, y: 0, z: 1 }, fitted = false;
  var stars = [];
  for (var s = 0, seed = 7; s < 260; s++) {
    seed = (seed * 16807) % 2147483647; var a = seed / 2147483647;
    seed = (seed * 16807) % 2147483647; var b = seed / 2147483647;
    seed = (seed * 16807) % 2147483647;
    stars.push([a, b, 0.3 + (seed / 2147483647) * 0.9]);
  }

  function clampZ(z) { return Math.max(fitZ * 0.5, Math.min(fitZ * 25, z)); }
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    fitZ = Math.min(W, H) / (2 * maxOrbit);
    cam.z = fitted ? clampZ(cam.z) : fitZ; fitted = true;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---- Pan and zoom (pointer events cover mouse, pen and touch) ----
  var ptrs = {}, pinch = null;
  function toWorld(sx, sy) { return { x: (sx - W / 2) / cam.z + cam.x, y: (sy - H / 2) / cam.z + cam.y }; }
  function zoomAt(sx, sy, nz) {
    var before = toWorld(sx, sy); cam.z = clampZ(nz);
    var after = toWorld(sx, sy); cam.x += before.x - after.x; cam.y += before.y - after.y;
  }
  function pinchState() {
    var k = Object.keys(ptrs), a = ptrs[k[0]], b = ptrs[k[1]];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  cv.addEventListener('pointerdown', function (e) {
    cv.setPointerCapture(e.pointerId); ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    cv.classList.add('drag');
    if (Object.keys(ptrs).length === 2) pinch = pinchState();
  });
  cv.addEventListener('pointermove', function (e) {
    var p = ptrs[e.pointerId]; if (!p) return;
    var n = Object.keys(ptrs).length;
    if (n === 1) { cam.x -= (e.clientX - p.x) / cam.z; cam.y -= (e.clientY - p.y) / cam.z; }
    p.x = e.clientX; p.y = e.clientY;
    if (n === 2 && pinch) {
      var now = pinchState();
      cam.x -= (now.x - pinch.x) / cam.z; cam.y -= (now.y - pinch.y) / cam.z;
      zoomAt(now.x, now.y, cam.z * now.d / pinch.d); pinch = now;
    }
  });
  function up(e) {
    delete ptrs[e.pointerId]; pinch = Object.keys(ptrs).length === 2 ? pinchState() : null;
    if (!Object.keys(ptrs).length) cv.classList.remove('drag');
  }
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', function (e) {
    e.preventDefault(); zoomAt(e.clientX, e.clientY, cam.z * Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  // ---- Drawing ----
  function draw(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#04060d'; ctx.fillRect(0, 0, W, H);
    for (var i = 0; i < stars.length; i++) {
      ctx.globalAlpha = stars[i][2] * 0.6; ctx.fillStyle = '#fff';
      ctx.fillRect(stars[i][0] * W, stars[i][1] * H, 1, 1);
    }
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y);
    // Orbits
    ctx.lineWidth = 1 / cam.z; ctx.strokeStyle = 'rgba(120,150,210,.22)';
    bodies.forEach(function (b) { ctx.beginPath(); ctx.arc(0, 0, b.orbit, 0, Math.PI * 2); ctx.stroke(); });
    // Sun with glow
    var g = ctx.createRadialGradient(0, 0, SUN_R * 0.3, 0, 0, SUN_R * 2);
    g.addColorStop(0, 'rgba(255,210,90,.55)'); g.addColorStop(1, 'rgba(255,150,40,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, SUN_R * 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd25a'; ctx.beginPath(); ctx.arc(0, 0, SUN_R, 0, Math.PI * 2); ctx.fill();
    // Planets
    var years = t / 1000 / EARTH_SECONDS, pos = [];
    bodies.forEach(function (b) {
      var ang = b.phase + (years / b.period) * Math.PI * 2;
      var x = Math.cos(ang) * b.orbit, y = Math.sin(ang) * b.orbit;
      pos.push([x, y, b]);
      if (b.name === 'Saturn') {
        ctx.strokeStyle = 'rgba(230,210,160,.7)'; ctx.lineWidth = b.r * 0.35;
        ctx.beginPath(); ctx.ellipse(x, y, b.r * 1.9, b.r * 0.7, -0.4, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(x, y, b.r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();
    // Labels in screen space so text stays readable at any zoom
    ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#cfd8ea';
    pos.forEach(function (p) {
      var sx = (p[0] - cam.x) * cam.z + W / 2, sy = (p[1] - cam.y) * cam.z + H / 2;
      ctx.fillText(p[2].name, sx, sy - p[2].r * cam.z - 5);
    });
    ctx.fillStyle = '#ffd25a';
    ctx.fillText('Sun', (0 - cam.x) * cam.z + W / 2, (0 - cam.y) * cam.z + H / 2 + SUN_R * cam.z + 13);
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
})();
