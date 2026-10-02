/**
 * Dino Run — Chrome offline dino–style endless runner.
 * Game logic. Tunables come from DINO_RUN_CONFIG (dino-run_config.js).
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

  const CFG = DINO_RUN_CONFIG;
  const K = CFG.keys;
  const TX = CFG.text;
  const CL = CFG.colors;
  const SP = CFG.spawn;
  const PH = CFG.physics;
  // Match a key event against a binding list by KeyboardEvent.code OR .key.
  const isKey = (list, e) => list.indexOf(e.code) !== -1 || list.indexOf(e.key) !== -1;
  const held = (list) => list.some((c) => keys[c]);
  document.getElementById('help').textContent = TX.help;

  const BEST_KEY = CFG.bestKey;
  const GRAVITY = PH.gravity;
  const JUMP_V = PH.jumpVelocity;
  const JUMP_HOLD = PH.jumpHold; // extra upward while holding
  const DUCK_FASTFALL = PH.duckFastFall;
  const GROUND_Y_FRAC = CFG.groundYFrac;
  const DINO_W = CFG.dino.width;
  const DINO_H = CFG.dino.height;
  const DINO_DUCK_H = CFG.dino.duckHeight;
  const SHIELD_DUR = CFG.shield.duration;
  const SHIELD_CD = CFG.shield.cooldown;

  let dpr = 1, W = 0, H = 0, groundY = 0;
  let state = 'title';
  let score = CFG.start.score, best = 0, speed = CFG.start.speed, dist = 0;
  let dino, obstacles, clouds, particles;
  let keys = Object.create(null);
  let shieldT = 0, shieldCd = 0, jumpHeld = false;
  let last = 0, spawnAcc = 0;
  let clickStartAt = -Infinity; // time a tap/click started the game
  let blink = 0;

  best = Number(localStorage.getItem(BEST_KEY) || 0) || 0;
  bestEl.textContent = 'HI ' + pad(best);

  function pad(n) {
    return String(Math.floor(n)).padStart(CFG.scoreDigits, '0');
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
      x: W * CFG.dino.startXFrac,
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
    for (let i = 0; i < SP.clouds; i++) {
      clouds.push({
        x: Math.random() * W,
        y: 40 + Math.random() * (groundY * 0.35),
        s: 0.4 + Math.random() * 0.6,
      });
    }
    score = CFG.start.score;
    dist = 0;
    speed = CFG.start.speed;
    spawnAcc = CFG.start.spawnDelay;
    shieldT = 0;
    shieldCd = 0;
    jumpHeld = false;
    scoreEl.textContent = pad(score);
  }

  function spawnObstacle() {
    const r = Math.random();
    if (r < SP.cactusChance) {
      // cactus cluster
      const n = 1 + (Math.random() < SP.cactusExtra1 ? 1 : 0) + (Math.random() < SP.cactusExtra2 ? 1 : 0);
      let x = W + 20;
      for (let i = 0; i < n; i++) {
        const h = SP.cactusMinH + Math.floor(Math.random() * SP.cactusRandH);
        const w = SP.cactusMinW + Math.floor(Math.random() * SP.cactusRandW);
        obstacles.push({ type: 'cactus', x: x, y: groundY - h, w: w, h: h });
        x += w + SP.cactusGap;
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
        w: SP.birdW,
        h: SP.birdH,
        flap: 0,
      });
    }
  }

  function hitTest() {
    if (shieldT > 0) return false;
    const pad = CFG.dino.hitPad;
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
    showOverlay(TX.gameOver, 'Score ' + pad(score), 'Best ' + pad(best) + ' — Start / Enter');
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

  function jump() {
    if (dino.onGround) {
      dino.vy = JUMP_V;
      dino.onGround = false;
      jumpHeld = true;
    }
  }

  function onKey(e, down) {
    if (e.code) keys[e.code] = down;
    if (e.key) keys[e.key] = down;
    if (down) {
      if (isKey(K.jump, e)) {
        jump();
        e.preventDefault();
      } else if (isKey(K.duck, e)) {
        e.preventDefault();
      } else if (isKey(K.shield, e)) {
        if (shieldCd <= 0 && shieldT <= 0) {
          shieldT = SHIELD_DUR;
          shieldCd = SHIELD_CD;
        }
      } else if (isKey(K.start, e)) { if (!e.repeat) onStartKey(); e.preventDefault(); }
      else if (isKey(K.restart, e)) { if (!e.repeat) toTitle(); e.preventDefault(); }
    } else {
      if (isKey(K.jump, e)) jumpHeld = false;
    }
  }

  /** Focus lost: the keyup would never arrive, so drop held keys. */
  function clearKeys() {
    keys = Object.create(null);
    jumpHeld = false;
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
    else if (state === 'play') jump();
  });

  function update(dt) {
    // horizontal move within range
    const minX = W * PH.minXFrac;
    const maxX = W * PH.maxXFrac;
    if (held(K.left)) dino.x -= PH.moveSpeed * dt;
    if (held(K.right)) dino.x += PH.moveSpeed * dt;
    dino.x = Math.max(minX, Math.min(maxX, dino.x));

    const wantDuck = held(K.duck);
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

    speed = Math.min(CFG.speed.max, CFG.start.speed + dist * CFG.speed.perDistance);
    dist += speed * dt;
    score = dist * CFG.speed.scorePerDistance;
    scoreEl.textContent = pad(score);

    // spawn
    spawnAcc -= dt;
    if (spawnAcc <= 0) {
      spawnObstacle();
      spawnAcc = SP.intervalBase + Math.random() * SP.intervalRandom - Math.min(SP.intervalSpeedMax, speed / SP.intervalSpeedDiv);
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
    ctx.fillStyle = CL.dino;
    if (dino.ducking) {
      roundRect(x, y + 4, w + 8, h - 4, 4);
      ctx.fill();
      // head
      ctx.fillRect(x + w - 4, y, 18, 16);
      ctx.fillStyle = CL.eye;
      ctx.fillRect(x + w + 8, y + 4, 3, 3);
    } else {
      // body
      ctx.fillRect(x + 8, y + 14, 22, 26);
      // head
      ctx.fillRect(x + 20, y, 22, 18);
      // tail
      ctx.fillRect(x, y + 20, 10, 8);
      // eye
      ctx.fillStyle = CL.eye;
      ctx.fillRect(x + 34, y + 5, 4, 4);
      // legs
      ctx.fillStyle = CL.dino;
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
      ctx.strokeStyle = 'rgba(' + CL.shieldRGB + ',' + (0.4 + 0.4 * Math.sin(blink * 20)) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, Math.max(w, h) * 0.7, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function draw() {
    // sky
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, CL.skyTop);
    g.addColorStop(1, CL.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // clouds
    ctx.fillStyle = CL.cloud;
    for (const c of clouds) {
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, 28 * c.s, 10 * c.s, 0, 0, Math.PI * 2);
      ctx.ellipse(c.x + 18 * c.s, c.y + 2, 20 * c.s, 8 * c.s, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // ground
    ctx.strokeStyle = CL.groundLine;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, groundY + 0.5);
    ctx.lineTo(W, groundY + 0.5);
    ctx.stroke();
    ctx.fillStyle = CL.ground;
    ctx.fillRect(0, groundY, W, H - groundY);
    // ground ticks
    ctx.strokeStyle = CL.groundTick;
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
        ctx.fillStyle = CL.cactus;
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.fillRect(o.x - 6, o.y + o.h * 0.35, 6, 8);
        ctx.fillRect(o.x + o.w, o.y + o.h * 0.25, 6, 8);
      } else {
        ctx.fillStyle = CL.bird;
        const flap = Math.sin(o.flap) > 0;
        ctx.fillRect(o.x, o.y + 8, o.w, 12);
        ctx.fillRect(o.x + 28, o.y + 4, 12, 10);
        ctx.fillStyle = CL.birdWing;
        if (flap) ctx.fillRect(o.x + 8, o.y, 16, 8);
        else ctx.fillRect(o.x + 8, o.y + 14, 16, 8);
      }
    }

    if (dino) drawDino();

    // shield cooldown bar
    if (state === 'play' || state === 'pause') {
      const bw = 60, bh = 4;
      const bx = 14, by = 14;
      ctx.fillStyle = CL.barBg;
      ctx.fillRect(bx, by, bw, bh);
      const ready = shieldCd <= 0;
      ctx.fillStyle = ready ? CL.barReady : CL.barCharging;
      const frac = ready ? 1 : 1 - shieldCd / SHIELD_CD;
      ctx.fillRect(bx, by, bw * frac, bh);
    }
  }

  function loop(ts) {
    if (!last) last = ts;
    const dt = Math.min(PH.maxDt, (ts - last) / 1000);
    last = ts;
    if (state === 'play') update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', () => {
    const wasX = dino ? dino.x / (W || 1) : CFG.dino.startXFrac;
    resize();
    if (dino) {
      dino.x = wasX * W;
      if (dino.onGround) dino.y = groundY - dino.h;
    }
  });
  resize();
  reset();
  showOverlay(TX.title, TX.pressStart, TX.titleSub);
  requestAnimationFrame(loop);
})();
