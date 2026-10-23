/**
 * Dino Run — Chrome offline dino–style endless runner.
 * Game logic only. Tunables come from DINO_RUN_CONFIG (core/config.js); everything visual (dinos, obstacles,
 * background, themes) is drawn by the models in assets/ through DR.renderScene. Looks never touch gameplay.
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
  let blink = 0, clock = 0, obstacleSerial = 0;
  let dinoModel = null, theme = null;
  const env = { W: 0, H: 0, groundY: 0, dist: 0, clock: 0, speed: 0, clouds: null };

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
  };
  best = Number(store.get(BEST_KEY) || 0) || 0;
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
      animPhase: 0,
      airT: 0,
      deadT: 0,
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
        obstacles.push({ type: 'cactus', x: x, y: groundY - h, w: w, h: h, v: obstacleSerial++ });
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
        v: obstacleSerial++,
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
      store.set(BEST_KEY, String(best));
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
      dino.airT = 0;
      jumpHeld = true;
    }
  }

  /**
   * True while the dino/theme picker is open (it owns the keyboard), or when Enter is pressed on one of its
   * buttons (so keyboard users can open it). Space on the picker button is NOT taken: it keeps jumping.
   */
  function uiOwnsKey(e) {
    if (DR.ui && DR.ui.isOpen && DR.ui.isOpen()) return true;
    const t = e.target;
    return !!(t && t.closest && t.closest('[data-dr-ui]') && (e.code === 'Enter' || e.key === 'Enter'));
  }

  function onKey(e, down) {
    if (uiOwnsKey(e)) return;
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
      if (isKey(K.jump, e)) {
        jumpHeld = false;
        // A focused picker button would otherwise be "clicked" by the Space keyup.
        if (e.target && e.target.closest && e.target.closest('[data-dr-ui]')) e.preventDefault();
      }
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
    dino.animPhase += dt * (dino.onGround ? speed * 0.02 : 0);
    if (!dino.onGround) dino.airT += dt;

    if (hitTest()) die();
  }

  /** The dino as the models see it: the (unchanged) hitbox plus animation state. Art only. */
  function dinoView() {
    const dead = state === 'over';
    const v = {
      x: dino.x, y: dino.y, w: dino.w, h: dino.h,
      pose: dead ? 'dead' : dino.ducking ? 'duck' : dino.onGround ? 'run' : 'jump',
      ducking: dino.ducking, phase: dino.animPhase, frame: dino.frame, t: clock, airT: dino.airT, deadT: dino.deadT,
      vy: dino.vy, onGround: dino.onGround, shield: shieldT > 0,
    };
    // Only the classic dino keeps the ducking box on death; the others die standing (their art is drawn for a 48px box).
    if (dead && dino.ducking && !dinoModel.rawDead) { v.ducking = false; v.h = DINO_H; v.y = groundY - DINO_H; }
    return v;
  }

  function draw() {
    env.W = W; env.H = H; env.groundY = groundY; env.dist = dist; env.clock = clock; env.speed = speed; env.clouds = clouds;
    const showBar = state === 'play' || state === 'pause';
    DR.renderScene(ctx, theme, {
      env: env, model: dinoModel, d: dinoView(), obstacles: obstacles, blink: blink,
      bar: showBar ? { ready: shieldCd <= 0, frac: shieldCd <= 0 ? 1 : 1 - shieldCd / SHIELD_CD } : null,
    });
  }

  function loop(ts) {
    if (!last) last = ts;
    const dt = Math.min(PH.maxDt, (ts - last) / 1000);
    last = ts;
    clock = ts / 1000;
    if (state === 'play') update(dt);
    else if (state === 'over' && dino) dino.deadT += dt;
    draw();
    requestAnimationFrame(loop);
  }

  // ---- look & feel (cosmetic only): the active dino and theme, saved in localStorage -------------------------
  const themeVarKeys = [];
  const kebab = (k) => k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
  function applyThemeUi() {
    const root = document.documentElement.style;
    while (themeVarKeys.length) root.removeProperty(themeVarKeys.pop());
    for (const k in theme.ui) {
      root.setProperty('--' + kebab(k), theme.ui[k]);
      themeVarKeys.push('--' + kebab(k));
    }
  }
  function setDino(id, save) {
    dinoModel = DR.getDino(id);
    if (save !== false) store.set(CFG.dinoKey, dinoModel.id);
  }
  function setTheme(id, save) {
    theme = DR.getTheme(id);
    applyThemeUi();
    if (save !== false) store.set(CFG.themeKey, theme.id);
  }
  const savedId = (key, list, fallback) => {
    const v = store.get(key);
    return list.some((m) => m.id === v) ? v : fallback;
  };
  setDino(savedId(CFG.dinoKey, DR.dinos, CFG.defaultDino), false);
  setTheme(savedId(CFG.themeKey, DR.themes, CFG.defaultTheme), false);

  DR.game = {
    getDino: () => dinoModel,
    getTheme: () => theme,
    setDino: (id) => { setDino(id); },
    setTheme: (id) => { setTheme(id); },
    /** Opening the picker mid-run pauses it (no overlay click needed to resume: Start / tap does that). */
    pauseIfPlaying: () => { if (state === 'play') startPlay(); },
  };

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
  if (DR.ui) DR.ui.init();
  showOverlay(TX.title, TX.pressStart, TX.titleSub);
  requestAnimationFrame(loop);
})();
