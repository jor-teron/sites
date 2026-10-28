// UI + main loop. AF3: day clock in the stats, ant cap (300, or 150 with lowGraphics). AF2: shared settings (AF_SETTINGS: fpsLimit, showFps, autoPause,
// lowGraphics, gear) and test hooks ?seed=N&sim=SECONDS (fast-forward the colony at start).
(function () {
  var cv = document.getElementById('c'), $ = function (id) { return document.getElementById(id); };
  var SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16], U = AF.U = { paused: false, speed: 1, trails: true, seed: 0, fps: 60 };
  function start(seed) { U.seed = seed; $('seed').value = seed; AF.w = AF.newWorld(seed); AF.seedColony(AF.w); }
  function size() { var d = window.devicePixelRatio || 1; cv.width = innerWidth * d; cv.height = innerHeight * d; U.dpr = d; }
  addEventListener('resize', size); size();
  var SET = window.AF_SETTINGS, Q = {}; location.search.replace(/[?&](\w+)=([\d.]+)/g, function (m, k, v) { Q[k] = +v; });
  function cap() { AF.MAXANTS = SET && SET.get('lowGraphics') ? 150 : 300; }
  cap(); if (SET) { SET.mountGear($('bar')); SET.onChange(function () { FRAME = SET.frameMs(); cap(); }); }
  document.addEventListener('visibilitychange', function () { if (document.hidden && (!SET || SET.get('autoPause'))) { U.paused = true; $('pause').textContent = 'Play'; } });
  $('pause').onclick = function () { U.paused = !U.paused; this.textContent = U.paused ? 'Play' : 'Pause'; };
  $('reset').onclick = function () { start(U.seed); };
  $('newc').onclick = function () { var s = parseInt($('seed').value, 10); if (!(s >= 0) || s === U.seed) s = Math.random() * 1e6 | 0; start(s); };
  $('speed').oninput = function () { U.speed = SPEEDS[this.value]; };
  $('trails').onchange = function () { U.trails = this.checked; };
  cv.addEventListener('pointerdown', function (e) {
    var v = AF.view; if (!v) return; var x = (e.clientX * U.dpr - v.ox) / v.k;
    if (x < 0 || x >= AF.W) return;
    if ($('tool').value === 'food') AF.dropFood(AF.w, x); else AF.dropWater(AF.w, x);
  });
  var last = performance.now(), acc = 0, fr = 0, ft = 0, DT = 1 / 30;
  var FRAME = SET ? SET.frameMs() : 1000 / 30, lastDraw = 0;   // fps cap (30 default): skip rAF ticks that come too early
  function loop(now) {
    requestAnimationFrame(loop);
    if (now - lastDraw < FRAME - 2) return; lastDraw = now;
    var dt = Math.min(0.1, (now - last) / 1000); last = now;
    fr++; ft += dt; if (ft > 1) { U.fps = fr / ft; fr = 0; ft = 0; }
    if (!U.paused) { acc += dt * U.speed; var n = 0; while (acc >= DT && n < 40) { AF.step(AF.w, DT); acc -= DT; n++; } if (n === 40) acc = 0; }
    var d = U.dpr, w = AF.w;
    AF.render(cv, w, { top: $('bar').offsetHeight * d + 4, bot: $('stats').offsetHeight * d + 4, trails: U.trails && !(SET && SET.get('lowGraphics')), low: SET && SET.get('lowGraphics') });
    var hr = AF.dayPhase(w) * 24, clock = (hr | 0) + ':' + ('0' + ((hr % 1) * 60 | 0)).slice(-2) + (AF.nightAmt(w) > 0.3 ? ' ☾' : ' ☀');
    $('stats').textContent = 'Ants ' + w.ants.length + '/' + AF.MAXANTS + ' · Food stored ' + Math.floor(w.stored) + ' · Eggs ' + AF.countStage(w, 'egg') + ' / Larvae ' + AF.countStage(w, 'larva') +
      ' / Pupae ' + AF.countStage(w, 'pupa') + ' · Day ' + (1 + Math.floor((w.t / AF.DAY) + 0.3)) + ' ' + clock + ' · Tunnels ' + w.dug + ' · Rooms ' + w.rooms.length +
      ' · ×' + U.speed + (U.paused ? ' (paused)' : '') + (SET && SET.get('showFps') ? ' · ' + Math.round(U.fps) + ' fps' : '');
  }
  start(Q.seed >= 0 ? Q.seed | 0 : Math.random() * 1e6 | 0);
  if (Q.sim > 0) for (var t = 0; t < Q.sim; t += DT) AF.step(AF.w, DT);   // test hook: fast-forward
  requestAnimationFrame(loop);
})();
