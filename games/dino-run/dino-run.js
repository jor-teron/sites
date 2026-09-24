/**
 * Dino Run — Chrome offline dino–style endless runner.
 */
(function () {
  'use strict';

  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const overlay = document.getElementById('overlay');
  const titleEl = document.getElementById('title');
  const msgEl = document.getElementById('msg');
  const subEl = document.getElementById('sub');

  const BEST_KEY = 'dino-run-best';
  const GRAVITY = 2200;
  const JUMP_V = -780;
  const JUMP_HOLD = -120; // extra upward while holding
  const DUCK_FASTFALL = 1800;
  const GROUND_Y_FRAC = 0.72;
  const DINO_W = 44;
  const DINO_H = 48;
  const DINO_DUCK_H = 28;
  const SHIELD_DUR = 0.7;
  const SHIELD_CD = 3.2;

  let dpr = 1, W = 0, H = 0, groundY = 0;
  let state = 'title';
  let score = 0, best = 0, speed = 320, dist = 0;
  let dino, obstacles, clouds, particles;
  let keys = Object.create(null);
  let shieldT = 0, shieldCd = 0, jumpHeld = false;
  let last = 0, spawnAcc = 0;
  let blink = 0;

  best = Number(localStorage.getItem(BEST_KEY) || 0) || 0;
  bestEl.textContent = 'HI ' + pad(best);

  function pad(n) {
    return String(Math.floor(n)).padStart(5, '0');
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    groundY = H * GROUND_Y_FRAC;
  }

  function showOverlay(title, msg, sub) {
    overlay.hidden = false;
    titleEl.textContent = title;
    msgEl.textContent = msg;
    subEl.textContent = sub || '';
  }
  function hideOverlay() { overlay.hidden = true; }

  function reset() {
    dino = {
      x: W * 0.18,
      y: groundY - DINO_H,
      vy: 0,
      w: DINO_W,
      h: DINO_H,
      onGround: true,
      ducking: false,
      frame: 0,
    };
    obstacles = [];
    clouds = [];
    particles = [];
    for (let i = 0; i < 4; i++) {
      clouds.push({
        x: Math.random() * W,
        y: 40 + Math.random() * (groundY * 0.35),
        s: 0.4 + Math.random() * 0.6,
      });
    }
    score = 0;
    dist = 0;
    speed = 320;
    spawnAcc = 0.8;
    shieldT = 0;
    shieldCd = 0;
    jumpHeld = false;
    scoreEl.textContent = pad(0);
  }

  function spawnObstacle() {
    const r = Math.random();
    if (r < 0.62) {
      // cactus cluster
      const n = 1 + (Math.random() < 0.4 ? 1 : 0) + (Math.random() < 0.15 ? 1 : 0);
      let x = W + 20;
      for (let i = 0; i < n; i++) {
        const h = 34 + Math.floor(Math.random() * 28);
        const w = 14 + Math.floor(Math.random() * 8);
        obstacles.push({ type: 'cactus', x: x, y: groundY - h, w: w, h: h });
        x += w + 4;
      }
    } else {
      // bird
      const lane = Math.random();
      let y;
      if (lane < 0.33) y = groundY - DINO_H - 8; // high — duck under? actually jump over or duck under low
      else if (lane < 0.66) y = groundY - DINO_H * 0.55;
      else y = groundY - 28; // low — must jump
      obstacles.push({
        type: 'bird',
        x: W + 20,
        y: y,
        w: 42,
        h: 28,
        flap: 0,
      });
    }
  }

  function hitTest() {
    if (shieldT > 0) return false;
    const pad = 6;
    const dx = dino.x + pad;
    const dy = dino.y + pad;
    const dw = dino.w - pad * 2;
    const dh = dino.h - pad * 2;
    for (const o of obstacles) {
      if (dx < o.x + o.w - 4 && dx + dw > o.x + 4 && dy < o.y + o.h - 4 && dy + dh > o.y + 4) {
        return true;
      }
    }
    return false;
  }

  function die() {
    state = 'over';
    if (score > best) {
      best = Math.floor(score);
      localStorage.setItem(BEST_KEY, String(best));
      bestEl.textContent = 'HI ' + pad(best);
    }
    showOverlay('GAME OVER', 'Score ' + pad(score), 'Best ' + pad(best) + ' — Start / Enter');
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
    showOverlay('DINO RUN', 'Press Start / Enter', 'or tap / click');
  }

  function jump() {
    if (dino.onGround) {
      dino.vy = JUMP_V;
      dino.onGround = false;
      jumpHeld = true;
    }
  }

  function onKey(e, down) {
    const code = e.code;
    keys[code] = down;
    if (down) {
      if (code === 'ArrowUp' || code === 'Space' || code === 'KeyW') {
        jump();
        e.preventDefault();
      } else if (code === 'ArrowDown' || code === 'KeyS') {
        e.preventDefault();
      } else if (code === 'KeyX') {
        if (shieldCd <= 0 && shieldT <= 0) {
          shieldT = SHIELD_DUR;
          shieldCd = SHIELD_CD;
        }
      } else if (code === 'Enter') { startPlay(); e.preventDefault(); }
      else if (code === 'Escape') { toTitle(); e.preventDefault(); }
    } else {
      if (code === 'ArrowUp' || code === 'Space' || code === 'KeyW') jumpHeld = false;
    }
  }

  document.addEventListener('keydown', (e) => onKey(e, true));
  document.addEventListener('keyup', (e) => onKey(e, false));
  overlay.addEventListener('click', () => {
    if (state === 'title' || state === 'over' || state === 'pause') startPlay();
  });
  canvas.addEventListener('click', () => {
    if (state === 'title' || state === 'over') startPlay();
    else if (state === 'play') jump();
  });

  function update(dt) {
    // horizontal move within range
    const minX = W * 0.08;
    const maxX = W * 0.42;
    if (keys.ArrowLeft || keys.KeyA) dino.x -= 220 * dt;
    if (keys.ArrowRight || keys.KeyD) dino.x += 220 * dt;
    dino.x = Math.max(minX, Math.min(maxX, dino.x));

    const wantDuck = !!(keys.ArrowDown || keys.KeyS);
    if (wantDuck && dino.onGround) {
      dino.ducking = true;
      dino.h = DINO_DUCK_H;
      dino.y = groundY - dino.h;
    } else if (dino.onGround) {
      dino.ducking = false;
      dino.h = DINO_H;
      dino.y = groundY - dino.h;
    } else {
      dino.ducking = false;
      dino.h = DINO_H;
    }

    if (!dino.onGround) {
      let g = GRAVITY;
      if (jumpHeld && dino.vy < 0) dino.vy += JUMP_HOLD * dt * 60 * 0.016; // slight hold boost
      if (wantDuck) g += DUCK_FASTFALL;
      dino.vy += g * dt;
      dino.y += dino.vy * dt;
      if (dino.y + dino.h >= groundY) {
        dino.y = groundY - dino.h;
        dino.vy = 0;
        dino.onGround = true;
        jumpHeld = false;
      }
    }

    speed = Math.min(720, 320 + dist * 0.012);
    dist += speed * dt;
    score = dist * 0.05;
    scoreEl.textContent = pad(score);

    // spawn
    spawnAcc -= dt;
    if (spawnAcc <= 0) {
      spawnObstacle();
      spawnAcc = 0.9 + Math.random() * 1.1 - Math.min(0.5, speed / 1400);
    }

    for (const o of obstacles) {
      o.x -= speed * dt;
      if (o.type === 'bird') o.flap += dt * 10;
    }
    obstacles = obstacles.filter((o) => o.x + o.w > -40);

    for (const c of clouds) {
      c.x -= speed * 0.15 * c.s * dt;
      if (c.x < -80) {
        c.x = W + 40;
        c.y = 40 + Math.random() * (groundY * 0.35);
      }
    }

    if (shieldT > 0) shieldT -= dt;
    if (shieldCd > 0) shieldCd -= dt;
    blink += dt;

    dino.frame += dt * (dino.onGround && !dino.ducking ? speed * 0.02 : 0);

    if (hitTest()) die();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawDino() {
    const x = dino.x, y = dino.y, w = dino.w, h = dino.h;
    ctx.fillStyle = '#9aa0a6';
    if (dino.ducking) {
      roundRect(x, y + 4, w + 8, h - 4, 4);
      ctx.fill();
      // head
      ctx.fillRect(x + w - 4, y, 18, 16);
      ctx.fillStyle = '#121418';
      ctx.fillRect(x + w + 8, y + 4, 3, 3);
    } else {
      // body
      ctx.fillRect(x + 8, y + 14, 22, 26);
      // head
      ctx.fillRect(x + 20, y, 22, 18);
      // tail
      ctx.fillRect(x, y + 20, 10, 8);
      // eye
      ctx.fillStyle = '#121418';
      ctx.fillRect(x + 34, y + 5, 4, 4);
      // legs
      ctx.fillStyle = '#9aa0a6';
      const leg = Math.floor(dino.frame) % 2;
      if (dino.onGround) {
        ctx.fillRect(x + 10, y + h - 2, 6, 10 + (leg ? 0 : -4));
        ctx.fillRect(x + 22, y + h - 2, 6, 10 + (leg ? -4 : 0));
      } else {
        ctx.fillRect(x + 12, y + h - 2, 6, 8);
        ctx.fillRect(x + 22, y + h - 2, 6, 8);
      }
      // arm
      ctx.fillRect(x + 14, y + 22, 8, 4);
    }
    if (shieldT > 0) {
      ctx.strokeStyle = 'rgba(110,168,254,' + (0.4 + 0.4 * Math.sin(blink * 20)) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, Math.max(w, h) * 0.7, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function draw() {
    // sky
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1a1e26');
    g.addColorStop(1, '#0c1016');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // clouds
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (const c of clouds) {
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, 28 * c.s, 10 * c.s, 0, 0, Math.PI * 2);
      ctx.ellipse(c.x + 18 * c.s, c.y + 2, 20 * c.s, 8 * c.s, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // ground
    ctx.strokeStyle = '#5a6070';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, groundY + 0.5);
    ctx.lineTo(W, groundY + 0.5);
    ctx.stroke();
    ctx.fillStyle = '#161a22';
    ctx.fillRect(0, groundY, W, H - groundY);
    // ground ticks
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    const off = (dist * 0.5) % 40;
    for (let x = -off; x < W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, groundY + 6);
      ctx.lineTo(x + 12, groundY + 6);
      ctx.stroke();
    }

    // obstacles
    for (const o of obstacles) {
      if (o.type === 'cactus') {
        ctx.fillStyle = '#6b9b5a';
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.fillRect(o.x - 6, o.y + o.h * 0.35, 6, 8);
        ctx.fillRect(o.x + o.w, o.y + o.h * 0.25, 6, 8);
      } else {
        ctx.fillStyle = '#9aa0a6';
        const flap = Math.sin(o.flap) > 0;
        ctx.fillRect(o.x, o.y + 8, o.w, 12);
        ctx.fillRect(o.x + 28, o.y + 4, 12, 10);
        ctx.fillStyle = '#7a8088';
        if (flap) ctx.fillRect(o.x + 8, o.y, 16, 8);
        else ctx.fillRect(o.x + 8, o.y + 14, 16, 8);
      }
    }

    if (dino) drawDino();

    // shield cooldown bar
    if (state === 'play' || state === 'pause') {
      const bw = 60, bh = 4;
      const bx = 14, by = 14;
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(bx, by, bw, bh);
      const ready = shieldCd <= 0;
      ctx.fillStyle = ready ? '#6ea8fe' : '#3a4050';
      const frac = ready ? 1 : 1 - shieldCd / SHIELD_CD;
      ctx.fillRect(bx, by, bw * frac, bh);
    }
  }

  function loop(ts) {
    if (!last) last = ts;
    const dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    if (state === 'play') update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', () => {
    const wasX = dino ? dino.x / (W || 1) : 0.18;
    resize();
    if (dino) {
      dino.x = wasX * W;
      if (dino.onGround) dino.y = groundY - dino.h;
    }
  });
  resize();
  reset();
  showOverlay('DINO RUN', 'Press Start / Enter', 'or tap / click');
  requestAnimationFrame(loop);
})();
