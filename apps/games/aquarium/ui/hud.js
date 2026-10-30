// Aquarium AQQ1a (from AQ1b): HUD gauges, fish info card, tap input, frame loop and boot.
(function () {
  'use strict';
  var A = window.AQ, S = A.st, C = A.core, V = A.view, cv = V.cv, raf = 0, last = 0, slow = 0, nfr = 0;
  var card = document.getElementById('card'), $ = function (id) { return document.getElementById(id); };

  // ---- display hooks called by core/sim.js ----
  A.ui = {
    armed: function (on) { $('feed').classList.toggle('on', !!on); $('feed').setAttribute('aria-pressed', on ? 'true' : 'false'); cv.style.cursor = on ? 'crosshair' : 'pointer';
      var h = $('hint'); if (on) { h.textContent = 'Tap the water to drop food'; h.classList.remove('off'); } else h.classList.add('off'); },
    cleaning: function (on) { $('clean').disabled = !!on; }
  };
  function hud() {
    var s = C.stats(); $('g-mood').style.width = Math.round(s.mood * 100) + '%'; $('g-water').style.width = Math.round(s.wq) + '%';
    $('g-mood').style.background = s.mood > .6 ? '#6fdc8c' : s.mood > .35 ? '#f0c24a' : '#e8884a'; $('g-water').style.background = s.wq > 60 ? '#5fd0f0' : s.wq > 30 ? '#c8d85a' : '#c6a24a';
    $('hud').title = 'Mood ' + Math.round(s.mood * 100) + '% (avg hunger ' + Math.round(s.hunger) + '%), water ' + Math.round(s.wq) + '%';
    if (S.sel) cardState();
  }
  function cardState() { var sel = S.sel; $('c-mood').textContent = A.behave.word(sel) + ' \u00b7 ' + C.moodWord(sel); $('c-hunger').textContent = 'Hunger ' + Math.round(sel.hunger) + '%'; $('c-bar').style.width = Math.round(sel.hunger) + '%'; }

  // ---- selection card ----
  function show(f) {
    S.sel = f; if (!f) { card.hidden = true; return; }
    var s = f.sp; $('c-name').textContent = s.name; $('c-sci').textContent = s.sci; $('c-desc').textContent = s.desc;
    var ul = $('c-facts'); ul.textContent = ''; s.facts.forEach(function (x) { var li = document.createElement('li'); li.textContent = x; ul.appendChild(li); });
    cardState(); card.classList.toggle('top', f.y > S.H * .55);   // phone: sheet goes opposite the fish so it never covers it
    card.hidden = false; $('hint').classList.add('off');
  }
  function pick(px, py) {
    var best = null, bd = 1, pad = 14;
    S.fish.forEach(function (f) {
      var rx = f.L * .5 + pad, ry = Math.max(f.hh * .5, f.L * .2) + pad, dx = (px - f.x) / rx, dy = (py - f.y) / ry, d = dx * dx + dy * dy;
      if (d <= bd) { bd = d; best = f; }
    });
    return best;
  }
  var down = null;
  cv.addEventListener('pointerdown', function (e) { down = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
  cv.addEventListener('pointerup', function (e) {
    if (down && down.id === e.pointerId && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 10) {
      var hit = pick(e.clientX, e.clientY);
      if (hit || !card.hidden) show(hit);   // a fish opens its card; any tap on empty water first closes an open card
      else if (S.armed || e.clientY < S.H * .3) C.drop(e.clientX, e.clientY);   // otherwise empty water near the surface (or any water when Feed is armed) gets food
      else A.behave.startle(e.clientX, e.clientY);   // deeper empty water: nearby fish dart away
    }
    down = null;
  });
  cv.addEventListener('pointercancel', function () { down = null; });
  $('close').addEventListener('click', function () { show(null); });
  $('feed').addEventListener('click', function () { C.setArmed(!S.armed); S.armedT = 12; });
  $('clean').addEventListener('click', C.clean);
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape') show(null); });

  // ---- loop ----
  function frame(ts) {
    raf = requestAnimationFrame(frame); var dt = Math.min(.05, (ts - last) / 1000); last = ts;
    C.update(dt); V.draw();
    if (V.maxDpr() > 1.25 && ++nfr > 20) { slow += dt > .03 ? 1 : 0; if (nfr > 120) { if (slow > 80) { V.maxDpr(1.25); V.layout(); } nfr = -1e9; } }   // one-off quality drop on very slow devices
  }
  function start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  document.addEventListener('visibilitychange', function () { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else start(); });
  window.addEventListener('resize', V.layout);
  setTimeout(function () { if (!S.armed) $('hint').classList.add('off'); }, 9000);
  V.layout(); C.load(); hud(); start();
  setInterval(hud, 250); setInterval(C.save, 30000);
  window.addEventListener('pagehide', C.save); document.addEventListener('visibilitychange', function () { if (document.hidden) C.save(); });
})();
