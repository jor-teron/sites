// Solar System Explorer R2a: bodies are drawn by core/art.js (procedural textures, terminator, rim glow, rings).
// R2e: the Oort cloud, a faint seeded haze 2,000-100,000 AU out, seen when zoomed far out, with a log distance scale.
// R2c: asteroid and Kuiper belts as seeded particle fields (tap a belt or pick it from the list), plus Ceres.
// R2b: Pluto on an eccentric orbit, and the main moons (drawn and tappable only when zoomed in enough).
// R1c: Sun + 8 planets on compressed circular orbits, pan and zoom,
// tap a body (or pick it from the list) to fly to it, follow it and show its info panel (data in core/data.js).
// R1c adds pause and speed steps; orbit time is accumulated so speed changes never make planets jump.
// Distances: r = 70 * ln(1 + 2.5 * AU) world units (log-compressed so Neptune fits).
// Sizes: exaggerated but in true relative order. Speeds: real period ratios, Earth = 20 s per orbit.
(function () {
  'use strict';
  var PLANETS = [
    // name, AU, period (Earth years), radius (world units), colour (small-size disc), texture spin (sim s per turn)
    ['Mercury', 0.39, 0.241, 2.2, '#b5aca3', 400],
    ['Venus', 0.72, 0.615, 3.6, '#e8c98a', -500],
    ['Earth', 1.00, 1.000, 3.8, '#4f8fe8', 60],
    ['Mars', 1.52, 1.881, 2.8, '#d0603a', 62],
    ['Jupiter', 5.20, 11.86, 11, '#d9b38c', 40],
    ['Saturn', 9.58, 29.46, 9.5, '#e6d2a0', 44],
    ['Uranus', 19.2, 84.01, 6.5, '#9fd8e0', -70],
    ['Neptune', 30.1, 164.8, 6.2, '#4f6fe0', 66]
  ];
  var SUN_R = 16, EARTH_SECONDS = 20, FLY_MS = 800, fitZ = 1; // zoom is clamped to fitZ x0.3 .. x60
  var SUN = { name: 'Sun', orbit: 0, period: 1, r: SUN_R, color: '#ffd25a', phase: 0, x: 0, y: 0 };
  var bodies = PLANETS.map(function (p, i) {
    return { name: p[0], orbit: 70 * Math.log(1 + 2.5 * p[1]), period: p[2], r: p[3], color: p[4], spin: p[5],
      phase: i * 2.399, x: 0, y: 0 }; // golden-angle start so planets don't line up
  });
  function au(a) { return 70 * Math.log(1 + 2.5 * a); }
  // Pluto: real eccentricity 0.25, so it dips just inside Neptune's orbit; drawn dashed because its orbit is tilted 17°.
  var PLUTO = { name: 'Pluto', a: 39.48, e: 0.249, w: 3.9, period: 247.9, r: 1.6, color: '#d8c3a5', spin: -90, phase: 4.1, x: 0, y: 0 };
  bodies.push(PLUTO);
  bodies.push({ name: 'Ceres', orbit: au(2.77), period: 4.6, r: 1.0, color: '#9a948c', spin: 50, phase: 0.8, x: 0, y: 0 });
  // Belts: particles keep their own distance (AU) so inner ones lap outer ones (Kepler: period = a^1.5 years).
  var BELTS = [['Asteroid belt', 2.1, 3.3, 900, '196,178,156', 0], ['Kuiper belt', 30.5, 50, 1400, '150,178,220', 0.6]].map(function (d, bi) {
    var n = d[3], p = new Float32Array(n * 3), sd = 99 + bi;
    function rnd() { sd = (sd * 16807) % 2147483647; return sd / 2147483647; }
    for (var i = 0; i < n; i++) { // Kuiper: most objects sit in the classical belt at 42-48 AU
      var a = rnd() < d[5] ? 42 + rnd() * 6 : d[1] + Math.pow(rnd(), 1.3) * (d[2] - d[1]);
      p[i * 3] = a; p[i * 3 + 1] = rnd() * Math.PI * 2; p[i * 3 + 2] = 0.15 + rnd() * 0.45;
    }
    return { name: d[0], region: [au(d[1]), au(d[2])], parts: p, rgb: d[4], x: 0, y: 0, r: au(d[2]) };
  });
  // Oort cloud: a spherical shell seen from above, so each point is projected (R * sin of a random tilt).
  // Too slow to move visibly (orbits take millions of years), so positions are fixed. Inner Hills cloud is denser.
  var OORT = { name: 'Oort cloud', region: [au(2000), au(100000)], rgb: '170,190,235', x: 0, y: 0, r: au(100000), parts: new Float32Array(3200 * 3) };
  (function () {
    var p = OORT.parts, sd = 4242;
    function rnd() { sd = (sd * 16807) % 2147483647; return sd / 2147483647; }
    for (var i = 0; i < p.length / 3; i++) {
      var a = rnd() < 0.6 ? 2000 * Math.pow(10, rnd()) : 20000 * Math.pow(5, rnd()), u = rnd() * 2 - 1, th = rnd() * Math.PI * 2;
      var R0 = au(a) * Math.sqrt(1 - u * u);
      p[i * 3] = Math.cos(th) * R0; p[i * 3 + 1] = Math.sin(th) * R0; p[i * 3 + 2] = 0.6 + rnd() * 0.8;
    }
  })();
  function oortAlpha() { return Math.max(0, Math.min(1, (fitZ * 0.95 - cam.z) / (fitZ * 0.35))); } // fades in past the Fit view
  // Moons: name, parent, distance from parent centre (world units), real period (days), radius, colour, retrograde.
  // Distances and sizes are exaggerated for visibility; periods are compressed (sqrt) but keep their true order.
  var MOONS = [['Moon', 'Earth', 9, 27.32, 1.0, '#bdbdbd'], ['Phobos', 'Mars', 4.4, 0.319, 0.3, '#7a6e62'], ['Deimos', 'Mars', 6, 1.263, 0.25, '#8a7c6c'],
    ['Io', 'Jupiter', 16, 1.769, 0.9, '#e6d062'], ['Europa', 'Jupiter', 20, 3.551, 0.8, '#ddd3c0'], ['Ganymede', 'Jupiter', 25, 7.155, 1.2, '#988e80'],
    ['Callisto', 'Jupiter', 31, 16.69, 1.1, '#5a5046'], ['Enceladus', 'Saturn', 24, 1.370, 0.4, '#f4f6f8'], ['Rhea', 'Saturn', 28, 4.518, 0.55, '#bdbab4'],
    ['Titan', 'Saturn', 36, 15.95, 1.15, '#d69a48'], ['Miranda', 'Uranus', 10, 1.413, 0.35, '#aaaaaa'], ['Titania', 'Uranus', 14, 8.706, 0.6, '#a89d96'],
    ['Oberon', 'Uranus', 17, 13.46, 0.58, '#8a7a72'], ['Triton', 'Neptune', 10, 5.877, 0.75, '#e6d2c6', 1], ['Charon', 'Pluto', 4.5, 6.387, 0.8, '#a09a92']];
  var byName = {}; bodies.forEach(function (b) { byName[b.name] = b; });
  var moons = MOONS.map(function (m, i) {
    return { name: m[0], parent: byName[m[1]], orbit: m[2], days: m[3], r: m[4], color: m[5], dir: m[6] ? -1 : 1, spin: Infinity,
      phase: i * 1.7, x: 0, y: 0, moon: true };
  });
  var plutoPath = [];
  for (var q = 0; q <= 128; q++) { var E = q / 128 * Math.PI * 2; plutoPath.push(eccAt(PLUTO, E)); }
  function eccAt(b, E) { // eccentric anomaly -> compressed position
    var e = b.e, nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
    var R = au(b.a * (1 - e * Math.cos(E))); return [Math.cos(nu + b.w) * R, Math.sin(nu + b.w) * R];
  }
  function moonVisible(m) { return m.r * cam.z >= 1.2 && m.orbit * cam.z >= m.parent.r * cam.z + 8; }
  var all = [SUN].concat(bodies);
  var maxOrbit = au(49.3) + 8; // Pluto's aphelion

  var $ = function (id) { return document.getElementById(id); };
  var cv = $('c'), ctx = cv.getContext('2d'), panel = $('info'), ctl = $('ctl'), menu = $('menu');
  var SPEEDS = [0.25, 1, 4, 16, 64], speedI = 1, paused = false, simT = 0, lastT = null;
  var W = 0, H = 0, dpr = 1, cam = { x: 0, y: 0, z: 1 }, fitted = false;
  var follow = null, fly = null; // followed body; fly = {t0, x, y, z, toZ} while the camera travels
  var stars = [];
  for (var s = 0, seed = 7; s < 260; s++) {
    seed = (seed * 16807) % 2147483647; var a = seed / 2147483647;
    seed = (seed * 16807) % 2147483647; var b = seed / 2147483647;
    seed = (seed * 16807) % 2147483647;
    stars.push([a, b, 0.3 + (seed / 2147483647) * 0.9]);
  }

  function clampZ(z) { return Math.max(fitZ * 0.3, Math.min(fitZ * 60, z)); }
  // Screen point the camera centre maps to: the area not covered by the info panel.
  function centre() {
    if (panel.hidden) return { x: W / 2, y: H / 2 };
    var r = panel.getBoundingClientRect();
    return r.top > H * 0.3 ? { x: W / 2, y: ctl.getBoundingClientRect().top / 2 } : { x: r.left / 2, y: H / 2 };
  }
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    fitZ = Math.min(W, H) / (2 * maxOrbit);
    cam.z = fitted ? clampZ(cam.z) : fitZ; fitted = true;
  }
  window.addEventListener('resize', function () { resize(); placeCtl(); });
  resize();

  // ---- Select / follow / info panel ----
  function el(tag, text) { var e = document.createElement(tag); e.textContent = text; return e; }
  function select(b) {
    var d = window.SS_INFO[b.name], st = $('i-stats'), fx = $('i-facts');
    var rows = d.rows || [['Diameter', d.d], ['From Sun', d.dist], ['Orbit', d.period], ['Day', d.day], ['Moons', d.moons]];
    $('i-name').textContent = b.name;
    $('i-type').textContent = d.type;
    st.textContent = ''; fx.textContent = '';
    rows.forEach(function (r) { if (r[1]) { st.appendChild(el('dt', r[0])); st.appendChild(el('dd', r[1])); } });
    d.facts.forEach(function (f) { fx.appendChild(el('li', f)); });
    panel.hidden = false; placeCtl();
    follow = b;
    fly = { t0: performance.now(), x: cam.x, y: cam.y, z: cam.z,
      toZ: clampZ(b.region ? Math.min(W, H) / (2 * b.region[1] + 30) : (b === SUN ? 70 : 34) / b.r) };
  }
  function release() { follow = null; fly = null; panel.hidden = true; placeCtl(); }
  // Phone: the control bar sits just above the bottom sheet so neither covers the other.
  function placeCtl() {
    var sheet = !panel.hidden && panel.getBoundingClientRect().top > H * 0.3;
    ctl.style.bottom = sheet ? (H - panel.getBoundingClientRect().top + 8) + 'px' : '';
  }

  // ---- Speed controls and planet list ----
  function showSpeed() {
    $('speed').textContent = SPEEDS[speedI] + '\u00d7';
    $('play').innerHTML = paused ? '&#9654;' : '&#10074;&#10074;';
    $('play').classList.toggle('on', paused);
  }
  function togglePause() { paused = !paused; showSpeed(); }
  $('play').addEventListener('click', togglePause);
  $('slower').addEventListener('click', function () { speedI = Math.max(0, speedI - 1); showSpeed(); });
  $('faster').addEventListener('click', function () { speedI = Math.min(SPEEDS.length - 1, speedI + 1); showSpeed(); });
  function toggleMenu(open) { menu.hidden = !open; $('list').setAttribute('aria-expanded', String(open)); }
  $('list').addEventListener('click', function () { toggleMenu(menu.hidden); });
  all.concat(BELTS, [OORT], moons).forEach(function (b) {
    var btn = el('button', b.name); btn.type = 'button'; if (b.moon) btn.className = 'moon';
    btn.addEventListener('click', function () { toggleMenu(false); select(b); });
    menu.appendChild(btn);
  });
  $('close').addEventListener('click', release);
  $('fit').addEventListener('click', function () { toggleMenu(false); release(); cam = { x: 0, y: 0, z: fitZ }; });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { if (!menu.hidden) toggleMenu(false); else release(); }
    if (e.key === ' ') { e.preventDefault(); if (!e.repeat) togglePause(); }
  });
  window.addEventListener('keyup', function (e) { if (e.key === ' ') e.preventDefault(); }); // no double toggle via a focused button
  function tap(sx, sy) {
    var c = centre(), best = null, bestD = 1e9;
    all.concat(moons.filter(moonVisible)).forEach(function (b) {
      var d = Math.hypot((b.x - cam.x) * cam.z + c.x - sx, (b.y - cam.y) * cam.z + c.y - sy);
      if (d < Math.max(b.moon ? 14 : 22, b.r * cam.z + 10) && d < bestD) { best = b; bestD = d; }
    });
    if (!best && cam.z < fitZ * 4) { // no body hit: was it inside a belt?
      var w = toWorld(sx, sy), dw = Math.hypot(w.x, w.y);
      BELTS.forEach(function (bl) { if (dw > bl.region[0] - 4 && dw < bl.region[1] + 4) best = bl; });
      if (!best && oortAlpha() > 0 && dw > OORT.region[0] - 10 && dw < OORT.region[1] + 30) best = OORT;
    }
    if (!menu.hidden) toggleMenu(false); else if (best) select(best); else release();
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
    if (lastT !== null && !paused) simT += Math.min(t - lastT, 100) * SPEEDS[speedI];
    lastT = t;
    var years = simT / 1000 / EARTH_SECONDS;
    bodies.forEach(function (b) {
      var ang = b.phase + (years / b.period) * Math.PI * 2;
      if (b.e) { // Kepler's equation, a few Newton-free iterations are plenty for e = 0.25
        for (var E = ang, it = 0; it < 6; it++) E = ang + b.e * Math.sin(E);
        var pp = eccAt(b, E); b.x = pp[0]; b.y = pp[1]; return;
      }
      b.x = Math.cos(ang) * b.orbit; b.y = Math.sin(ang) * b.orbit;
    });
    moons.forEach(function (m) {
      var ang = m.phase + m.dir * simT / 1000 / (1.2 * Math.sqrt(m.days)) * Math.PI * 2;
      m.x = m.parent.x + Math.cos(ang) * m.orbit; m.y = m.parent.y + Math.sin(ang) * m.orbit;
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
    bodies.forEach(function (b) { if (!b.e) { ctx.beginPath(); ctx.arc(0, 0, b.orbit, 0, Math.PI * 2); ctx.stroke(); } });
    ctx.setLineDash([4 / cam.z, 4 / cam.z]); ctx.beginPath();
    plutoPath.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.stroke(); ctx.setLineDash([]);
    var vis = moons.filter(moonVisible);
    ctx.strokeStyle = 'rgba(120,150,210,.12)';
    vis.forEach(function (m) { ctx.beginPath(); ctx.arc(m.parent.x, m.parent.y, m.orbit, 0, Math.PI * 2); ctx.stroke(); });
    // Sun, then planets (textures are built lazily the first time a body is drawn large enough)
    var sec = simT / 1000;
    var vw = W / 2 / cam.z + 4, vh = H / 2 / cam.z + 4, px1 = 1 / cam.z; // view half-size in world units, for culling
    BELTS.forEach(function (bl) {
      var p = bl.parts, n = p.length / 3, k = 0;
      if (follow === bl) { // selected belt: faint amber band
        ctx.fillStyle = 'rgba(255,184,77,.07)'; ctx.beginPath(); ctx.arc(0, 0, bl.region[1], 0, Math.PI * 2);
        ctx.arc(0, 0, bl.region[0], 0, Math.PI * 2, true); ctx.fill();
      }
      for (var g = 0; g < 3; g++) { // three brightness groups, one fill each: cheap even with 2,300 dots
        ctx.fillStyle = 'rgba(' + bl.rgb + ',' + (0.35 + g * 0.25) + ')'; ctx.beginPath();
        for (k = g; k < n; k += 3) {
          var a = p[k * 3], ang = p[k * 3 + 1] + years / Math.pow(a, 1.5) * Math.PI * 2, R0 = au(a);
          var x = Math.cos(ang) * R0, y = Math.sin(ang) * R0;
          if (Math.abs(x - cam.x) > vw || Math.abs(y - cam.y) > vh) continue;
          var sz = Math.max(px1, Math.min(p[k * 3 + 2], 2.5 * px1)); ctx.rect(x - sz / 2, y - sz / 2, sz, sz);
        }
        ctx.fill();
      }
    });
    var oa = oortAlpha();
    if (oa > 0) {
      if (follow === OORT) {
        ctx.fillStyle = 'rgba(255,184,77,.06)'; ctx.beginPath(); ctx.arc(0, 0, OORT.region[1], 0, Math.PI * 2);
        ctx.arc(0, 0, OORT.region[0], 0, Math.PI * 2, true); ctx.fill();
      }
      var op = OORT.parts, on = op.length / 3;
      for (var og = 0; og < 2; og++) { // two brightness groups, one fill each
        ctx.fillStyle = 'rgba(' + OORT.rgb + ',' + oa * (0.35 + og * 0.3) + ')'; ctx.beginPath();
        for (var oi = og; oi < on; oi += 2) {
          var ox = op[oi * 3], oy = op[oi * 3 + 1];
          if (Math.abs(ox - cam.x) > vw || Math.abs(oy - cam.y) > vh) continue;
          var osz = op[oi * 3 + 2] * px1; ctx.rect(ox - osz / 2, oy - osz / 2, osz, osz);
        }
        ctx.fill();
      }
      // log distance scale: faint dashed rings 1,000 / 10,000 / 100,000 AU (each 10x farther)
      ctx.strokeStyle = 'rgba(150,165,200,' + oa * 0.3 + ')'; ctx.setLineDash([3 / cam.z, 5 / cam.z]);
      [1000, 10000, 100000].forEach(function (d) { ctx.beginPath(); ctx.arc(0, 0, au(d), 0, Math.PI * 2); ctx.stroke(); });
      ctx.setLineDash([]);
    }
    window.SS_ART.draw(ctx, SUN, cam.z, sec);
    bodies.forEach(function (b) { window.SS_ART.draw(ctx, b, cam.z, sec); });
    vis.forEach(function (m) { window.SS_ART.draw(ctx, m, cam.z, sec); });
    if (follow && !follow.region) { // selection ring
      ctx.strokeStyle = 'rgba(255,184,77,.8)'; ctx.lineWidth = 1.5 / cam.z;
      ctx.beginPath(); ctx.arc(follow.x, follow.y, follow.r + 5 / cam.z, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    // Labels in screen space; skip any that would overlap one already drawn (selected and Sun first)
    ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center';
    var placed = [], order = all.concat(vis.filter(function (m) { return m === follow || (m.r * cam.z >= 2.5 && m.orbit * cam.z >= 40); })).sort(function (p, q) { return (q === follow) - (p === follow); });
    if (cam.z < fitZ * 3) order = order.concat(BELTS);
    if (oa > 0.3) order.push(OORT);
    order.forEach(function (b) {
      var sx = (b.x - cam.x) * cam.z + c.x, sy = (b.y - cam.y - (b.region ? (b.region[0] + b.region[1]) / 2 : 0)) * cam.z + c.y;
      var pad = b === follow ? 7 : 0; // clear the selection ring
      var ly = b.region ? sy + 4 : b === SUN ? sy + b.r * cam.z + 13 + pad : sy - b.r * cam.z - 5 - pad, hw = ctx.measureText(b.name).width / 2 + 2;
      var box = [sx - hw, ly - 10, sx + hw, ly + 3];
      if (placed.some(function (q) { return box[0] < q[2] && box[2] > q[0] && box[1] < q[3] && box[3] > q[1]; })) return;
      placed.push(box); ctx.fillStyle = b === SUN ? '#ffd25a' : b.moon ? '#9fb0cc' : b.region ? 'rgba(' + b.rgb + ',.9)' : '#cfd8ea'; ctx.fillText(b.name, sx, ly);
    });
    if (cam.z < fitZ * 1.5) { // scale hint: tick labels on the Sun's right, each 10x farther than the last
      var sa = Math.min(1, (fitZ * 1.5 - cam.z) / (fitZ * 0.5)), sx0 = (0 - cam.x) * cam.z + c.x, sy0 = (0 - cam.y) * cam.z + c.y;
      ctx.font = '9px system-ui, sans-serif'; ctx.fillStyle = 'rgba(150,165,200,' + 0.75 * sa + ')';
      [[1, '1 AU'], [10, '10'], [100, '100'], [1000, '1,000'], [10000, '10,000'], [100000, '100,000 AU']].forEach(function (d) {
        var tx = sx0 + au(d[0]) * cam.z, ty = sy0 + 14, hw = ctx.measureText(d[1]).width / 2 + 2, box = [tx - hw, ty - 8, tx + hw, ty + 3];
        if (tx > W - hw || placed.some(function (q) { return box[0] < q[2] && box[2] > q[0] && box[1] < q[3] && box[3] > q[1]; })) return;
        placed.push(box); ctx.fillRect(tx - 0.5, sy0 + 3, 1, 3); ctx.fillText(d[1], tx, ty);
      });
      ctx.textAlign = 'left'; ctx.fillText('Distances on a log scale: each tick is 10\u00d7 farther', 12, 18);
    }
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
})();
