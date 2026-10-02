/*
 * Desert Drive (desert-road) — game logic.
 * Every tunable value comes from DESERT_ROAD_CONFIG (desert-road_config.js).
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

  let W = 0, H = 0, DPR = 1;

  function resize() {
    DPR = window.devicePixelRatio || 1;
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width  = W * DPR;
    canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // ----- Game State -----
  const state = {
    running: false,
    paused: false,
    pausedAt: 0,
    score: CFG.start.score,
    startTime: 0,
    elapsed: 0,
    distance: 0,
    speed: CFG.start.speed,   // scroll speed (px per frame at 60fps)
    car: { x: 0, y: 0, w: CFG.car.width, h: CFG.car.height, targetX: 0 },
    obstacles: [],
    keys: { left: false, right: false },
    spawnTimer: 0,
    spawnInterval: CFG.start.idleSpawnInterval, // frames between spawns (decreases slightly)
    lastTime: 0,
    roadOffset: 0,
  };

  // Obstacle types — family friendly, desert themed
  const OBSTACLE_TYPES = CFG.obstacles.types;

  // ----- Input -----
  function onKeyDown(e) {
    if (isKey(CFG.keys.left, e))  { state.keys.left  = true; e.preventDefault(); }
    if (isKey(CFG.keys.right, e)) { state.keys.right = true; e.preventDefault(); }
    if (e.repeat) {
      if (isKey(CFG.keys.start, e) || isKey(CFG.keys.pause, e)) e.preventDefault();
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
  /** Focus lost: the keyup would never arrive, so drop held keys. */
  function clearKeys() {
    state.keys.left = false;
    state.keys.right = false;
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup',   onKeyUp);
  window.addEventListener('blur', clearKeys);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearKeys(); });

  /** Start button click: drop focus so a later Space / Enter cannot click it again. */
  function onStartClick(e) {
    if (e && e.currentTarget && e.currentTarget.blur) e.currentTarget.blur();
    if (!state.running) startGame();
  }

  /** Pause / resume a run (the clock does not count while paused). */
  function togglePause() {
    if (!state.running) return;
    const now = performance.now();
    if (state.paused) {
      state.paused = false;
      state.startTime += now - state.pausedAt;
      state.lastTime = now;
    } else {
      state.paused = true;
      state.pausedAt = now;
    }
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
    const wasRunning = state.running;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    state.running = true;
    state.paused = false;
    state.score = CFG.start.score;
    state.elapsed = 0;
    state.distance = 0;
    state.speed = CFG.start.speed;
    state.obstacles = [];
    state.spawnTimer = 0;
    state.spawnInterval = CFG.start.spawnInterval;
    state.startTime = performance.now();
    state.lastTime = performance.now();
    state.roadOffset = 0;
    state.car.x = W / 2;
    state.car.targetX = W / 2;
    state.car.y = H - CFG.car.bottomOffset;
    scoreEl.textContent = String(CFG.start.score);
    timeEl.textContent = '0.0';
    overlay.classList.add('hidden');
    if (!wasRunning) requestAnimationFrame(loop); // a restart reuses the running loop
  }

  function endGame(win) {
    state.running = false;

    if (win) {
      const t = state.elapsed;
      const r = CFG.ranks.find(x => t < x.maxSeconds) || CFG.ranks[CFG.ranks.length - 1];
      const rank = r.rank, message = r.message;

      overlay.innerHTML = `
        <h1>${CFG.text.winTitle}</h1>
        <div class="rank">${rank}</div>
        <p>Time: <strong>${t.toFixed(1)}s</strong><br>${message}</p>
        <button id="startBtn">${CFG.text.winButton}</button>
      `;
    } else {
      overlay.innerHTML = `
        <h1>${CFG.text.crashTitle}</h1>
        <p>${CFG.text.crashBody.replace('{score}', state.score)}</p>
        <button id="startBtn">${CFG.text.crashButton}</button>
      `;
    }
    overlay.classList.remove('hidden');
    document.getElementById('startBtn').addEventListener('click', onStartClick);
  }

  // ----- Spawning -----
  function spawnObstacle() {
    const type = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
    const margin = CFG.obstacles.spawnMargin;
    const x = margin + Math.random() * (W - margin * 2 - type.w);
    state.obstacles.push({
      x, y: -type.h - CFG.obstacles.spawnAbove,
      w: type.w, h: type.h,
      emoji: type.emoji,
      points: type.points,
      hit: false,
    });
  }

  // ----- Update -----
  function update(dt) {
    if (!state.running) return;

    state.elapsed = (performance.now() - state.startTime) / 1000;
    timeEl.textContent = state.elapsed.toFixed(1);

    // difficulty ramps up slightly
    const D = CFG.difficulty;
    state.speed = CFG.start.speed + Math.min(state.elapsed * D.speedPerSecond, D.maxExtraSpeed);
    state.spawnInterval = Math.max(D.minSpawnInterval, CFG.start.spawnInterval - state.elapsed * D.spawnDecayPerSecond);

    // road stripes
    state.roadOffset = (state.roadOffset + state.speed) % CFG.road.stripePeriod;

    // car movement — smooth follow
    const moveSpeed = CFG.car.moveSpeed;
    if (state.keys.left)  state.car.targetX -= moveSpeed;
    if (state.keys.right) state.car.targetX += moveSpeed;
    state.car.targetX = Math.max(state.car.w / 2 + CFG.car.edgeMargin,
                          Math.min(W - state.car.w / 2 - CFG.car.edgeMargin, state.car.targetX));
    state.car.x += (state.car.targetX - state.car.x) * CFG.car.follow;

    // spawn
    state.spawnTimer++;
    if (state.spawnTimer >= state.spawnInterval) {
      state.spawnTimer = 0;
      // avoid spawning too many at once
      if (Math.random() < CFG.difficulty.spawnChance) spawnObstacle();
    }

    // move obstacles
    for (let i = state.obstacles.length - 1; i >= 0; i--) {
      const o = state.obstacles[i];
      o.y += state.speed;

      // collision (AABB, slightly forgiving)
      const pad = CFG.obstacles.hitPad;
      const carL = state.car.x - state.car.w / 2 + pad;
      const carR = state.car.x + state.car.w / 2 - pad;
      const carT = state.car.y - state.car.h / 2 + pad;
      const carB = state.car.y + state.car.h / 2 - pad;
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
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, CFG.colors.sandTop);
    grad.addColorStop(1, CFG.colors.sandBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // road (center strip)
    const roadW = Math.min(W * CFG.road.widthFraction, CFG.road.maxWidth);
    const roadX = (W - roadW) / 2;
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
    ctx.font = '36px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const o of state.obstacles) {
      ctx.font = `${Math.round(o.h)}px serif`;
      ctx.fillText(o.emoji, o.x + o.w / 2, o.y + o.h / 2);
    }

    // car (simple top-down shape with emoji)
    const cx = state.car.x;
    const cy = state.car.y;
    ctx.save();
    ctx.translate(cx, cy);
    // shadow
    ctx.fillStyle = CFG.colors.carShadow;
    ctx.beginPath();
    ctx.ellipse(0, 6, state.car.w / 2, state.car.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // body
    ctx.fillStyle = CFG.colors.carBody;
    roundRect(-state.car.w / 2, -state.car.h / 2, state.car.w, state.car.h, CFG.car.cornerRadius);
    ctx.fill();
    // windshield
    ctx.fillStyle = CFG.colors.windshield;
    const C = CFG.car;
    roundRect(-state.car.w / 2 + C.windshieldInset, -state.car.h / 2 + C.windshieldTop,
              state.car.w - C.windshieldInset * 2, C.windshieldHeight, 4);
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

  // ----- Loop -----
  function loop(now) {
    if (!state.running) {
      draw();
      return;
    }
    if (state.paused) {
      state.lastTime = now;
      draw();
      drawPaused();
      requestAnimationFrame(loop);
      return;
    }
    const dt = Math.min((now - state.lastTime) / 1000, 0.05);
    state.lastTime = now;

    update(dt);
    if (state.running) {
      draw();
      requestAnimationFrame(loop);
    }
  }

  // idle draw (before first start)
  function idleLoop() {
    if (!state.running) {
      // gentle preview
      state.roadOffset = (state.roadOffset + CFG.road.idleScroll) % CFG.road.stripePeriod;
      if (state.car.x === 0 && W > 0) {
        state.car.x = W / 2;
        state.car.y = H - CFG.car.bottomOffset;
      }
      draw();
      requestAnimationFrame(idleLoop);
    }
  }

  startBtn.addEventListener('click', onStartClick);
  idleLoop();

  // expose for Controller integration
  window.DesertDrive = { start: startGame, setInput: window.setDriveInput };
})();
