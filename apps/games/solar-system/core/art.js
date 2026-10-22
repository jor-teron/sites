// Solar System Explorer R2a: realistic-looking bodies on a plain 2D canvas, no libraries, offline.
// Each body gets a procedural texture (seeded, so identical every load) rendered once to an offscreen canvas,
// then drawn clipped to its disc, shaded with a day/night terminator facing the Sun, plus rim glow and rings.
window.SS_ART = (function () {
  'use strict';
  function rng(str) { // mulberry32 seeded from the body name
    var a = 0; for (var i = 0; i < str.length; i++) a = (a * 31 + str.charCodeAt(i)) | 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Value-noise fBm that wraps in x, so the texture can scroll round as the planet spins.
  function noise(rand) {
    var G = 128, g = new Float32Array(G * G);
    for (var i = 0; i < g.length; i++) g[i] = rand();
    function at(x, y) { return g[(((y % G) + G) % G) * G + ((x % G) + G) % G]; }
    function vn(x, y, wrap) {
      var xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
      fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
      var x0 = ((xi % wrap) + wrap) % wrap, x1 = (x0 + 1) % wrap;
      return (at(x0, yi) * (1 - fx) + at(x1, yi) * fx) * (1 - fy) + (at(x0, yi + 1) * (1 - fx) + at(x1, yi + 1) * fx) * fy;
    }
    // u wraps at 1; f = base frequency (integer). v spans half of u on the disc, so it is halved for round features.
    return function (u, v, f, oct) {
      var s = 0, amp = 0.5, n = 0;
      for (var o = 0; o < (oct || 4); o++) { s += vn(u * f, v * f / 2, f) * amp; n += amp; amp *= 0.5; f *= 2; }
      return s / n;
    };
  }
  function mix(a, b, t) { t = Math.max(0, Math.min(1, t)); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function hex(h) { var n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function bands(cols, t) { var k = ((t % cols.length) + cols.length) % cols.length, i = Math.floor(k); return mix(cols[i], cols[(i + 1) % cols.length], k - i); }
  function spot(u, v, cu, cv, ru, rv) { var du = Math.min(Math.abs(u - cu), 1 - Math.abs(u - cu)) / ru, dv = (v - cv) / rv; return 1 - Math.sqrt(du * du + dv * dv); }
  var C = {}; ['#e9dcc0', '#c99c6e', '#e3c79c', '#a8754f', '#f0e3c8', '#b98a62', '#d8b48a',
    '#e8d6a8', '#d4ba84', '#efe0b8', '#c9ad78', '#2a5fae', '#13386e', '#4e7d3a', '#9a8352', '#c8653a', '#7c3a1f', '#3f63d6', '#1d2f80']
    .forEach(function (h) { C[h] = hex(h); });
  var JUP = ['#e9dcc0', '#c99c6e', '#e3c79c', '#a8754f', '#f0e3c8', '#b98a62', '#d8b48a'].map(function (h) { return C[h]; });
  var SAT = ['#e8d6a8', '#d4ba84', '#efe0b8', '#c9ad78'].map(function (h) { return C[h]; });
  var PAINT = { // (u, v, n) -> [r, g, b]; u around the planet, v pole to pole, n = noise
    Sun: function (u, v, n) { var g = n(u, v, 64, 2); return mix([255, 178, 60], [255, 240, 180], 0.4 + (g - 0.5) * 1.4); },
    Mercury: function (u, v, n) { var g = 0.45 + 0.35 * n(u, v, 6); return [g * 200, g * 192, g * 184]; },
    Venus: function (u, v, n) { return mix([214, 180, 120], [250, 236, 200], n(u + 0.2 * Math.sin(v * 9), v * 2, 4) * 1.5 - 0.15); },
    Earth: function (u, v, n) {
      var h = n(u, v, 4, 5), lat = Math.abs(v - 0.5) * 2, c;
      c = h > 0.57 ? mix(C['#4e7d3a'], C['#9a8352'], (h - 0.57) * 8 + (lat < 0.3 ? 0.3 : 0)) : mix(C['#13386e'], C['#2a5fae'], (h - 0.35) * 5);
      if (lat + n(u, v, 8, 2) * 0.15 > 0.9) c = [236, 242, 250];
      var cl = n(u + 0.37, v, 8, 4); return mix(c, [255, 255, 255], Math.min(0.85, (cl - 0.56) * 3.5));
    },
    Mars: function (u, v, n) {
      var c = mix(C['#c8653a'], C['#7c3a1f'], (n(u, v, 5) - 0.45) * 3), lat = Math.abs(v - 0.5) * 2;
      return lat + n(u, v, 10, 2) * 0.1 > 0.9 ? [240, 232, 226] : c;
    },
    Jupiter: function (u, v, n) {
      var c = bands(JUP, v * 13 + 0.9 * n(u, v, 4) + 0.15 * Math.sin(u * 40 + v * 30)), s = spot(u, v, 0.3, 0.66, 0.06, 0.05);
      return s > 0 ? mix(c, mix([200, 92, 58], [226, 140, 96], n(u, v, 16, 2)), Math.min(1, s * 3)) : c;
    },
    Saturn: function (u, v, n) { return bands(SAT, v * 9 + 0.4 * n(u, v, 3)); },
    Uranus: function (u, v, n) { var g = 0.92 + 0.08 * Math.sin(v * 18 + n(u, v, 3) * 2); return [160 * g, 222 * g, 230 * g]; },
    Neptune: function (u, v, n) {
      var c = mix(C['#1d2f80'], C['#3f63d6'], 0.55 + 0.35 * Math.sin(v * 12 + n(u, v, 3) * 3)), s = spot(u, v, 0.62, 0.38, 0.05, 0.035);
      if (n(u * 1, v * 8, 4) > 0.68 && Math.abs(v - 0.3) < 0.05) c = mix(c, [235, 240, 255], 0.7); // bright cirrus streak
      return s > 0 ? mix(c, [14, 24, 70], Math.min(1, s * 3)) : c;
    }
  };
  var cache = {};
  function texture(b) {
    if (cache[b.name]) return cache[b.name];
    var W = b.r >= 3.5 ? 512 : 256, H = W / 2, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var x = cv.getContext('2d'), img = x.createImageData(W, H), d = img.data, rand = rng(b.name), n = noise(rand), p = PAINT[b.name];
    for (var j = 0, k = 0; j < H; j++) for (var i = 0; i < W; i++, k += 4) {
      var c = p(i / W, j / H, n); d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    if (b.name === 'Mercury' || b.name === 'Mars') for (var q = 0; q < (b.name === 'Mercury' ? 90 : 10); q++) { // craters
      var cx = rand() * W, cy = rand() * H, cr = 1 + Math.pow(rand(), 3) * (b.name === 'Mars' ? 5 : 12);
      x.fillStyle = 'rgba(0,0,0,.22)'; x.beginPath(); x.arc(cx, cy, cr, 0, 7); x.fill();
      x.strokeStyle = 'rgba(255,255,255,.18)'; x.lineWidth = Math.max(0.6, cr * 0.25); x.beginPath(); x.arc(cx - cr * 0.15, cy - cr * 0.15, cr, 2.4, 5.6); x.stroke();
    }
    return (cache[b.name] = cv);
  }
  function disc(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
  function radial(ctx, x, y, r0, r1, stops) {
    var g = ctx.createRadialGradient(x, y, r0, x, y, r1); stops.forEach(function (s) { g.addColorStop(s[0], s[1]); }); return g;
  }
  function textured(ctx, b, spin) { // texture scrolled by spin (0..1), squeezed into the disc
    var tx = texture(b), r = b.r, off = ((spin % 1) + 1) % 1 * 4 * r;
    ctx.save(); disc(ctx, b.x, b.y, r); ctx.clip();
    ctx.drawImage(tx, b.x - r - off, b.y - r, 4 * r, 2 * r); ctx.drawImage(tx, b.x + 3 * r - off, b.y - r, 4 * r, 2 * r);
    ctx.restore();
  }
  var GLOW = { Earth: '110,170,255', Venus: '255,230,170', Jupiter: '240,210,170', Saturn: '240,220,170', Uranus: '170,235,245', Neptune: '110,140,255' };
  var RINGS = [[1.24, 1.52, 0.22], [1.52, 1.72, 0.75], [1.72, 1.95, 0.9], [2.03, 2.2, 0.6], [2.22, 2.28, 0.45]]; // C, B (2), [Cassini gap], A, outer A
  function rings(ctx, b, half, px) {
    var u = b.name === 'Uranus', set = u ? [[1.6, 1.64, 0.18], [1.9, 1.95, 0.25]] : RINGS;
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(u ? 1.35 : -0.4); ctx.scale(1, u ? 0.35 : 0.38);
    set.forEach(function (s, i) {
      ctx.strokeStyle = u ? 'rgba(200,230,240,' + s[2] + ')' : 'rgba(' + (i % 2 ? '226,206,160,' : '204,182,136,') + s[2] + ')';
      ctx.lineWidth = Math.max((s[1] - s[0]) * b.r, 0.6 / px); ctx.beginPath();
      ctx.arc(0, 0, (s[0] + s[1]) / 2 * b.r, half ? Math.PI : 0, half ? Math.PI * 2 : Math.PI); ctx.stroke();
    });
    ctx.restore();
  }
  function sun(ctx, b, z, sec) {
    var r = b.r;
    ctx.fillStyle = radial(ctx, 0, 0, r * 0.9, r * 3.2, [[0, 'rgba(255,220,120,.75)'], [0.25, 'rgba(255,170,60,.28)'], [1, 'rgba(255,120,30,0)']]);
    disc(ctx, 0, 0, r * 3.2); ctx.fill();
    if (r * z < 6) { ctx.fillStyle = '#ffe27a'; disc(ctx, 0, 0, r); ctx.fill(); return; }
    textured(ctx, b, sec / 400);
    ctx.fillStyle = radial(ctx, 0, 0, 0, r, [[0, 'rgba(255,255,235,.55)'], [0.6, 'rgba(255,230,150,.2)'], [1, 'rgba(190,70,10,.6)']]); // limb darkening
    disc(ctx, 0, 0, r); ctx.fill();
  }
  // Draw one body in world units. z = camera zoom (px per unit), sec = simulated seconds (spin follows sim speed).
  function draw(ctx, b, z, sec) {
    if (!b.orbit) return sun(ctx, b, z, sec);
    var r = b.r, px = r * z, ring = b.name === 'Saturn' || b.name === 'Uranus';
    if (px < 3) { if (b.name === 'Saturn') rings(ctx, b, true, z); ctx.fillStyle = b.color; disc(ctx, b.x, b.y, r); ctx.fill(); return; }
    if (GLOW[b.name]) { ctx.fillStyle = radial(ctx, b.x, b.y, r * 0.98, r * 1.1, [[0, 'rgba(' + GLOW[b.name] + ',.45)'], [1, 'rgba(' + GLOW[b.name] + ',0)']]); disc(ctx, b.x, b.y, r * 1.1); ctx.fill(); }
    if (ring) rings(ctx, b, true, z);
    textured(ctx, b, sec / (b.spin || 60));
    var d = Math.hypot(b.x, b.y) || 1, lx = b.x - b.x / d * r * 0.45, ly = b.y - b.y / d * r * 0.45; // light centre toward the Sun
    ctx.fillStyle = radial(ctx, lx, ly, r * 0.15, r * 1.5, [[0, 'rgba(255,250,235,.12)'], [0.4, 'rgba(0,0,0,0)'], [0.62, 'rgba(0,0,8,.55)'], [0.8, 'rgba(0,0,8,.93)']]);
    disc(ctx, b.x, b.y, r); ctx.fill();
    if (ring) rings(ctx, b, false, z);
  }
  return { draw: draw, texture: texture };
})();
