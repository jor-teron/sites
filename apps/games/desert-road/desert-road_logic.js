/*
 * Desert Road (desert-road) — game logic.
 * Every tunable value comes from DESERT_ROAD_CONFIG (desert-road_config.js).
 * Movement is time based: config speeds are "px per 1/60 s tick", scaled by real dt,
 * so the game plays the same at 30 / 60 / 120 Hz. Frames are capped at CFG.maxFps.
 */
(() => {
  const CFG = DESERT_ROAD_CONFIG;
  /** True if the event's code or key is in the binding list. */
  const isKey = (list, e) => list.includes(e.code) || list.includes(e.key);

  // ----- Setup -----
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const timeEl = document.getElementById('time');
  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('startBtn');
  const bestEl = document.getElementById('best');
  const pauseBtn = document.getElementById('pauseBtn');
  const padL = document.getElementById('padLeft');
  const padR = document.getElementById('padRight');

  let W = 0, H = 0, DPR = 1;
  let sandGrad = null;          // background gradient, rebuilt only on resize
  let road = { x: 0, w: 0 };    // road strip in CSS px

  // ----- Game State -----
  const state = {
    running: false,
    paused: false,
    played: false,               // a run has started at least once (ends the idle preview)
    score: CFG.start.score,
    elapsed: 0,                  // game seconds (paused / hidden time does not count)
    speed: CFG.start.speed,      // scroll speed (px per 1/60 s tick)
    car: { x: 0, y: 0, w: CFG.car.width, h: CFG.car.height, targetX: 0 },
    obstacles: [],
    keys: { left: false, right: false },
    touchLeft: false,            // held touch / mouse on the left half
    touchRight: false,           // held touch / mouse on the right half
    spawnTimer: 0,               // seconds since the last spawn roll
    spawnInterval: CFG.start.spawnInterval,
    roadOffset: 0,
    shownTenths: -1,             // last time value written to the HUD
    needsDraw: true,             // redraw a static screen (paused / ended) once
  };

  // Obstacle types — family friendly, desert themed
  const OBSTACLE_TYPES = CFG.obstacles.types;

  // ----- Layout -----
  function roadGeom(w) {
    const rw = Math.min(w * CFG.road.widthFraction, CFG.road.maxWidth);
    return { x: (w - rw) / 2, w: rw };
  }
  function carY() {
    return Math.round(Math.min(H * CFG.car.yFraction, H - CFG.car.height / 2 - CFG.car.minBottomGap));
  }
  /** Car x limits: inside the road. */
  function carMinX() { return road.x + state.car.w / 2 + CFG.car.edgeMargin; }
  function carMaxX() { return road.x + road.w - state.car.w / 2 - CFG.car.edgeMargin; }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function resize() {
    const oldRoad = road, oldH = H;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width  = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    ctx.setTransform(canvas.width / (W || 1), 0, 0, canvas.height / (H || 1), 0, 0);
    road = roadGeom(W);
    sandGrad = ctx.createLinearGradient(0, 0, 0, H);
    sandGrad.addColorStop(0, CFG.colors.sandTop);
    sandGrad.addColorStop(1, CFG.colors.sandBottom);

    // Keep the car and obstacles at the same spot on the road and the same relative height.
    const c = state.car;
    if (oldRoad.w > 0 && oldH > 0) {
      const mapX = (x) => road.x + (x - oldRoad.x) * road.w / oldRoad.w;
      c.x = mapX(c.x);
      c.targetX = mapX(c.targetX);
      const m = CFG.obstacles.spawnMargin;
      for (const o of state.obstacles) {
        o.x = clamp(mapX(o.x + o.w / 2) - o.w / 2, road.x + m, road.x + road.w - m - o.w);
        o.y = o.y * H / oldH;
      }
    } else {
      c.x = c.targetX = W / 2;
    }
    c.x = clamp(c.x, carMinX(), carMaxX());
    c.targetX = clamp(c.targetX, carMinX(), carMaxX());
    c.y = carY();
    state.needsDraw = true;
    if (W > 0 && H > 0) {
      draw();                        // a resize clears the canvas: repaint now, even on a static screen
      if (state.paused) drawPaused();
    }
  }

  // ----- Best time (localStorage) -----
  function loadBest() {
    try {
      const b = JSON.parse(localStorage.getItem(CFG.storageKey));
      return b && typeof b.time === 'number' ? b : null;
    } catch (_) { return null; }
  }
  function saveBest(b) {
    try { localStorage.setItem(CFG.storageKey, JSON.stringify(b)); } catch (_) { /* private mode */ }
  }
  function bestHtml(b) {
    return b ? CFG.text.best.replace('{time}', b.time.toFixed(1)).replace('{rank}', b.rank) : '';
  }
  if (bestEl) bestEl.innerHTML = bestHtml(loadBest());

  // ----- Input -----
  function onKeyDown(e) {
    if (isKey(CFG.keys.left, e))  { state.keys.left  = true; e.preventDefault(); }
    if (isKey(CFG.keys.right, e)) { state.keys.right = true; e.preventDefault(); }
    // Held keys (and the Hub keyboard / controller) auto-repeat: never toggle on a repeat.
    if (e.repeat) {
      if (isKey(CFG.keys.start, e) || isKey(CFG.keys.pause, e) || isKey(CFG.keys.restart, e)) e.preventDefault();
      return;
    }
    if (!state.running) {
      if (isKey(CFG.keys.start, e)) {
        // preventDefault: a focused Start button must not also "click" (double start)
        e.preventDefault();
        startGame();
      }
    } else if (isKey(CFG.keys.pause, e)) {
      e.preventDefault();
      togglePause();
    } else if (isKey(CFG.keys.restart, e)) {
      e.preventDefault();
      startGame();
    } else if (isKey(CFG.keys.start, e)) {
      e.preventDefault(); // Space while driving: no page scroll
    }
  }
  function onKeyUp(e) {
    if (isKey(CFG.keys.left, e))  state.keys.left  = false;
    if (isKey(CFG.keys.right, e)) state.keys.right = false;
  }
  /** Focus lost: the keyup / pointerup would never arrive, so drop held input. */
  function clearInput() {
    state.keys.left = false;
    state.keys.right = false;
    touches.clear();
    updatePads();
  }
  /** Tab hidden or window blurred: drop held input and pause a run. */
  function autoPause() {
    clearInput();
    if (state.running && !state.paused) togglePause();
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup',   onKeyUp);
  window.addEventListener('blur', autoPause);
  document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });

  // Touch / mouse: hold the left or right half of the screen to steer; sliding across switches side.
  const touches = new Map(); // pointerId -> 'left' | 'right'
  function sideOf(e) { return e.clientX < W / 2 ? 'left' : 'right'; }
  function updatePads() {
    let l = false, r = false;
    for (const d of touches.values()) { if (d === 'left') l = true; else r = true; }
    state.touchLeft = l;
    state.touchRight = r;
    if (padL) padL.classList.toggle('on', l);
    if (padR) padR.classList.toggle('on', r);
  }
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (state.running && state.paused) { togglePause(); return; } // tap resumes
    if (!state.running) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    touches.set(e.pointerId, sideOf(e));
    updatePads();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, sideOf(e));
    updatePads();
  });
  const endTouch = (e) => { if (touches.delete(e.pointerId)) updatePads(); };
  canvas.addEventListener('pointerup', endTouch);
  canvas.addEventListener('pointercancel', endTouch);
  canvas.addEventListener('lostpointercapture', endTouch);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  if (pauseBtn) {
    pauseBtn.addEventListener('click', (e) => {
      if (e.currentTarget.blur) e.currentTarget.blur();
      togglePause();
    });
  }

  /** Start button click: drop focus so a later Space / Enter cannot click it again. */
  function onStartClick(e) {
    if (e && e.currentTarget && e.currentTarget.blur) e.currentTarget.blur();
    if (!state.running) startGame();
  }

  /** Pause / resume a run (elapsed is game time, so pausing stops the clock). */
  function togglePause() {
    if (!state.running) return;
    state.paused = !state.paused;
    state.needsDraw = true;
    if (pauseBtn) pauseBtn.textContent = state.paused ? '▶' : '⏸';
  }

  // Controller hook — plug your InputBus here later:
  //   InputBus.on(e => {
  //     if (e.type==='dpad') { state.keys.left = e.dir==='left' && e.state==='down'; ... }
  //   });
  window.setDriveInput = (dir, down) => {
    if (dir === 'left')  state.keys.left  = down;
    if (dir === 'right') state.keys.right = down;
  };

  // ----- Game Flow -----
  function startGame() {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    state.running = true;
    state.paused = false;
    state.played = true;
    state.score = CFG.start.score;
    state.elapsed = 0;
    state.speed = CFG.start.speed;
    state.obstacles = [];
    state.spawnTimer = 0;
    state.spawnInterval = CFG.start.spawnInterval;
    state.roadOffset = 0;
    state.shownTenths = -1;
    state.car.x = state.car.targetX = road.x + road.w / 2;
    state.car.y = carY();
    scoreEl.textContent = String(CFG.start.score);
    timeEl.textContent = '0.0';
    overlay.classList.add('hidden');
    if (pauseBtn) { pauseBtn.textContent = '⏸'; pauseBtn.classList.remove('hidden'); }
  }

  function endGame(win) {
    state.running = false;
    state.paused = false;
    state.needsDraw = true;
    clearInput();
    if (pauseBtn) pauseBtn.classList.add('hidden');

    if (win) {
      const t = state.elapsed;
      const r = CFG.ranks.find(x => t < x.maxSeconds) || CFG.ranks[CFG.ranks.length - 1];
      const prev = loadBest();
      const isNew = !prev || t < prev.time;
      const best = isNew ? { time: t, rank: r.rank } : prev;
      if (isNew) saveBest(best);

      overlay.innerHTML = `
        <h1>${CFG.text.winTitle}</h1>
        <div class="rank">${r.rank}</div>
        <p>Time: <strong>${t.toFixed(1)}s</strong><br>${r.message}</p>
        <p class="best">${isNew ? CFG.text.newBest + '<br>' : ''}${bestHtml(best)}</p>
        <button id="startBtn">${CFG.text.winButton}</button>
      `;
    } else {
      overlay.innerHTML = `
        <h1>${CFG.text.crashTitle}</h1>
        <p>${CFG.text.crashBody.replace('{score}', state.score)}</p>
        <p class="best">${bestHtml(loadBest())}</p>
        <button id="startBtn">${CFG.text.crashButton}</button>
      `;
    }
    overlay.classList.remove('hidden');
    document.getElementById('startBtn').addEventListener('click', onStartClick);
  }

  // ----- Spawning -----
  function spawnObstacle() {
    const type = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
    const m = CFG.obstacles.spawnMargin;
    const x = road.x + m + Math.random() * Math.max(0, road.w - m * 2 - type.w);
    state.obstacles.push({
      x, y: -type.h - CFG.obstacles.spawnAbove,
      w: type.w, h: type.h,
      emoji: type.emoji,
      points: type.points,
    });
  }

  // ----- Update -----
  function update(dt) {
    const k = dt * 60; // 1/60 s ticks this frame
    state.elapsed += dt;
    const tenths = Math.floor(state.elapsed * 10);
    if (tenths !== state.shownTenths) {
      state.shownTenths = tenths;
      timeEl.textContent = (tenths / 10).toFixed(1);
    }

    // difficulty ramps up slightly
    const D = CFG.difficulty;
    state.speed = CFG.start.speed + Math.min(state.elapsed * D.speedPerSecond, D.maxExtraSpeed);
    state.spawnInterval = Math.max(D.minSpawnInterval, CFG.start.spawnInterval - state.elapsed * D.spawnDecayPerSecond);

    // road stripes
    state.roadOffset = (state.roadOffset + state.speed * k) % CFG.road.stripePeriod;

    // car movement — smooth follow, kept on the road
    const c = state.car;
    const left = state.keys.left || state.touchLeft;
    const right = state.keys.right || state.touchRight;
    const move = CFG.car.moveSpeed * k;
    if (left)  c.targetX -= move;
    if (right) c.targetX += move;
    c.targetX = clamp(c.targetX, carMinX(), carMaxX());
    c.x += (c.targetX - c.x) * (1 - Math.pow(1 - CFG.car.follow, k));

    // spawn
    state.spawnTimer += dt;
    if (state.spawnTimer >= state.spawnInterval) {
      state.spawnTimer -= state.spawnInterval;
      if (state.spawnTimer > state.spawnInterval) state.spawnTimer = 0; // after a stall
      // avoid spawning too many at once
      if (Math.random() < D.spawnChance) spawnObstacle();
    }

    // move obstacles
    const pad = CFG.obstacles.hitPad;
    const carL = c.x - c.w / 2 + pad;
    const carR = c.x + c.w / 2 - pad;
    const carT = c.y - c.h / 2 + pad;
    const carB = c.y + c.h / 2 - pad;
    for (let i = state.obstacles.length - 1; i >= 0; i--) {
      const o = state.obstacles[i];
      o.y += state.speed * k;

      // collision (AABB, slightly forgiving)
      const oL = o.x + pad, oR = o.x + o.w - pad;
      const oT = o.y + pad, oB = o.y + o.h - pad;
      if (carL < oR && carR > oL && carT < oB && carB > oT) {
        endGame(false);
        return;
      }

      // passed obstacle -> score
      if (o.y > H) {
        state.score += o.points;
        scoreEl.textContent = state.score;
        state.obstacles.splice(i, 1);

        if (state.score >= CFG.winScore) {
          endGame(true);
          return;
        }
      }
    }
  }

  // ----- Draw -----
  function draw() {
    // sand background
    ctx.fillStyle = sandGrad;
    ctx.fillRect(0, 0, W, H);

    // road (center strip)
    const roadX = road.x, roadW = road.w;
    ctx.fillStyle = CFG.colors.road;
    ctx.fillRect(roadX, 0, roadW, H);

    // road edges (dashed)
    ctx.strokeStyle = CFG.colors.roadEdge;
    ctx.lineWidth = CFG.road.edgeWidth;
    ctx.setLineDash(CFG.road.edgeDash);
    ctx.beginPath();
    ctx.moveTo(roadX, 0); ctx.lineTo(roadX, H);
    ctx.moveTo(roadX + roadW, 0); ctx.lineTo(roadX + roadW, H);
    ctx.stroke();
    ctx.setLineDash([]);

    // center dashed stripe scrolling
    ctx.strokeStyle = CFG.colors.stripe;
    ctx.lineWidth = CFG.road.stripeWidth;
    ctx.setLineDash(CFG.road.stripeDash);
    ctx.lineDashOffset = -state.roadOffset;
    ctx.beginPath();
    ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;

    // obstacles
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let font = '';
    for (const o of state.obstacles) {
      const f = `${Math.round(o.h)}px serif`;
      if (f !== font) { ctx.font = f; font = f; }
      ctx.fillText(o.emoji, o.x + o.w / 2, o.y + o.h / 2);
    }

    // car (simple top-down shape)
    const c = state.car, C = CFG.car;
    ctx.save();
    ctx.translate(c.x, c.y);
    // shadow
    ctx.fillStyle = CFG.colors.carShadow;
    ctx.beginPath();
    ctx.ellipse(0, 6, c.w / 2, c.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // body
    ctx.fillStyle = CFG.colors.carBody;
    roundRect(-c.w / 2, -c.h / 2, c.w, c.h, C.cornerRadius);
    ctx.fill();
    // windshield
    ctx.fillStyle = CFG.colors.windshield;
    roundRect(-c.w / 2 + C.windshieldInset, -c.h / 2 + C.windshieldTop,
              c.w - C.windshieldInset * 2, C.windshieldHeight, 4);
    ctx.fill();
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(CFG.text.paused, W / 2, H / 2);
  }

  // ----- Loop (one rAF loop, capped at CFG.maxFps) -----
  const FRAME_MS = 1000 / CFG.maxFps;
  const FRAME_SLACK_MS = 1.5;   // early-fire tolerance so 60 Hz lands on every 2nd vsync
  let lastTick = performance.now();
  let lastStep = lastTick;
  let frameAcc = 0;             // time owed toward the next frame; leftover carries over

  function loop(now) {
    requestAnimationFrame(loop);
    frameAcc += now - lastTick;
    lastTick = now;
    if (frameAcc < FRAME_MS - FRAME_SLACK_MS) return;
    frameAcc -= FRAME_MS;
    if (frameAcc > FRAME_MS || frameAcc < -FRAME_MS) frameAcc = 0; // after a stall: no catch-up

    let dt = (now - lastStep) / 1000;
    lastStep = now;
    if (dt > 0.1) dt = 0.1;
    if (dt < 0) dt = 0;

    if (state.running && !state.paused) {
      update(dt);
      draw();                     // also draws the crash / finish frame behind the overlay
    } else if (!state.played) {
      // idle preview before the first run
      state.roadOffset = (state.roadOffset + CFG.road.idleScroll * dt * 60) % CFG.road.stripePeriod;
      draw();
    } else if (state.needsDraw) {  // paused or ended: static screen, draw once
      state.needsDraw = false;
      draw();
      if (state.paused) drawPaused();
    }
  }

  window.addEventListener('resize', resize);
  resize();
  startBtn.addEventListener('click', onStartClick);
  requestAnimationFrame(loop);

  // expose for Controller integration (DesertDrive kept as an alias)
  window.DesertRoad = window.DesertDrive = { start: startGame, setInput: window.setDriveInput };
})();
