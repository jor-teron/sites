/*
  Space Invaders Clone — game logic
  Canvas 2D. No external libs.
  States: menu, playing, paused, over, win.
  Invaders: grid, march left/right, drop a row at edge, shoot randomly.
  Player: 3 lives, cooldown shots, invincible blink after hit.
*/

// ---------- canvas & HUD ----------
/** Main drawing surface */
const canvas = document.getElementById("game");
/** 2D drawing context */
const ctx = canvas.getContext("2d");
/** Score display node */
const scoreEl = document.getElementById("score");
/** Lives display node */
const livesEl = document.getElementById("lives");
/** Wave display node */
const waveEl = document.getElementById("wave");
/** Start / over overlay */
const overlay = document.getElementById("overlay");
/** Overlay message line */
const overlayMsg = document.getElementById("overlay-msg");

// ---------- constants (from space-invader_config.js) ----------
const CFG = SPACE_INVADER_CONFIG;
const IC = CFG.invaders;
const COLR = CFG.colors;
/** True if the event's code or key is in the binding list. */
const isKey = (list, e) => list.indexOf(e.code) !== -1 || list.indexOf(e.key) !== -1;
const W = CFG.width;
const H = CFG.height;
const PLAYER_W = CFG.player.w;
const PLAYER_H = CFG.player.h;
const PLAYER_SPEED = CFG.player.speed;
const BULLET_SPEED = CFG.bullets.speed;
const SHOT_COOLDOWN = CFG.player.shotCooldownMs;
const INV_W = IC.w;
const INV_H = IC.h;
const COLS = IC.cols;
const ROWS = IC.rows;
const INV_GAP_X = IC.gapX;
const INV_GAP_Y = IC.gapY;
const INV_START_Y = IC.startY;
const MAX_LIVES = CFG.start.lives;

// ---------- runtime state ----------
/** Current game state string */
let state = "menu";
/** Player score */
let score = CFG.start.score;
/** Remaining lives */
let lives = MAX_LIVES;
/** Current wave number */
let wave = CFG.start.wave;
/** Last timestamp from rAF */
let lastTs = 0;
/** Keys currently held */
const keys = { left: false, right: false, shoot: false };
/** Last time player fired */
let lastShot = 0;
/** Invincibility timer after hit (ms remaining) */
let invuln = 0;
/** Player object */
let player = { x: W / 2, y: H - CFG.player.bottomOffset };
/** Player bullets array */
let bullets = [];
/** Enemy bullets array */
let eBullets = [];
/** Invader objects */
let invaders = [];
/** Invader formation: direction 1=right, -1=left */
let invDir = 1;
/** Invader step speed this wave */
let invSpeed = IC.speedBase + CFG.start.wave * IC.speedPerWave;
/** Drop amount when hitting a wall */
const INV_DROP = IC.drop;
/** Stars for background */
let stars = [];

// ---------- helpers ----------
/**
 * Resize canvas to device pixels while keeping logical W x H.
 */
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, CFG.maxDpr);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = "100vw";
  canvas.style.height = "100vh";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/**
 * Update HUD numbers.
 */
function updateHud() {
  scoreEl.textContent = String(score);
  livesEl.textContent = String(lives);
  waveEl.textContent = String(wave);
}

/**
 * Show overlay with a message.
 * @param {string} msg
 */
function showOverlay(msg) {
  overlayMsg.textContent = msg;
  overlay.classList.remove("hidden");
}

/**
 * Hide overlay.
 */
function hideOverlay() {
  overlay.classList.add("hidden");
}

/**
 * Build starfield once.
 */
function makeStars() {
  stars = [];
  const S = CFG.stars;
  for (let i = 0; i < S.count; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      s: Math.random() * S.sizeRange + S.minSize,
      v: Math.random() * S.speedRange + S.minSpeed
    });
  }
}

/**
 * Create invader grid for current wave.
 */
function spawnInvaders() {
  invaders = [];
  const totalW = COLS * INV_W + (COLS - 1) * INV_GAP_X;
  const startX = (W - totalW) / 2;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      invaders.push({
        x: startX + c * (INV_W + INV_GAP_X),
        y: INV_START_Y + r * (INV_H + INV_GAP_Y),
        w: INV_W,
        h: INV_H,
        alive: true,
        type: r < 1 ? 2 : r < 3 ? 1 : 0
      });
    }
  }
  invDir = 1;
  invSpeed = IC.speedBase + wave * IC.speedPerWave;
}

/**
 * Reset a full game from wave 1.
 */
function resetGame() {
  score = CFG.start.score;
  lives = MAX_LIVES;
  wave = CFG.start.wave;
  bullets = [];
  eBullets = [];
  player = { x: W / 2, y: H - CFG.player.bottomOffset };
  invuln = 0;
  lastShot = 0;
  spawnInvaders();
  updateHud();
}

/**
 * Start next wave after a clear.
 */
function nextWave() {
  wave += 1;
  bullets = [];
  eBullets = [];
  player.x = W / 2;
  spawnInvaders();
  updateHud();
}

/**
 * Axis-aligned box overlap test.
 */
function hit(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

// ---------- input ----------
/**
 * Map a key event to movement / fire flags.
 * @param {KeyboardEvent} e
 * @param {boolean} down
 */
function onKey(e, down) {
  if (isKey(CFG.keys.left, e)) { keys.left = down; e.preventDefault(); }
  if (isKey(CFG.keys.right, e)) { keys.right = down; e.preventDefault(); }
  if (isKey(CFG.keys.shoot, e)) {
    keys.shoot = down;
    e.preventDefault();
    if (down && !e.repeat) tryStartOrShoot();
  }
  if (!down || e.repeat) return;
  if (isKey(CFG.keys.start, e)) {
    e.preventDefault();
    if (state === "playing") pauseGame();
    else tryStartOrShoot();
  } else if (isKey(CFG.keys.pause, e)) {
    if (state === "playing") pauseGame();
    else if (state === "paused") tryStartOrShoot();
  } else if (isKey(CFG.keys.restart, e)) {
    e.preventDefault();
    toMenu();
  }
}

/** Pause a running game. */
function pauseGame() {
  state = "paused";
  showOverlay(CFG.text.paused);
}

/** Back to the start screen with a fresh game. */
function toMenu() {
  resetGame();
  state = "menu";
  showOverlay(CFG.text.menu);
}

/** Focus lost: the keyup would never arrive, so drop held keys. */
function clearKeys() {
  keys.left = keys.right = keys.shoot = false;
}

/**
 * Begin game from menu / resume / restart, or fire if already playing.
 */
function tryStartOrShoot() {
  if (state === "menu" || state === "over" || state === "win") {
    resetGame();
    state = "playing";
    hideOverlay();
    return;
  }
  if (state === "paused") {
    state = "playing";
    hideOverlay();
    return;
  }
}

/**
 * Pointer / tap: start or shoot toward center-ish.
 */
function onPointer(e) {
  e.preventDefault();
  if (state !== "playing") {
    tryStartOrShoot();
    return;
  }
  firePlayer();
}

window.addEventListener("keydown", (e) => onKey(e, true));
window.addEventListener("keyup", (e) => onKey(e, false));
window.addEventListener("blur", clearKeys);
document.addEventListener("visibilitychange", () => { if (document.hidden) clearKeys(); });
canvas.addEventListener("pointerdown", onPointer);
overlay.addEventListener("pointerdown", onPointer);
window.addEventListener("resize", resize);

// ---------- combat ----------
/**
 * Spawn a player bullet if cooldown allows.
 */
function firePlayer() {
  const now = performance.now();
  if (now - lastShot < SHOT_COOLDOWN) return;
  lastShot = now;
  bullets.push({
    x: player.x - 2,
    y: player.y - PLAYER_H,
    w: CFG.bullets.w,
    h: CFG.bullets.h
  });
}

/**
 * Random living invader fires downward.
 */
function maybeEnemyShot() {
  const living = invaders.filter((i) => i.alive);
  if (!living.length) return;
  // more shots on later waves
  const chance = IC.shotChanceBase + wave * IC.shotChancePerWave;
  if (Math.random() > chance) return;
  const shooter = living[Math.floor(Math.random() * living.length)];
  eBullets.push({
    x: shooter.x + shooter.w / 2 - 2,
    y: shooter.y + shooter.h,
    w: CFG.bullets.w,
    h: CFG.bullets.h
  });
}

/**
 * Player lost a life.
 */
function playerHit() {
  if (invuln > 0) return;
  lives -= 1;
  updateHud();
  eBullets = [];
  invuln = CFG.player.invulnMs;
  if (lives <= 0) {
    state = "over";
    showOverlay(CFG.text.gameOver);
  }
}

// ---------- update ----------
/**
 * Advance simulation one frame.
 * @param {number} dt milliseconds
 */
function update(dt) {
  if (state !== "playing") return;

  // star drift
  for (const s of stars) {
    s.y += s.v;
    if (s.y > H) s.y = 0;
  }

  // player move
  if (keys.left) player.x -= PLAYER_SPEED;
  if (keys.right) player.x += PLAYER_SPEED;
  player.x = Math.max(PLAYER_W / 2, Math.min(W - PLAYER_W / 2, player.x));
  if (keys.shoot) firePlayer();

  if (invuln > 0) invuln -= dt;

  // player bullets
  for (const b of bullets) b.y -= BULLET_SPEED;
  bullets = bullets.filter((b) => b.y + b.h > 0);

  // enemy bullets
  for (const b of eBullets) b.y += BULLET_SPEED * CFG.bullets.enemySpeedFactor;
  eBullets = eBullets.filter((b) => b.y < H);

  // invader march
  let hitEdge = false;
  let lowest = 0;
  for (const inv of invaders) {
    if (!inv.alive) continue;
    inv.x += invDir * invSpeed;
    if (inv.x <= IC.edgeMargin || inv.x + inv.w >= W - IC.edgeMargin) hitEdge = true;
    if (inv.y + inv.h > lowest) lowest = inv.y + inv.h;
  }
  if (hitEdge) {
    invDir *= -1;
    for (const inv of invaders) {
      if (inv.alive) inv.y += INV_DROP;
    }
  }

  // invaders reached player line
  if (lowest >= player.y - IC.landMargin) {
    state = "over";
    showOverlay(CFG.text.landed);
    return;
  }

  // bullet vs invader
  for (const b of bullets) {
    for (const inv of invaders) {
      if (!inv.alive) continue;
      if (hit(b, inv)) {
        inv.alive = false;
        b.y = -99;
        score += (inv.type + 1) * IC.pointsPerType;
        updateHud();
      }
    }
  }
  bullets = bullets.filter((b) => b.y > -50);

  // enemy bullet vs player
  const pBox = {
    x: player.x - PLAYER_W / 2,
    y: player.y - PLAYER_H,
    w: PLAYER_W,
    h: PLAYER_H
  };
  for (const b of eBullets) {
    if (hit(b, pBox)) {
      b.y = H + 20;
      playerHit();
    }
  }

  maybeEnemyShot();

  // wave clear
  if (!invaders.some((i) => i.alive)) {
    nextWave();
  }
}

// ---------- draw ----------
/**
 * Draw a simple pixel-ish invader.
 * @param {object} inv
 */
function drawInvader(inv) {
  const { x, y, w, h, type } = inv;
  ctx.fillStyle = type === 2 ? COLR.invaderTop : type === 1 ? COLR.invaderMid : COLR.invaderLow;
  // body
  ctx.fillRect(x + 4, y + 6, w - 8, h - 10);
  // "eyes"
  ctx.fillRect(x + 6, y + 8, 5, 4);
  ctx.fillRect(x + w - 11, y + 8, 5, 4);
  // arms
  ctx.fillRect(x, y + 10, 4, 6);
  ctx.fillRect(x + w - 4, y + 10, 4, 6);
  // feet
  ctx.fillRect(x + 4, y + h - 4, 6, 4);
  ctx.fillRect(x + w - 10, y + h - 4, 6, 4);
}

/**
 * Draw player cannon.
 */
function drawPlayer() {
  if (invuln > 0 && Math.floor(invuln / CFG.player.blinkMs) % 2 === 0) return;
  const x = player.x - PLAYER_W / 2;
  const y = player.y - PLAYER_H;
  ctx.fillStyle = COLR.player;
  ctx.fillRect(x + 4, y + 8, PLAYER_W - 8, PLAYER_H - 8);
  ctx.fillRect(x + PLAYER_W / 2 - 3, y, 6, 10);
  ctx.fillStyle = COLR.playerTip;
  ctx.fillRect(x + PLAYER_W / 2 - 2, y - 2, 4, 4);
}

/**
 * Render one frame.
 */
function draw() {
  ctx.fillStyle = COLR.bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = COLR.star;
  for (const s of stars) {
    ctx.globalAlpha = 0.35 + s.s * 0.3;
    ctx.fillRect(s.x, s.y, s.s, s.s);
  }
  ctx.globalAlpha = 1;

  // ground line
  ctx.fillStyle = COLR.ground;
  ctx.fillRect(0, H - COLR.groundOffset, W, 2);

  for (const inv of invaders) {
    if (inv.alive) drawInvader(inv);
  }

  ctx.fillStyle = COLR.bullet;
  for (const b of bullets) ctx.fillRect(b.x, b.y, b.w, b.h);

  ctx.fillStyle = COLR.enemyBullet;
  for (const b of eBullets) ctx.fillRect(b.x, b.y, b.w, b.h);

  drawPlayer();
}

/**
 * Main loop.
 * @param {number} ts
 */
function loop(ts) {
  const dt = Math.min(ts - lastTs, CFG.maxDtMs);
  lastTs = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

// ---------- boot ----------
resize();
makeStars();
spawnInvaders();
updateHud();
requestAnimationFrame(loop);
