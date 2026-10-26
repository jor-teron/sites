// UI + main loop.
(function () {
  var cv = document.getElementById('c'), $ = function (id) { return document.getElementById(id); };
  var SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16], U = AF.U = { paused: false, speed: 1, trails: true, seed: 0, fps: 60 };
  function start(seed) { U.seed = seed; $('seed').value = seed; AF.w = AF.newWorld(seed); AF.seedColony(AF.w); }
  function size() { var d = window.devicePixelRatio || 1; cv.width = innerWidth * d; cv.height = innerHeight * d; U.dpr = d; }
  addEventListener('resize', size); size();
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
  var FRAME = 1000 / 30, lastDraw = 0;               // 30fps cap: skip rAF ticks that come too early
  function loop(now) {
    requestAnimationFrame(loop);
    if (now - lastDraw < FRAME - 2) return; lastDraw = now;
    var dt = Math.min(0.1, (now - last) / 1000); last = now;
    fr++; ft += dt; if (ft > 1) { U.fps = fr / ft; fr = 0; ft = 0; }
    if (!U.paused) { acc += dt * U.speed; var n = 0; while (acc >= DT && n < 40) { AF.step(AF.w, DT); acc -= DT; n++; } if (n === 40) acc = 0; }
    var d = U.dpr, w = AF.w;
    AF.render(cv, w, { top: $('bar').offsetHeight * d + 4, bot: $('stats').offsetHeight * d + 4, trails: U.trails });
    $('stats').textContent = 'Ants ' + w.ants.length + ' · Food stored ' + Math.floor(w.stored) + ' · Eggs ' + AF.countStage(w, 'egg') + ' / Larvae ' + AF.countStage(w, 'larva') +
      ' · Day ' + (1 + Math.floor(w.t / AF.DAY)) + ' · Tunnels ' + w.dug + ' · ×' + U.speed + (U.paused ? ' (paused)' : '');
  }
  start(Math.random() * 1e6 | 0); requestAnimationFrame(loop);
})();
