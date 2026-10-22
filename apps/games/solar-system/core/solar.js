// Solar System Explorer R1b: Sun + 8 planets on compressed circular orbits, pan and zoom,
// tap a body to fly to it, follow it and show its info panel (data in core/data.js).
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
  var SUN_R = 16, EARTH_SECONDS = 20, FLY_MS = 800, fitZ = 1; // zoom is clamped to fitZ x0.5 .. x25
  var SUN = { name: 'Sun', orbit: 0, period: 1, r: SUN_R, color: '#ffd25a', phase: 0, x: 0, y: 0 };
  var bodies = PLANETS.map(function (p, i) {
    return { name: p[0], orbit: 70 * Math.log(1 + 2.5 * p[1]), period: p[2], r: p[3], color: p[4],
      phase: i * 2.399, x: 0, y: 0 }; // golden-angle start so planets don't line up
  });
  var all = [SUN].concat(bodies);
  var maxOrbit = bodies[bodies.length - 1].orbit + 20;

  var cv = document.getElementById('c'), ctx = cv.getContext('2d'), panel = document.getElementById('info');
  var W = 0, H = 0, dpr = 1, cam = { x: 0, y: 0, z: 1 }, fitted = false;
  var follow = null, fly = null; // followed body; fly = {t0, x, y, z, toZ} while the camera travels
  var stars = [];
  for (var s = 0, seed = 7; s < 260; s++) {
    seed = (seed * 16807) % 2147483647; var a = seed / 2147483647;
    seed = (seed * 16807) % 2147483647; var b = seed / 2147483647;
    seed = (seed * 16807) % 2147483647;
    stars.push([a, b, 0.3 + (seed / 2147483647) * 0.9]);
  }

  function clampZ(z) { return Math.max(fitZ * 0.5, Math.min(fitZ * 25, z)); }
  // Screen point the camera centre maps to: the area not covered by the info panel.
  function centre() {
    if (panel.hidden) return { x: W / 2, y: H / 2 };
    var r = panel.getBoundingClientRect();
    return r.top > H * 0.3 ? { x: W / 2, y: r.top / 2 } : { x: r.left / 2, y: H / 2 };
  }
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    fitZ = Math.min(W, H) / (2 * maxOrbit);
    cam.z = fitted ? clampZ(cam.z) : fitZ; fitted = true;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---- Select / follow / info panel ----
  function el(tag, text) { var e = document.createElement(tag); e.textContent = text; return e; }
  function select(b) {
    var d = window.SS_INFO[b.name], st = document.getElementById('i-stats'), fx = document.getElementById('i-facts');
    document.getElementById('i-name').textContent = b.name;
    document.getElementById('i-type').textContent = d.type;
    st.textContent = ''; fx.textContent = '';
    [['Diameter', d.d], ['From Sun', d.dist], ['Orbit', d.period], ['Day', d.day], ['Moons', d.moons]]
      .forEach(function (r) { st.appendChild(el('dt', r[0])); st.appendChild(el('dd', r[1])); });
    d.facts.forEach(function (f) { fx.appendChild(el('li', f)); });
    panel.hidden = false;
    follow = b;
    fly = { t0: performance.now(), x: cam.x, y: cam.y, z: cam.z, toZ: clampZ((b === SUN ? 70 : 34) / b.r) };
  }
  function release() { follow = null; fly = null; panel.hidden = true; }
  document.getElementById('close').addEventListener('click', release);
  document.getElementById('fit').addEventListener('click', function () { release(); cam = { x: 0, y: 0, z: fitZ }; });
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape') release(); });
  function tap(sx, sy) {
    var c = centre(), best = null, bestD = 1e9;
    all.forEach(function (b) {
      var d = Math.hypot((b.x - cam.x) * cam.z + c.x - sx, (b.y - cam.y) * cam.z + c.y - sy);
      if (d < Math.max(22, b.r * cam.z + 10) && d < bestD) { best = b; bestD = d; }
    });
    if (best) select(best); else release();
  }

  // ---- Pan and zoom (pointer events cover mouse, pen and touch) ----
  var ptrs = {}, pinch = null, press = null;
  function toWorld(sx, sy) { var c = centre(); return { x: (sx - c.x) / cam.z + cam.x, y: (sy - c.y) / cam.z + cam.y }; }
  function zoomAt(sx, sy, nz) {
    if (follow) { fly = null; cam.z = clampZ(nz); return; } // following: zoom about the followed body
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
    var n = Object.keys(ptrs).length;
    if (n === 1) press = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
    else if (press) press.moved = true; // a second finger means pinch, never a tap
    if (n === 2) pinch = pinchState();
  });
  cv.addEventListener('pointermove', function (e) {
    var p = ptrs[e.pointerId]; if (!p) return;
    var n = Object.keys(ptrs).length;
    if (n === 1 && press && !press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) {
      press.moved = true; if (follow) { follow = null; fly = null; } // dragging breaks follow, panel stays
    }
    if (n === 1 && !follow) { cam.x -= (e.clientX - p.x) / cam.z; cam.y -= (e.clientY - p.y) / cam.z; }
    p.x = e.clientX; p.y = e.clientY;
    if (n === 2 && pinch) {
      var now = pinchState();
      if (!follow) { cam.x -= (now.x - pinch.x) / cam.z; cam.y -= (now.y - pinch.y) / cam.z; }
      zoomAt(now.x, now.y, cam.z * now.d / pinch.d); pinch = now;
    }
  });
  function up(e) {
    if (!ptrs[e.pointerId]) return;
    delete ptrs[e.pointerId]; pinch = Object.keys(ptrs).length === 2 ? pinchState() : null;
    if (!Object.keys(ptrs).length) {
      cv.classList.remove('drag');
      if (e.type === 'pointerup' && press && !press.moved && performance.now() - press.t < 600) tap(e.clientX, e.clientY);
      press = null;
    }
  }
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', function (e) {
    e.preventDefault(); zoomAt(e.clientX, e.clientY, cam.z * Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  // ---- Drawing ----
  function draw(t) {
    var years = t / 1000 / EARTH_SECONDS;
    bodies.forEach(function (b) {
      var ang = b.phase + (years / b.period) * Math.PI * 2;
      b.x = Math.cos(ang) * b.orbit; b.y = Math.sin(ang) * b.orbit;
    });
    if (follow) {
      var k = 1;
      if (fly) { k = Math.min(1, (t - fly.t0) / FLY_MS); k = k * k * (3 - 2 * k); }
      cam.x = fly ? fly.x + (follow.x - fly.x) * k : follow.x;
      cam.y = fly ? fly.y + (follow.y - fly.y) * k : follow.y;
      if (fly) { cam.z = Math.exp(Math.log(fly.z) + (Math.log(fly.toZ) - Math.log(fly.z)) * k); if (k >= 1) fly = null; }
    }
    var c = centre();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#04060d'; ctx.fillRect(0, 0, W, H);
    for (var i = 0; i < stars.length; i++) {
      ctx.globalAlpha = stars[i][2] * 0.6; ctx.fillStyle = '#fff';
      ctx.fillRect(stars[i][0] * W, stars[i][1] * H, 1, 1);
    }
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(c.x, c.y); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y);
    // Orbits
    ctx.lineWidth = 1 / cam.z; ctx.strokeStyle = 'rgba(120,150,210,.22)';
    bodies.forEach(function (b) { ctx.beginPath(); ctx.arc(0, 0, b.orbit, 0, Math.PI * 2); ctx.stroke(); });
    // Sun with glow
    var g = ctx.createRadialGradient(0, 0, SUN_R * 0.3, 0, 0, SUN_R * 2);
    g.addColorStop(0, 'rgba(255,210,90,.55)'); g.addColorStop(1, 'rgba(255,150,40,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, SUN_R * 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd25a'; ctx.beginPath(); ctx.arc(0, 0, SUN_R, 0, Math.PI * 2); ctx.fill();
    // Planets
    bodies.forEach(function (b) {
      if (b.name === 'Saturn') {
        ctx.strokeStyle = 'rgba(230,210,160,.7)'; ctx.lineWidth = b.r * 0.35;
        ctx.beginPath(); ctx.ellipse(b.x, b.y, b.r * 1.9, b.r * 0.7, -0.4, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    });
    if (follow) { // selection ring
      ctx.strokeStyle = 'rgba(255,184,77,.8)'; ctx.lineWidth = 1.5 / cam.z;
      ctx.beginPath(); ctx.arc(follow.x, follow.y, follow.r + 5 / cam.z, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    // Labels in screen space; skip any that would overlap one already drawn (selected and Sun first)
    ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center';
    var placed = [], order = all.slice().sort(function (p, q) { return (q === follow) - (p === follow); });
    order.forEach(function (b) {
      var sx = (b.x - cam.x) * cam.z + c.x, sy = (b.y - cam.y) * cam.z + c.y;
      var ly = b === SUN ? sy + b.r * cam.z + 13 : sy - b.r * cam.z - 5, hw = ctx.measureText(b.name).width / 2 + 2;
      var box = [sx - hw, ly - 10, sx + hw, ly + 3];
      if (placed.some(function (q) { return box[0] < q[2] && box[2] > q[0] && box[1] < q[3] && box[3] > q[1]; })) return;
      placed.push(box); ctx.fillStyle = b === SUN ? '#ffd25a' : '#cfd8ea'; ctx.fillText(b.name, sx, ly);
    });
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
})();
