/**
 * Car Run — pseudo-3D endless lane runner (Temple Run–like driving).
 */
(function () {
  'use strict';

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

  const BEST_KEY = 'car-run-best';
  const LANES = 3;
  const DRAW_DIST = 80;
  const ROAD_W = 1.0;
  const JUMP_DUR = 0.55;
  const JUMP_CD = 1.1;
  const NITRO_DRAIN = 0.35;
  const NITRO_REFILL = 0.08;

  let dpr = 1, W = 0, H = 0;
  let state = 'title';
  let keys = Object.create(null);
  let last = 0;

  let player, cameraZ, speed, baseSpeed, distance, coins, nitro, best;
  let entities;
  let roadOffset = 0;
  let jumpT = 0, jumpCd = 0, nitroOn = false;
  let spawnZ = 40;
  let laneAnim = 0;

  best = Number(localStorage.getItem(BEST_KEY) || 0) || 0;
  bestEl.textContent = 'BEST ' + Math.floor(best);

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
    const camY = 1.15;
    const relZ = z - cameraZ;
    if (relZ <= 0.15) return null;
    const scale = 1 / relZ;
    const px = W / 2 + x * scale * W * 0.55;
    const py = H * 0.55 - (y - camY) * scale * H * 0.7;
    return { x: px, y: py, s: scale };
  }

  function laneX(lane) {
    return (lane - 1) * 0.72;
  }

  function spawnAhead() {
    while (spawnZ < cameraZ + DRAW_DIST + 20) {
      const roll = Math.random();
      if (roll < 0.45) {
        entities.push({
          type: Math.random() < 0.5 ? 'barrier' : 'car',
          lane: Math.floor(Math.random() * LANES),
          z: spawnZ,
          taken: false,
        });
      } else if (roll < 0.85) {
        const n = 3 + Math.floor(Math.random() * 3);
        const cl = Math.floor(Math.random() * LANES);
        for (let i = 0; i < n; i++) {
          entities.push({ type: 'coin', lane: cl, z: spawnZ + i * 1.4, taken: false });
        }
      }
      spawnZ += 10 + Math.random() * 12 - Math.min(4, distance / 800);
    }
  }

  function updateHud() {
    const sc = Math.floor(distance + coins * 25);
    scoreEl.textContent = sc + ' m';
    coinsEl.textContent = '● ' + coins;
    speedEl.textContent = Math.floor(speed * 3.2) + ' km/h';
    nitroBar.style.transform = 'scaleX(' + Math.max(0, Math.min(1, nitro)) + ')';
  }

  function reset() {
    player = { lane: 1, x: 0, y: 0 };
    laneAnim = 1;
    cameraZ = 0;
    speed = 28;
    baseSpeed = 28;
    distance = 0;
    coins = 0;
    nitro = 1;
    entities = [];
    roadOffset = 0;
    jumpT = 0;
    jumpCd = 0;
    nitroOn = false;
    spawnZ = 55;
    spawnAhead();
    updateHud();
  }

  function die() {
    state = 'over';
    const sc = Math.floor(distance + coins * 25);
    if (sc > best) {
      best = sc;
      localStorage.setItem(BEST_KEY, String(best));
      bestEl.textContent = 'BEST ' + Math.floor(best);
    }
    showOverlay('CRASH!', 'Score ' + sc, 'Best ' + Math.floor(best) + ' — Start / Enter');
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
      showOverlay('PAUSED', 'Press Start / Enter', '');
    }
  }

  function toTitle() {
    state = 'title';
    reset();
    showOverlay('CAR RUN', 'Press Start / Enter', 'or tap / click');
  }

  function onKey(e, down) {
    const code = e.code;
    keys[code] = down;
    if (down) {
      if (code === 'ArrowLeft' || code === 'KeyA') {
        player.lane = Math.max(0, player.lane - 1);
        e.preventDefault();
      } else if (code === 'ArrowRight' || code === 'KeyD') {
        player.lane = Math.min(LANES - 1, player.lane + 1);
        e.preventDefault();
      } else if (code === 'Space') {
        nitroOn = true;
        e.preventDefault();
      } else if (code === 'KeyX') {
        if (jumpCd <= 0 && jumpT <= 0) {
          jumpT = JUMP_DUR;
          jumpCd = JUMP_CD;
        }
        e.preventDefault();
      } else if (code === 'Enter') {
        startPlay();
        e.preventDefault();
      } else if (code === 'Escape') {
        toTitle();
        e.preventDefault();
      } else if (code === 'ArrowUp' || code === 'ArrowDown') {
        e.preventDefault();
      }
    } else {
      if (code === 'Space') nitroOn = false;
    }
  }

  document.addEventListener('keydown', (e) => onKey(e, true));
  document.addEventListener('keyup', (e) => onKey(e, false));
  overlay.addEventListener('click', () => {
    if (state === 'title' || state === 'over' || state === 'pause') startPlay();
  });
  canvas.addEventListener('click', () => {
    if (state === 'title' || state === 'over') startPlay();
  });

  function update(dt) {
    if (keys.ArrowUp || keys.KeyW) baseSpeed = Math.min(55, baseSpeed + 18 * dt);
    else if (keys.ArrowDown || keys.KeyS) baseSpeed = Math.max(14, baseSpeed - 28 * dt);
    else baseSpeed = Math.min(55, baseSpeed + 2 * dt);

    let spd = baseSpeed + Math.min(18, distance * 0.004);
    if (nitroOn && nitro > 0) {
      spd *= 1.55;
      nitro = Math.max(0, nitro - NITRO_DRAIN * dt);
      if (nitro <= 0) nitroOn = false;
    } else {
      nitro = Math.min(1, nitro + NITRO_REFILL * dt);
    }
    speed = spd;

    cameraZ += speed * dt;
    distance += speed * dt;
    roadOffset += speed * dt;

    laneAnim += (player.lane - laneAnim) * Math.min(1, 12 * dt);
    player.x = laneX(laneAnim);

    if (jumpT > 0) {
      jumpT -= dt;
      const t = 1 - jumpT / JUMP_DUR;
      player.y = Math.sin(t * Math.PI) * 0.85;
      if (jumpT <= 0) player.y = 0;
    } else {
      player.y = 0;
    }
    if (jumpCd > 0) jumpCd -= dt;

    spawnAhead();

    const pz = cameraZ + 3.2;
    for (const e of entities) {
      if (e.taken) continue;
      if (Math.abs(e.z - pz) < 1.1 && e.lane === player.lane) {
        if (e.type === 'coin') {
          e.taken = true;
          coins++;
        } else if (player.y < 0.35) {
          return die();
        }
      }
    }
    entities = entities.filter((e) => e.z > cameraZ - 2 && !e.taken);
    updateHud();
  }

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.55);
    g.addColorStop(0, '#0f172a');
    g.addColorStop(0.5, '#1e293b');
    g.addColorStop(1, '#334155');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H * 0.55);
    const sg = ctx.createRadialGradient(W * 0.7, H * 0.22, 10, W * 0.7, H * 0.22, 120);
    sg.addColorStop(0, 'rgba(251,191,36,0.35)');
    sg.addColorStop(1, 'rgba(251,191,36,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, H * 0.55);
  }

  function drawRoad() {
    const horizon = H * 0.42;
    ctx.fillStyle = '#0a0c12';
    ctx.fillRect(0, horizon, W, H - horizon);

    for (let i = DRAW_DIST; i >= 0; i--) {
      const z0 = cameraZ + i;
      const z1 = cameraZ + i + 1;
      const p0L = project(-ROAD_W, 0, z0);
      const p0R = project(ROAD_W, 0, z0);
      const p1L = project(-ROAD_W, 0, z1);
      const p1R = project(ROAD_W, 0, z1);
      if (!p0L || !p0R || !p1L || !p1R) continue;

      const stripe = Math.floor(z0) % 2 === 0;
      ctx.fillStyle = stripe ? '#14532d' : '#166534';
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

      ctx.fillStyle = stripe ? '#1f2937' : '#111827';
      ctx.beginPath();
      ctx.moveTo(p0L.x, p0L.y);
      ctx.lineTo(p0R.x, p0R.y);
      ctx.lineTo(p1R.x, p1R.y);
      ctx.lineTo(p1L.x, p1L.y);
      ctx.closePath();
      ctx.fill();

      if (Math.floor(z0) % 3 === 0) {
        for (const lx of [-0.36, 0.36]) {
          const a = project(lx, 0.01, z0);
          const b = project(lx, 0.01, z0 + 1.2);
          if (!a || !b) continue;
          ctx.strokeStyle = 'rgba(251,191,36,0.55)';
          ctx.lineWidth = Math.max(1, a.s * 6);
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
    const y = e.type === 'coin' ? 0.35 : 0;
    const p = project(x, y, e.z);
    if (!p) return;
    if (e.type === 'coin') {
      const r = Math.max(3, p.s * 28);
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(p.x, p.y - r, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(p.x, p.y - r, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.type === 'barrier') {
      const w = p.s * 70;
      const h = p.s * 50;
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(p.x - w / 2, p.y - h, w, h);
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(p.x - w / 2, p.y - h * 0.55, w, h * 0.18);
    } else {
      const w = p.s * 80;
      const h = p.s * 55;
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(p.x - w / 2, p.y - h, w, h * 0.7);
      ctx.fillStyle = '#93c5fd';
      ctx.fillRect(p.x - w * 0.35, p.y - h * 0.85, w * 0.7, h * 0.25);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(p.x - w * 0.4, p.y - h * 0.15, w * 0.25, h * 0.15);
      ctx.fillRect(p.x + w * 0.15, p.y - h * 0.15, w * 0.25, h * 0.15);
    }
  }

  function drawPlayer() {
    const pz = cameraZ + 3.2;
    const p = project(player.x, player.y, pz);
    if (!p) return;
    const w = p.s * 90;
    const h = p.s * 70;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    const sh = project(player.x, 0, pz);
    if (sh) {
      ctx.beginPath();
      ctx.ellipse(sh.x, sh.y, w * 0.45, Math.max(3, p.s * 10), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const body = nitroOn && nitro > 0 ? '#f97316' : '#ef4444';
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - h);
    ctx.lineTo(p.x + w / 2, p.y - h * 0.35);
    ctx.lineTo(p.x + w * 0.42, p.y);
    ctx.lineTo(p.x - w * 0.42, p.y);
    ctx.lineTo(p.x - w / 2, p.y - h * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(147,197,253,0.85)';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - h * 0.88);
    ctx.lineTo(p.x + w * 0.28, p.y - h * 0.5);
    ctx.lineTo(p.x - w * 0.28, p.y - h * 0.5);
    ctx.closePath();
    ctx.fill();
    if (nitroOn && nitro > 0) {
      ctx.fillStyle = 'rgba(96,165,250,0.8)';
      ctx.beginPath();
      ctx.moveTo(p.x - w * 0.15, p.y);
      ctx.lineTo(p.x, p.y + h * 0.45 + Math.random() * 8);
      ctx.lineTo(p.x + w * 0.15, p.y);
      ctx.fill();
    }
  }

  function draw() {
    drawSky();
    drawRoad();
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
  showOverlay('CAR RUN', 'Press Start / Enter', 'or tap / click');
  requestAnimationFrame(loop);
})();
