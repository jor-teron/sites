/**
 * Car Run — pseudo-3D endless lane runner (Temple Run–like driving).
 * Game logic. Every tunable value comes from CAR_RUN_CONFIG (car-run_config.js).
 */
(function () {
  'use strict';

  const CFG = CAR_RUN_CONFIG;
  const T = CFG.track;
  const C = CFG.colors;
  const S = CFG.sizes;
  const K = CFG.keys;
  const TX = CFG.text;

  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const coinsEl = document.getElementById('coins');
  const speedEl = document.getElementById('speed');
  const bestEl = document.getElementById('best');
  const nitroBar = document.getElementById('nitro');
  const overlay = document.getElementById('overlay');
  const titleEl = document.getElementById('title');
  const msgEl = document.getElementById('msg');
  const subEl = document.getElementById('sub');
  document.getElementById('help').textContent = TX.help;

  const BEST_KEY = CFG.bestKey;
  const LANES = T.lanes;
  const DRAW_DIST = T.drawDist;
  const ROAD_W = T.roadHalfWidth;
  const JUMP_DUR = CFG.jump.duration;
  const JUMP_CD = CFG.jump.cooldown;
  const NITRO_DRAIN = CFG.nitro.drain;
  const NITRO_REFILL = CFG.nitro.refill;

  let dpr = 1, W = 0, H = 0, U = 0; // U = uniform projection scale = min(W, H * aspect)
  // Live camera height and vanishing-point Y fraction, derived in resize() from
  // T.roadScreenFrac / T.playerScreenFrac so every screen shape gets the same layout.
  let CAMY = 1.65, HF = 0.4;
  let state = 'title';
  let keys = Object.create(null);
  let last = 0;
  let clickStartAt = -Infinity; // time a tap/click started the game

  let player, cameraZ, speed, baseSpeed, distance, coins, nitro, best;
  let entities;
  let roadOffset = 0;
  let jumpT = 0, jumpCd = 0, nitroOn = false;
  let spawnZ = CFG.start.spawnZ;
  let laneAnim = 0;

  best = Number(localStorage.getItem(BEST_KEY) || 0) || 0;
  bestEl.textContent = 'BEST ' + Math.floor(best);

  // Match a key event against a binding list by KeyboardEvent.code OR .key.
  const isKey = (list, e) => list.indexOf(e.code) !== -1 || list.indexOf(e.key) !== -1;
  const held = (list) => list.some((c) => keys[c]);

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    U = Math.min(W, H * T.aspect);
    fitCamera();
  }

  /*
    Road takes T.roadScreenFrac of the screen: the visible horizon (farthest road
    segment) lands at (1 - roadScreenFrac) from the top. Camera height is picked so
    the player car's ground point sits near T.playerScreenFrac, within min/max.
  */
  function fitCamera() {
    const top = 1 - T.roadScreenFrac;
    const vy = U * T.projScaleY;               // px per (world unit / depth)
    const rearZ = T.playerAhead - S.playerLen / 2;   // rear bumper depth
    const need = (T.playerScreenFrac - top) * H / vy * rearZ;
    CAMY = Math.max(T.cameraHeightMin, Math.min(T.cameraHeightMax, need));
    // horizonY() projects z = DRAW_DIST + 1 ahead; offset the vanishing point so that lands at `top`.
    HF = top - (CAMY / (DRAW_DIST + 1)) * vy / H;
  }

  function showOverlay(title, msg, sub) {
    overlay.hidden = false;
    titleEl.textContent = title;
    msgEl.textContent = msg;
    subEl.textContent = sub || '';
  }
  function hideOverlay() { overlay.hidden = true; }

  function project(x, y, z) {
    const camY = CAMY;
    const relZ = z - cameraZ;
    if (relZ <= T.nearClip) return null;
    const scale = 1 / relZ;
    const px = W / 2 + x * scale * U * T.projScaleX;
    const py = H * HF - (y - camY) * scale * U * T.projScaleY;
    // k: pixels per world unit at this depth (same for both axes -> no stretching)
    return { x: px, y: py, s: scale, k: scale * U * T.projScaleX };
  }

  /** World-unit footprint of an entity (width along x, length along z). */
  function entityDims(e) {
    if (e.type === 'coin') return { w: S.coinRadius * 2, len: S.coinLen };
    if (e.type === 'barrier') return { w: S.barrierW, len: S.barrierLen };
    return { w: S.carW, len: S.carLen };
  }

  function laneX(lane) {
    return (lane - (LANES - 1) / 2) * T.laneSpacing;
  }

  function spawnAhead() {
    const SP = CFG.spawn;
    while (spawnZ < cameraZ + DRAW_DIST + SP.lookAhead) {
      const roll = Math.random();
      let rowLen = 0;
      if (roll < SP.obstacleChance) {
        const pal = C.trafficPalette || [C.car];
        entities.push({
          type: Math.random() < SP.carVsBarrier ? 'barrier' : 'car',
          lane: Math.floor(Math.random() * LANES),
          z: spawnZ,
          taken: false,
          color: pal[Math.floor(Math.random() * pal.length)],
        });
      } else if (roll < SP.coinChance) {
        const n = SP.coinRowMin + Math.floor(Math.random() * SP.coinRowExtra);
        const cl = Math.floor(Math.random() * LANES);
        for (let i = 0; i < n; i++) {
          entities.push({ type: 'coin', lane: cl, z: spawnZ + i * SP.coinSpacing, taken: false });
        }
        rowLen = (n - 1) * SP.coinSpacing;
      }
      // Time-based spacing: gap (seconds) * current speed, so faster != denser
      const t = Math.max(SP.gapTimeMin,
        SP.gapTimeBase + Math.random() * SP.gapTimeRandom - Math.min(SP.gapTimeShrinkMax, distance / SP.gapTimeShrinkPerDist));
      spawnZ += Math.max(SP.gapMinZ, rowLen + 1, t * Math.max(speed || 0, CFG.start.speed));
    }
  }

  function currentScore() {
    return Math.floor(distance + coins * CFG.coinScore);
  }

  function updateHud() {
    scoreEl.textContent = currentScore() + ' m';
    coinsEl.textContent = '● ' + coins;
    speedEl.textContent = Math.floor(speed * CFG.speed.kmhFactor) + ' km/h';
    nitroBar.style.transform = 'scaleX(' + Math.max(0, Math.min(1, nitro)) + ')';
  }

  function reset() {
    const st = CFG.start;
    player = { lane: st.lane, x: 0, y: 0 };
    laneAnim = st.lane;
    cameraZ = 0;
    speed = st.speed;
    baseSpeed = st.speed;
    distance = st.distance;
    coins = st.coins;
    nitro = st.nitro;
    entities = [];
    roadOffset = 0;
    jumpT = 0;
    jumpCd = 0;
    nitroOn = false;
    spawnZ = st.spawnZ;
    spawnAhead();
    updateHud();
  }

  function die() {
    state = 'over';
    gestureEnd();
    const sc = currentScore();
    if (sc > best) {
      best = sc;
      localStorage.setItem(BEST_KEY, String(best));
      bestEl.textContent = 'BEST ' + Math.floor(best);
    }
    showOverlay(TX.crash, 'Score ' + sc, 'Best ' + Math.floor(best) + ' — Start / Enter');
  }

  function startPlay() {
    if (state === 'title' || state === 'over') {
      reset();
      state = 'play';
      hideOverlay();
    } else if (state === 'pause') {
      state = 'play';
      hideOverlay();
    } else if (state === 'play') {
      state = 'pause';
      showOverlay(TX.paused, TX.pressStart, '');
    }
  }

  /** Start key: toggles pause, except right after a tap/click started the game. */
  function onStartKey() {
    if (state === 'play' && performance.now() - clickStartAt < CFG.input.clickStartGraceMs) {
      clickStartAt = -Infinity; // swallow once: the game is already running
      return;
    }
    startPlay();
  }

  /** Tap/click start (title / game over / resume from pause). */
  function clickStart() {
    const wasStarting = state === 'title' || state === 'over';
    startPlay();
    if (wasStarting && state === 'play') clickStartAt = performance.now();
  }

  function toTitle() {
    state = 'title';
    reset();
    showOverlay(TX.title, TX.pressStart, TX.titleSub);
  }

  function onKey(e, down) {
    if (e.code) keys[e.code] = down;
    if (e.key) keys[e.key] = down;
    if (down) {
      if (isKey(K.left, e)) {
        player.lane = Math.max(0, player.lane - 1);
        e.preventDefault();
      } else if (isKey(K.right, e)) {
        player.lane = Math.min(LANES - 1, player.lane + 1);
        e.preventDefault();
      } else if (isKey(K.nitro, e)) {
        nitroOn = true;
        e.preventDefault();
      } else if (isKey(K.jump, e)) {
        tryJump();
        e.preventDefault();
      } else if (isKey(K.start, e)) {
        if (!e.repeat) onStartKey();
        e.preventDefault();
      } else if (isKey(K.restart, e)) {
        if (!e.repeat) toTitle();
        e.preventDefault();
      } else if (isKey(K.accel, e) || isKey(K.brake, e)) {
        e.preventDefault();
      }
    } else {
      if (isKey(K.nitro, e)) nitroOn = false;
    }
  }

  /** Focus lost: the keyup would never arrive, so drop held keys. */
  function clearKeys() {
    keys = Object.create(null);
    nitroOn = false;
    if (typeof gestureEnd === 'function' && touch.id !== null) gestureEnd();
  }

  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));
  window.addEventListener('blur', clearKeys);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearKeys(); });
  overlay.addEventListener('click', () => {
    if (state === 'title' || state === 'over' || state === 'pause') clickStart();
  });
  canvas.addEventListener('click', () => {
    if (state === 'title' || state === 'over') clickStart();
  });

  // ---------- Touch / mouse gestures (pointer events, no on-screen buttons) ----------
  // swipe left/right = lane, swipe up = jump, swipe down = brake (while finger stays down),
  // press-and-hold without moving = nitro (while held). Tap on the title / crash screen starts.
  const touch = { id: null, x0: 0, y0: 0, t0: 0, swiped: false, brake: false, nitro: false, holdTimer: 0 };

  function gestureEnd() {
    clearTimeout(touch.holdTimer);
    if (touch.nitro) nitroOn = false;
    touch.id = null; touch.brake = false; touch.nitro = false;
  }

  window.addEventListener('pointerdown', (e) => {
    if (state !== 'play' || touch.id !== null) return;
    touch.id = e.pointerId; touch.x0 = e.clientX; touch.y0 = e.clientY; touch.t0 = performance.now();
    touch.swiped = false;
    touch.holdTimer = setTimeout(() => {
      if (touch.id !== null && !touch.swiped && state === 'play') { touch.nitro = true; nitroOn = true; }
    }, CFG.input.holdMs);
  });
  window.addEventListener('pointermove', (e) => {
    if (e.pointerId !== touch.id || touch.swiped || state !== 'play') return;
    const dx = e.clientX - touch.x0, dy = e.clientY - touch.y0;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < CFG.input.swipeMin) return;
    if (touch.nitro) return;             // already holding nitro: ignore drift
    touch.swiped = true;
    clearTimeout(touch.holdTimer);
    if (Math.abs(dx) > Math.abs(dy)) {
      player.lane = dx < 0 ? Math.max(0, player.lane - 1) : Math.min(LANES - 1, player.lane + 1);
    } else if (dy < 0) {
      tryJump();
    } else {
      touch.brake = true;
    }
  });
  window.addEventListener('pointerup', (e) => { if (e.pointerId === touch.id) gestureEnd(); });
  window.addEventListener('pointercancel', (e) => { if (e.pointerId === touch.id) gestureEnd(); });
  // No page scrolling / pull-to-refresh while playing (touch-action: none in CSS as well)
  window.addEventListener('touchmove', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });

  function tryJump() {
    if (jumpCd <= 0 && jumpT <= 0) {
      jumpT = JUMP_DUR;
      jumpCd = JUMP_CD;
    }
  }

  function update(dt) {
    const SPD = CFG.speed;
    if (held(K.accel) && !touch.brake) baseSpeed = Math.min(SPD.max, baseSpeed + SPD.accel * dt);
    else if (held(K.brake) || touch.brake) baseSpeed = Math.max(SPD.min, baseSpeed - SPD.brake * dt);
    else baseSpeed = Math.min(SPD.max, baseSpeed + SPD.cruiseAccel * dt);

    let spd = baseSpeed + Math.min(SPD.distanceBonusMax, distance * SPD.distanceBonusRate);
    if (nitroOn && nitro > 0) {
      spd *= CFG.nitro.multiplier;
      nitro = Math.max(0, nitro - NITRO_DRAIN * dt);
      if (nitro <= 0) nitroOn = false;
    } else {
      nitro = Math.min(1, nitro + NITRO_REFILL * dt);
    }
    speed = spd;

    cameraZ += speed * dt;
    distance += speed * dt;
    roadOffset += speed * dt;

    laneAnim += (player.lane - laneAnim) * Math.min(1, CFG.laneAnimRate * dt);
    player.x = laneX(laneAnim);

    if (jumpT > 0) {
      jumpT -= dt;
      const t = 1 - jumpT / JUMP_DUR;
      player.y = Math.sin(t * Math.PI) * CFG.jump.height;
      if (jumpT <= 0) player.y = 0;
    } else {
      player.y = 0;
    }
    if (jumpCd > 0) jumpCd -= dt;

    spawnAhead();

    // Swept collision: the player's box covered [prevPz - len/2, pz + len/2] this frame,
    // so nothing is skipped even when one frame moves several units (nitro / slow frames).
    const pz = cameraZ + T.playerAhead;
    const prevPz = pz - speed * dt;
    const halfP = S.playerLen / 2;
    for (const e of entities) {
      if (e.taken) continue;
      const dim = entityDims(e);
      const zHit = e.z - dim.len / 2 <= pz + halfP && e.z + dim.len / 2 >= prevPz - halfP;
      // x overlap against the car's VISUAL position (mid lane change counts)
      const xHit = Math.abs(laneX(e.lane) - player.x) < (S.playerW + dim.w) / 2 * CFG.hitWidthFactor;
      if (zHit && xHit) {
        if (e.type === 'coin') {
          e.taken = true;
          coins++;
        } else if (player.y < CFG.jump.clearHeight) {
          return die();
        }
      }
    }
    entities = entities.filter((e) => e.z > cameraZ - 2 && !e.taken);
    updateHud();
  }

  /** Screen Y of the farthest road segment (where sky meets the road). */
  function horizonY() {
    const p = project(0, 0, cameraZ + DRAW_DIST + 1);
    return p ? Math.ceil(p.y) : H * HF;
  }

  function drawSky(hy) {
    const g = ctx.createLinearGradient(0, 0, 0, hy);
    g.addColorStop(0, C.skyTop);
    g.addColorStop(0.5, C.skyMid);
    g.addColorStop(1, C.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, hy);
    const sx = W * C.sunX, sy = H * C.sunY;
    const sg = ctx.createRadialGradient(sx, sy, 10, sx, sy, C.sunRadius);
    sg.addColorStop(0, C.sunGlow);
    sg.addColorStop(1, C.sunGlowOuter);
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, hy);
  }

  function drawRoad(hy) {
    // Ground starts exactly where the sky ends (no empty band).
    ctx.fillStyle = C.ground;
    ctx.fillRect(0, hy, W, H - hy);

    for (let i = DRAW_DIST; i >= 0; i--) {
      // nearest segment starts at the near clip so the road reaches the screen bottom (portrait too)
      const z0 = i === 0 ? cameraZ + T.nearClip + 0.001 : cameraZ + i;
      const z1 = cameraZ + i + 1;
      const p0L = project(-ROAD_W, 0, z0);
      const p0R = project(ROAD_W, 0, z0);
      const p1L = project(-ROAD_W, 0, z1);
      const p1R = project(ROAD_W, 0, z1);
      if (!p0L || !p0R || !p1L || !p1R) continue;

      const stripe = Math.floor(z0) % 2 === 0;
      ctx.fillStyle = stripe ? C.grassA : C.grassB;
      ctx.beginPath();
      ctx.moveTo(0, p0L.y);
      ctx.lineTo(p0L.x, p0L.y);
      ctx.lineTo(p1L.x, p1L.y);
      ctx.lineTo(0, p1L.y);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(W, p0R.y);
      ctx.lineTo(p0R.x, p0R.y);
      ctx.lineTo(p1R.x, p1R.y);
      ctx.lineTo(W, p1R.y);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = stripe ? C.roadA : C.roadB;
      ctx.beginPath();
      ctx.moveTo(p0L.x, p0L.y);
      ctx.lineTo(p0R.x, p0R.y);
      ctx.lineTo(p1R.x, p1R.y);
      ctx.lineTo(p1L.x, p1L.y);
      ctx.closePath();
      ctx.fill();

      if (Math.floor(z0) % S.laneMarkEvery === 0) {
        for (const lx of S.laneMarkX) {
          const a = project(lx, 0.01, z0);
          const b = project(lx, 0.01, z0 + S.laneMarkLength);
          if (!a || !b) continue;
          ctx.strokeStyle = C.laneMark;
          ctx.lineWidth = Math.max(1, a.k * S.laneMarkWidth);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
  }

  const A = window.CAR_RUN_ASSETS;

  /** Scene info for the box models in assets/car_model.js. */
  function scene() {
    return { project, cam: { x: 0, y: CAMY, z: cameraZ }, nearZ: cameraZ + T.nearClip + 0.001 };
  }

  function drawEntity(e, sc) {
    const x = laneX(e.lane);
    const y = e.type === 'coin' ? S.coinHeight : 0;
    const p = project(x, y, e.z);
    if (!p) return;
    const world = { x, y: 0, z: e.z };
    if (e.type === 'coin') {
      A.coin.draw(ctx, p, { C, S });
    } else if (e.type === 'barrier') {
      A.barrier.draw(ctx, p, { C, S, w: p.k * S.barrierW, h: p.k * S.barrierH, scene: sc, world });
    } else {
      A.trafficCar.draw(ctx, p, { C, S, w: p.k * S.carW, h: p.k * S.carH, scene: sc, world, color: e.color });
    }
  }

  function drawPlayer(sc) {
    const pz = cameraZ + T.playerAhead;
    const p = project(player.x, player.y, pz);
    if (!p) return;
    const w = p.k * S.playerW;
    const h = p.k * S.playerH;
    // Lane change: nose turns toward the target lane, body leans the other way.
    const yaw = Math.max(-0.3, Math.min(0.3, (player.lane - laneAnim) * 0.35));
    A.car.draw(ctx, p, {
      C, S, w, h,
      scene: sc,
      world: { x: player.x, y: player.y, z: pz },
      yaw, roll: -yaw * 0.15,
      nitro: nitroOn && nitro > 0,
      braking: state === 'play' && (held(K.brake) || touch.brake),
    });
  }

  function draw() {
    const hy = horizonY();
    drawSky(hy);
    drawRoad(hy);
    const sc = scene();
    const sorted = entities.slice().sort((a, b) => b.z - a.z);
    // Far to near; the player car is drawn in depth order so cars it has
    // already passed (nearer the camera) cover it correctly.
    const pz = cameraZ + T.playerAhead;
    let playerDrawn = !player;
    for (const e of sorted) {
      if (!playerDrawn && e.z < pz) { drawPlayer(sc); playerDrawn = true; }
      drawEntity(e, sc);
    }
    if (!playerDrawn) drawPlayer(sc);
  }

  function loop(ts) {
    if (!last) last = ts;
    const dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    if (state === 'play') update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resize);
  resize();
  reset();
  showOverlay(TX.title, TX.pressStart, TX.titleSub);
  requestAnimationFrame(loop);
})();
