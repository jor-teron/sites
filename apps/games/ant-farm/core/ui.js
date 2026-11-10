// UI + main loop. AF-4a: fill-the-phone camera (pinch, wheel, pan), compact
// toolbar with the title always visible, light + Auto theme.
// AF3: day clock in the stats, ant cap (300, or 150 with lowGraphics).
// AF2: shared settings (AF_SETTINGS: fpsLimit, showFps, autoPause, lowGraphics,
// gear) and test hooks ?seed=N&sim=SECONDS (fast-forward the colony at start).
(function () {
  var cv = document.getElementById('c'), $ = function (id) { return document.getElementById(id); };
  var SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16], U = AF.U = { paused: false, speed: 1, trails: true, seed: 0, fps: 60 };
  var SET = window.AF_SETTINGS, Q = {}; location.search.replace(/[?&](\w+)=([\d.]+)/g, function (m, k, v) { Q[k] = +v; });

  function applyTheme() {
    var dark = !SET || SET.isDark();
    document.documentElement.className = dark ? 'dark' : 'light';
    document.body.className = dark ? 'dark' : 'light';
    U.light = !dark;
  }
  applyTheme();
  if (window.matchMedia) {
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { if (!SET || SET.get('theme') === 'auto') applyTheme(); }); } catch (e) { /* old webkit */ }
  }

  function start(seed) { U.seed = seed; $('seed').value = seed; AF.w = AF.newWorld(seed); AF.seedColony(AF.w); AF.resetCam(AF.w); }
  function size() { var d = window.devicePixelRatio || 1; cv.width = innerWidth * d; cv.height = innerHeight * d; U.dpr = d; }
  addEventListener('resize', size); size();

  function cap() { AF.MAXANTS = SET && SET.get('lowGraphics') ? 150 : 300; }
  cap();
  if (SET) {
    SET.mountGear($('bar'));
    SET.onChange(function () { FRAME = SET.frameMs(); cap(); applyTheme(); });
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden && (!SET || SET.get('autoPause'))) { U.paused = true; $('pause').textContent = 'Play'; } });

  function toggleMore(on) {
    var p = $('more'), b = $('moreBtn');
    var open = on == null ? !p.classList.contains('open') : !!on;
    p.classList.toggle('open', open); p.hidden = !open; b.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  $('moreBtn').onclick = function (e) { e.stopPropagation(); toggleMore(); };
  document.addEventListener('pointerdown', function (e) {
    var p = $('more'); if (p.classList.contains('open') && !p.contains(e.target) && e.target !== $('moreBtn')) toggleMore(false);
  });

  $('pause').onclick = function () { U.paused = !U.paused; this.textContent = U.paused ? 'Play' : 'Pause'; };
  function resetSame() { start(U.seed); }
  $('reset').onclick = resetSame; $('resetPhone').onclick = function () { resetSame(); toggleMore(false); };
  $('newc').onclick = function () { var s = parseInt($('seed').value, 10); if (!(s >= 0) || s === U.seed) s = Math.random() * 1e6 | 0; start(s); toggleMore(false); };
  $('speed').oninput = function () { U.speed = SPEEDS[this.value]; };
  $('trails').onchange = function () { U.trails = this.checked; };
  $('fit').onclick = function () { AF.fitCam(); toggleMore(false); };
  $('fill').onclick = function () { AF.fillCam(AF.w); toggleMore(false); };

  // --- camera gestures: short tap uses the tool; a drag pans; wheel / pinch zoom ---
  var ptrs = {}, gest = { mode: '', moved: false, dist: 0, midX: 0, midY: 0 };
  function clientToWorld(cx, cy) {
    var v = AF.view; if (!v) return null;
    return { x: (cx * U.dpr - v.ox) / v.k, y: (cy * U.dpr - v.oy) / v.k };
  }
  function ptrList() { var a = [], id; for (id in ptrs) if (ptrs.hasOwnProperty(id)) a.push(ptrs[id]); return a; }
  function dist2(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
  function dropAt(cx, cy) {
    var w = clientToWorld(cx, cy); if (!w || w.x < 0 || w.x >= AF.W) return;
    if ($('tool').value === 'food') AF.dropFood(AF.w, w.x); else AF.dropWater(AF.w, w.x);
  }
  cv.addEventListener('pointerdown', function (e) {
    if (e.button && e.button !== 0) return;
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY };
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* not required */ }
    var list = ptrList();
    if (list.length >= 2) {
      gest.mode = 'pinch'; gest.moved = true; gest.dist = dist2(list[0], list[1]);
      gest.midX = (list[0].x + list[1].x) / 2; gest.midY = (list[0].y + list[1].y) / 2;
    } else { gest.mode = 'maybe'; gest.moved = false; }
  });
  cv.addEventListener('pointermove', function (e) {
    if (!ptrs[e.pointerId]) return;
    var prev = { x: ptrs[e.pointerId].x, y: ptrs[e.pointerId].y };
    ptrs[e.pointerId].x = e.clientX; ptrs[e.pointerId].y = e.clientY;
    var list = ptrList();
    if (list.length >= 2) {
      var d = dist2(list[0], list[1]), midX = (list[0].x + list[1].x) / 2, midY = (list[0].y + list[1].y) / 2;
      if (gest.dist > 0 && d > 0) {
        var w = clientToWorld(midX, midY); if (w) AF.zoomAt(w.x, w.y, d / gest.dist);
        AF.panBy((midX - gest.midX) * U.dpr, (midY - gest.midY) * U.dpr);
      }
      gest.dist = d; gest.midX = midX; gest.midY = midY; gest.mode = 'pinch'; gest.moved = true;
    } else if (gest.mode !== 'pinch') {
      var dx = e.clientX - ptrs[e.pointerId].sx, dy = e.clientY - ptrs[e.pointerId].sy;
      if (!gest.moved && dx * dx + dy * dy > 64) gest.moved = true;
      if (gest.moved) { AF.panBy((e.clientX - prev.x) * U.dpr, (e.clientY - prev.y) * U.dpr); gest.mode = 'pan'; }
    }
  });
  function endPtr(e) {
    var p = ptrs[e.pointerId];
    if (p && gest.mode === 'maybe' && !gest.moved) dropAt(p.sx, p.sy);
    delete ptrs[e.pointerId];
    var list = ptrList();
    if (list.length < 2 && gest.mode === 'pinch') { gest.mode = 'pan'; gest.moved = true; }
    if (!list.length) gest.mode = '';
  }
  cv.addEventListener('pointerup', endPtr);
  cv.addEventListener('pointercancel', endPtr);
  cv.addEventListener('wheel', function (e) {
    e.preventDefault();
    var w = clientToWorld(e.clientX, e.clientY); if (!w) return;
    AF.zoomAt(w.x, w.y, e.deltaY < 0 ? 1.12 : 1 / 1.12);
  }, { passive: false });
  addEventListener('keydown', function (e) {
    if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
    if (e.key === '+' || e.key === '=') { var v = AF.view; if (v) AF.zoomAt((v.availW / 2 - v.ox) / v.k, (v.top + v.availH / 2 - v.oy) / v.k, 1.12); }
    if (e.key === '-' || e.key === '_') { var v2 = AF.view; if (v2) AF.zoomAt((v2.availW / 2 - v2.ox) / v2.k, (v2.top + v2.availH / 2 - v2.oy) / v2.k, 1 / 1.12); }
    if (e.key === '0') AF.fillCam(AF.w);
    if (e.key === 'f' || e.key === 'F') AF.fitCam();
    var step = 40 * (U.dpr || 1);
    if (e.key === 'ArrowLeft') AF.panBy(-step, 0);
    if (e.key === 'ArrowRight') AF.panBy(step, 0);
    if (e.key === 'ArrowUp') AF.panBy(0, -step);
    if (e.key === 'ArrowDown') AF.panBy(0, step);
  });

  var last = performance.now(), acc = 0, fr = 0, ft = 0, DT = 1 / 30;
  var FRAME = SET ? SET.frameMs() : 1000 / 30, lastDraw = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    if (now - lastDraw < FRAME - 2) return; lastDraw = now;
    var dt = Math.min(0.1, (now - last) / 1000); last = now;
    fr++; ft += dt; if (ft > 1) { U.fps = fr / ft; fr = 0; ft = 0; }
    if (!U.paused) { acc += dt * U.speed; var n = 0; while (acc >= DT && n < 40) { AF.step(AF.w, DT); acc -= DT; n++; } if (n === 40) acc = 0; }
    var d = U.dpr, w = AF.w, bar = $('bar'), st = $('stats');
    AF.render(cv, w, { top: bar.offsetHeight * d + 4, bot: st.offsetHeight * d + 4, trails: U.trails && !(SET && SET.get('lowGraphics')), low: SET && SET.get('lowGraphics'), light: !!U.light });
    var hr = AF.dayPhase(w) * 24, clock = (hr | 0) + ':' + ('0' + ((hr % 1) * 60 | 0)).slice(-2) + (AF.nightAmt(w) > 0.3 ? ' ☾' : ' ☀');
    st.textContent = 'Ants ' + w.ants.length + '/' + AF.MAXANTS + ' · Food stored ' + Math.floor(w.stored) + ' · Eggs ' + AF.countStage(w, 'egg') + ' / Larvae ' + AF.countStage(w, 'larva') +
      ' / Pupae ' + AF.countStage(w, 'pupa') + ' · Day ' + (1 + Math.floor((w.t / AF.DAY) + 0.3)) + ' ' + clock + ' · Tunnels ' + w.dug + ' · Rooms ' + w.rooms.length +
      ' · ×' + U.speed + (U.paused ? ' (paused)' : '') + (SET && SET.get('showFps') ? ' · ' + Math.round(U.fps) + ' fps' : '');
  }
  start(Q.seed >= 0 ? Q.seed | 0 : Math.random() * 1e6 | 0);
  if (Q.sim > 0) for (var t = 0; t < Q.sim; t += DT) AF.step(AF.w, DT);
  requestAnimationFrame(loop);
})();
