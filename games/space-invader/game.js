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

// ---------- constants ----------
/** Logical playfield width (scaled to screen) */
const W = 480;
/** Logical playfield height */
const H = 640;
/** Player ship width */
const PLAYER_W = 36;
/** Player ship height */
const PLAYER_H = 18;
/** Player horizontal speed (px per frame at 60fps) */
const PLAYER_SPEED = 4.2;
/** Player bullet speed (up) */
const BULLET_SPEED = 8;
/** Cooldown between player shots (ms) */
const SHOT_COOLDOWN = 280;
/** Invader cell width */
const INV_W = 28;
/** Invader cell height */
const INV_H = 20;
/** Columns of invaders */
const COLS = 8;
/** Rows of invaders */
const ROWS = 5;
/** Horizontal gap between invaders */
const INV_GAP_X = 12;
/** Vertical gap between invaders */
const INV_GAP_Y = 14;
/** Starting Y of top invader row */
const INV_START_Y = 70;
/** Max player lives */
const MAX_LIVES = 3;

// ---------- runtime state ----------
/** Current game state string */
let state = "menu";
/** Player score */
let score = 0;
/** Remaining lives */
let lives = MAX_LIVES;
/** Current wave number */
let wave = 1;
/** Last timestamp from rAF */
let lastTs = 0;
/** Keys currently held */
const keys = { left: false, right: false, shoot: false };
/** Last time player fired */
let lastShot = 0;
/** Invincibility timer after hit (ms remaining) */
let invuln = 0;
/** Player object */
let player = { x: W / 2, y: H - 50 };
/** Player bullets array */
let bullets = [];
/** Enemy bullets array */
let eBullets = [];
/** Invader objects */
let invaders = [];
/** Invader formation: direction 1=right, -1=left */
let invDir = 1;
/** Invader step speed this wave */
let invSpeed = 0.6;
/** Drop amount when hitting a wall */
const INV_DROP = 16;
/** Stars for background */
let stars = [];

// ---------- helpers ----------
/**
 * Resize canvas to device pixels while keeping logical W x H.
 */
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
  for (let i = 0; i < 60; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      s: Math.random() * 1.4 + 0.3,
      v: Math.random() * 0.4 + 0.1
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
  invSpeed = 0.55 + wave * 0.18;
}

/**
 * Reset a full game from wave 1.
 */
function resetGame() {
  score = 0;
  lives = MAX_LIVES;
  wave = 1;
  bullets = [];
  eBullets = [];
  player = { x: W / 2, y: H - 50 };
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
  if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = down;
  if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = down;
  if (e.code === "Space") {
    keys.shoot = down;
    e.preventDefault();
    if (down) tryStartOrShoot();
  }
  if (e.code === "KeyP" && down && state === "playing") {
    state = "paused";
    showOverlay("PAUSED — SPACE to resume");
  }
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
    w: 4,
    h: 10
  });
}

/**
 * Random living invader fires downward.
 */
function maybeEnemyShot() {
  const living = invaders.filter((i) => i.alive);
  if (!living.length) return;
  // more shots on later waves
  const chance = 0.008 + wave * 0.002;
  if (Math.random() > chance) return;
  const shooter = living[Math.floor(Math.random() * living.length)];
  eBullets.push({
    x: shooter.x + shooter.w / 2 - 2,
    y: shooter.y + shooter.h,
    w: 4,
    h: 10
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
  invuln = 1500;
  if (lives <= 0) {
    state = "over";
    showOverlay("GAME OVER — SPACE / TAP to retry");
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
  for (const b of eBullets) b.y += BULLET_SPEED * 0.7;
  eBullets = eBullets.filter((b) => b.y < H);

  // invader march
  let hitEdge = false;
  let lowest = 0;
  for (const inv of invaders) {
    if (!inv.alive) continue;
    inv.x += invDir * invSpeed;
    if (inv.x <= 8 || inv.x + inv.w >= W - 8) hitEdge = true;
    if (inv.y + inv.h > lowest) lowest = inv.y + inv.h;
  }
  if (hitEdge) {
    invDir *= -1;
    for (const inv of invaders) {
      if (inv.alive) inv.y += INV_DROP;
    }
  }

  // invaders reached player line
  if (lowest >= player.y - 8) {
    state = "over";
    showOverlay("THEY LANDED — SPACE / TAP to retry");
    return;
  }

  // bullet vs invader
  for (const b of bullets) {
    for (const inv of invaders) {
      if (!inv.alive) continue;
      if (hit(b, inv)) {
        inv.alive = false;
        b.y = -99;
        score += (inv.type + 1) * 10;
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
  ctx.fillStyle = type === 2 ? "#ff6b6b" : type === 1 ? "#7cff7c" : "#7cc8ff";
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
  if (invuln > 0 && Math.floor(invuln / 80) % 2 === 0) return;
  const x = player.x - PLAYER_W / 2;
  const y = player.y - PLAYER_H;
  ctx.fillStyle = "#e8f0ff";
  ctx.fillRect(x + 4, y + 8, PLAYER_W - 8, PLAYER_H - 8);
  ctx.fillRect(x + PLAYER_W / 2 - 3, y, 6, 10);
  ctx.fillStyle = "#7cff7c";
  ctx.fillRect(x + PLAYER_W / 2 - 2, y - 2, 4, 4);
}

/**
 * Render one frame.
 */
function draw() {
  ctx.fillStyle = "#050508";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#ffffff";
  for (const s of stars) {
    ctx.globalAlpha = 0.35 + s.s * 0.3;
    ctx.fillRect(s.x, s.y, s.s, s.s);
  }
  ctx.globalAlpha = 1;

  // ground line
  ctx.fillStyle = "#1a3a1a";
  ctx.fillRect(0, H - 28, W, 2);

  for (const inv of invaders) {
    if (inv.alive) drawInvader(inv);
  }

  ctx.fillStyle = "#fff8a0";
  for (const b of bullets) ctx.fillRect(b.x, b.y, b.w, b.h);

  ctx.fillStyle = "#ff6b6b";
  for (const b of eBullets) ctx.fillRect(b.x, b.y, b.w, b.h);

  drawPlayer();
}

/**
 * Main loop.
 * @param {number} ts
 */
function loop(ts) {
  const dt = Math.min(ts - lastTs, 40);
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
