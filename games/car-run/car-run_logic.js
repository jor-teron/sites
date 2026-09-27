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

  let dpr = 1, W = 0, H = 0;
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
  }

  function showOverlay(title, msg, sub) {
    overlay.hidden = false;
    titleEl.textContent = title;
    msgEl.textContent = msg;
    subEl.textContent = sub || '';
  }
  function hideOverlay() { overlay.hidden = true; }

  function project(x, y, z) {
    const camY = T.cameraHeight;
    const relZ = z - cameraZ;
    if (relZ <= T.nearClip) return null;
    const scale = 1 / relZ;
    const px = W / 2 + x * scale * W * T.projScaleX;
    const py = H * T.horizonFrac - (y - camY) * scale * H * T.projScaleY;
    return { x: px, y: py, s: scale };
  }

  function laneX(lane) {
    return (lane - (LANES - 1) / 2) * T.laneSpacing;
  }

  function spawnAhead() {
    const SP = CFG.spawn;
    while (spawnZ < cameraZ + DRAW_DIST + SP.lookAhead) {
      const roll = Math.random();
      if (roll < SP.obstacleChance) {
        entities.push({
          type: Math.random() < SP.carVsBarrier ? 'barrier' : 'car',
          lane: Math.floor(Math.random() * LANES),
          z: spawnZ,
          taken: false,
        });
      } else if (roll < SP.coinChance) {
        const n = SP.coinRowMin + Math.floor(Math.random() * SP.coinRowExtra);
        const cl = Math.floor(Math.random() * LANES);
        for (let i = 0; i < n; i++) {
          entities.push({ type: 'coin', lane: cl, z: spawnZ + i * SP.coinSpacing, taken: false });
        }
      }
      spawnZ += SP.gapBase + Math.random() * SP.gapRandom - Math.min(SP.gapShrinkMax, distance / SP.gapShrinkPerDist);
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
        if (jumpCd <= 0 && jumpT <= 0) {
          jumpT = JUMP_DUR;
          jumpCd = JUMP_CD;
        }
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

  function update(dt) {
    const SPD = CFG.speed;
    if (held(K.accel)) baseSpeed = Math.min(SPD.max, baseSpeed + SPD.accel * dt);
    else if (held(K.brake)) baseSpeed = Math.max(SPD.min, baseSpeed - SPD.brake * dt);
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

    const pz = cameraZ + T.playerAhead;
    for (const e of entities) {
      if (e.taken) continue;
      if (Math.abs(e.z - pz) < CFG.hitDepth && e.lane === player.lane) {
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
    return p ? Math.ceil(p.y) : H * T.horizonFrac;
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
      const z0 = cameraZ + i;
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
          ctx.lineWidth = Math.max(1, a.s * S.laneMarkWidth);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
  }

  function drawEntity(e) {
    const x = laneX(e.lane);
    const y = e.type === 'coin' ? S.coinHeight : 0;
    const p = project(x, y, e.z);
    if (!p) return;
    if (e.type === 'coin') {
      const r = Math.max(S.coinMinRadius, p.s * S.coinRadius);
      ctx.fillStyle = C.coin;
      ctx.beginPath();
      ctx.arc(p.x, p.y - r, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.coinInner;
      ctx.beginPath();
      ctx.arc(p.x, p.y - r, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.type === 'barrier') {
      const w = p.s * S.barrierW;
      const h = p.s * S.barrierH;
      ctx.fillStyle = C.barrier;
      ctx.fillRect(p.x - w / 2, p.y - h, w, h);
      ctx.fillStyle = C.barrierStripe;
      ctx.fillRect(p.x - w / 2, p.y - h * 0.55, w, h * 0.18);
    } else {
      const w = p.s * S.carW;
      const h = p.s * S.carH;
      ctx.fillStyle = C.car;
      ctx.fillRect(p.x - w / 2, p.y - h, w, h * 0.7);
      ctx.fillStyle = C.carGlass;
      ctx.fillRect(p.x - w * 0.35, p.y - h * 0.85, w * 0.7, h * 0.25);
      ctx.fillStyle = C.carWheel;
      ctx.fillRect(p.x - w * 0.4, p.y - h * 0.15, w * 0.25, h * 0.15);
      ctx.fillRect(p.x + w * 0.15, p.y - h * 0.15, w * 0.25, h * 0.15);
    }
  }

  function drawPlayer() {
    const pz = cameraZ + T.playerAhead;
    const p = project(player.x, player.y, pz);
    if (!p) return;
    const w = p.s * S.playerW * S.playerScale;
    const h = p.s * S.playerH * S.playerScale;
    ctx.fillStyle = C.playerShadow;
    const sh = project(player.x, 0, pz);
    if (sh) {
      ctx.beginPath();
      ctx.ellipse(sh.x, sh.y, w * 0.45, Math.max(3, p.s * 10 * S.playerScale), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const body = nitroOn && nitro > 0 ? C.playerNitro : C.player;
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - h);
    ctx.lineTo(p.x + w / 2, p.y - h * 0.35);
    ctx.lineTo(p.x + w * 0.42, p.y);
    ctx.lineTo(p.x - w * 0.42, p.y);
    ctx.lineTo(p.x - w / 2, p.y - h * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = C.playerOutline;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = C.playerGlass;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - h * 0.88);
    ctx.lineTo(p.x + w * 0.28, p.y - h * 0.5);
    ctx.lineTo(p.x - w * 0.28, p.y - h * 0.5);
    ctx.closePath();
    ctx.fill();
    if (nitroOn && nitro > 0) {
      ctx.fillStyle = C.nitroFlame;
      ctx.beginPath();
      ctx.moveTo(p.x - w * 0.15, p.y);
      ctx.lineTo(p.x, p.y + h * 0.45 + Math.random() * 8);
      ctx.lineTo(p.x + w * 0.15, p.y);
      ctx.fill();
    }
  }

  function draw() {
    const hy = horizonY();
    drawSky(hy);
    drawRoad(hy);
    const sorted = entities.slice().sort((a, b) => b.z - a.z);
    for (const e of sorted) drawEntity(e);
    if (player) drawPlayer();
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
