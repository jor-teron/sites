/**
 * Neon Raid — Contra-style Alpha
 * Game logic. Tunables come from CONTRA_ALPHA_CONFIG (contra-alpha_config.js).
 *
 * HTML + CSS + JS canvas run-and-gun.
 * Theme: futuristic neon (skinnable later).
 * Lives: 3. HP per life: 2.
 * Timer: 250 / 200 / 150 / 100 seconds (menu).
 * Input: keyboard only. Gamepad API next iteration.
 * Audio: stub only — assets later (no token-heavy embeds).
 *
 * Alpha: one hand-placed corridor, simple rect sprites, 2 enemy types + end gate.
 */

/* ---------- config aliases (values live in contra-alpha_config.js) ---------- */
var CFG = CONTRA_ALPHA_CONFIG;
var DEFAULT_DURATION = CFG.defaultDuration;
var MAX_HP = CFG.maxHp;
var MAX_LIVES = CFG.maxLives;
var RUN_SPEED = CFG.player.runSpeed;
var JUMP_VEL = CFG.player.jumpVel;
var GRAVITY = CFG.player.gravity;
var BULLET_SPEED = CFG.bullet.speed;
var FIRE_COOLDOWN = CFG.bullet.cooldown;
var W = CFG.width;
var H = CFG.height;
var PC = CFG.player;
var EC = CFG.enemy;
var BC = CFG.bullet;
var COL = CFG.colors;

/* ---------- audio stub (fill later) ---------- */

/**
 * Placeholder audio bus.
 * Call playSfx("shoot") etc. Real buffers can be wired later.
 */
var AudioBus = {
  enabled: false,
  /**
   * Play a named cue if assets exist.
   * @param {string} name
   */
  playSfx: function (name) {
    if (!this.enabled) return;
  },
  /**
   * Start or stop looped BGM later.
   * @param {boolean} on
   */
  setMusic: function (on) {
    if (!this.enabled) return;
  }
};

/* ---------- input ---------- */

/** Key state map. */
var keys = {};

/**
 * True if the event's code or key is in the list.
 * @param {string[]} list
 * @param {KeyboardEvent} e
 */
function keyIn(list, e) {
  return list.indexOf(e.code) >= 0 || list.indexOf(e.key) >= 0;
}

/** Forget every held key (focus lost / screen change: the keyup may never arrive). */
function clearKeys() {
  for (var k in keys) keys[k] = false;
}

/** True while the start menu / end overlay is on screen. */
function isShown(id) {
  return !document.getElementById(id).classList.contains("hidden");
}

/**
 * Menu / end-screen / pause keys (Enter / Space / Escape).
 * @param {KeyboardEvent} e
 */
function onScreenKey(e) {
  if (isShown("menu")) {
    if (keyIn(CFG.keys.start, e)) { e.preventDefault(); startGame(); }
  } else if (isShown("overlay")) {
    if (keyIn(CFG.keys.start, e)) { e.preventDefault(); startGame(); }
    else if (keyIn(CFG.keys.menu, e)) { e.preventDefault(); showMenu(); }
  } else if (state && (state.running || state.paused)) {
    if (keyIn(CFG.keys.pause, e)) { e.preventDefault(); togglePause(); }
    else if (keyIn(CFG.keys.menu, e)) { e.preventDefault(); showMenu(); }
  }
}

/**
 * Bind keyboard listeners.
 */
function bindInput() {
  window.addEventListener("keydown", function (e) {
    if (!e.repeat) {
      var before = isShown("menu") || isShown("overlay");
      onScreenKey(e);
      // the key that started a match must not also jump / fire
      if (before && !(isShown("menu") || isShown("overlay"))) return;
    }
    if (e.code) keys[e.code] = true;
    if (e.key) keys[e.key] = true;
    if (keyIn(CFG.keys.preventDefault, e)) {
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", function (e) {
    if (e.code) keys[e.code] = false;
    if (e.key) keys[e.key] = false;
  });
  window.addEventListener("blur", clearKeys);
  document.addEventListener("visibilitychange", function () { if (document.hidden) clearKeys(); });
}

/**
 * True if any listed code is down.
 * @param {string[]} codes
 */
function keyAny(codes) {
  for (var i = 0; i < codes.length; i++) {
    if (keys[codes[i]]) return true;
  }
  return false;
}

/* ---------- geometry helpers ---------- */

/**
 * AABB overlap test.
 */
function hits(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/* ---------- level (alpha corridor) ---------- */

/**
 * Build platforms and spawn points for the alpha stage.
 * World is wider than the canvas; camera follows the player.
 */
function makeLevel() {
  var L = CFG.level;
  return {
    platforms: L.platforms.map(function (p) { return { x: p.x, y: p.y, w: p.w, h: p.h }; }),
    enemies: L.enemies,
    gate: { x: L.gate.x, y: L.gate.y, w: L.gate.w, h: L.gate.h },
    width: L.width
  };
}

/* ---------- game state ---------- */

/** Canvas and 2D context. */
var canvas;
var ctx;

/** Live match state. */
var state;

/**
 * Create a fresh match.
 * @param {number} durationSec
 */
function newState(durationSec) {
  var level = makeLevel();
  return {
    running: true,
    won: false,
    lost: false,
    duration: durationSec,
    timeLeft: durationSec,
    lives: MAX_LIVES,
    hp: MAX_HP,
    score: 0,
    invuln: 0,
    fireCd: 0,
    camX: 0,
    player: {
      x: PC.start.x,
      y: PC.start.y,
      w: PC.w,
      h: PC.h,
      vx: 0,
      vy: 0,
      onGround: false,
      facing: 1
    },
    bullets: [],
    eBullets: [],
    level: level,
    enemies: level.enemies.map(function (e) {
      return {
        kind: e.kind,
        x: e.x,
        y: e.y,
        w: e.w,
        h: e.h,
        hp: e.hp,
        vx: e.vx,
        alive: true,
        shootCd: EC.shootCdBase + Math.random() * EC.shootCdRandom
      };
    })
  };
}

/* ---------- HUD ---------- */

/**
 * Refresh HUD text nodes.
 */
function updateHud() {
  document.getElementById("lives").textContent = "LIVES " + state.lives;
  document.getElementById("hp").textContent = "HP " + state.hp;
  document.getElementById("score").textContent = "SCORE " + state.score;
  document.getElementById("timer").textContent = "TIME " + Math.ceil(Math.max(0, state.timeLeft));
}

/* ---------- physics / combat ---------- */

/**
 * Resolve player vs platforms (simple vertical then horizontal).
 */
function collidePlatforms(body, platforms) {
  body.onGround = false;
  for (var i = 0; i < platforms.length; i++) {
    var p = platforms[i];
    if (!hits(body, p)) continue;
    var overlapX = Math.min(body.x + body.w, p.x + p.w) - Math.max(body.x, p.x);
    var overlapY = Math.min(body.y + body.h, p.y + p.h) - Math.max(body.y, p.y);
    if (overlapY < overlapX) {
      if (body.vy >= 0 && body.y + body.h - overlapY <= p.y + PC.landTolerance) {
        body.y = p.y - body.h;
        body.vy = 0;
        body.onGround = true;
      } else if (body.vy < 0) {
        body.y = p.y + p.h;
        body.vy = 0;
      }
    } else {
      if (body.x + body.w / 2 < p.x + p.w / 2) {
        body.x = p.x - body.w;
      } else {
        body.x = p.x + p.w;
      }
      body.vx = 0;
    }
  }
}

/**
 * Player takes a hit.
 */
function hurtPlayer() {
  if (state.invuln > 0) return;
  state.hp -= 1;
  state.invuln = PC.invulnTime;
  AudioBus.playSfx("hit");
  if (state.hp <= 0) {
    state.lives -= 1;
    state.hp = MAX_HP;
    state.player.x = Math.max(PC.respawnMinX, state.player.x - PC.respawnBack);
    state.player.y = PC.respawnY;
    state.player.vy = 0;
    if (state.lives <= 0) {
      fail(CFG.text.livesLost);
    }
  }
}

/**
 * End match as failure.
 * @param {string} msg
 */
function fail(msg) {
  state.running = false;
  state.lost = true;
  showOverlay(CFG.text.failed, msg);
}

/**
 * End match as clear.
 */
function win() {
  state.running = false;
  state.won = true;
  var bonus = Math.floor(state.timeLeft * CFG.timeBonusPerSecond);
  state.score += bonus;
  showOverlay(CFG.text.clear, "Time bonus " + bonus + " · Score " + state.score);
}

/**
 * Show end overlay.
 */
function showOverlay(title, msg) {
  document.getElementById("overlayTitle").textContent = title;
  document.getElementById("overlayMsg").textContent = msg;
  document.getElementById("overlay").classList.remove("hidden");
}

/**
 * Spawn a player bullet.
 */
function fire() {
  if (state.fireCd > 0) return;
  var p = state.player;
  state.bullets.push({
    x: p.x + (p.facing > 0 ? p.w : -BC.backOffset),
    y: p.y + BC.offsetY,
    w: BC.w,
    h: BC.h,
    vx: BULLET_SPEED * p.facing
  });
  state.fireCd = FIRE_COOLDOWN;
  AudioBus.playSfx("shoot");
}

/**
 * Advance one frame.
 * @param {number} dt
 */
function step(dt) {
  if (!state.running) return;

  state.timeLeft -= dt;
  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    fail(CFG.text.timeExpired);
    return;
  }

  state.invuln = Math.max(0, state.invuln - dt);
  state.fireCd = Math.max(0, state.fireCd - dt);

  var p = state.player;
  var left = keyAny(CFG.keys.left);
  var right = keyAny(CFG.keys.right);
  var jump = keyAny(CFG.keys.jump);
  var shoot = keyAny(CFG.keys.fire);

  p.vx = 0;
  if (left) {
    p.vx = -RUN_SPEED;
    p.facing = -1;
  }
  if (right) {
    p.vx = RUN_SPEED;
    p.facing = 1;
  }
  if (jump && p.onGround) {
    p.vy = JUMP_VEL;
    p.onGround = false;
    AudioBus.playSfx("jump");
  }
  if (shoot) fire();

  p.vy += GRAVITY * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  if (p.x < 0) p.x = 0;
  if (p.x > state.level.width - p.w) p.x = state.level.width - p.w;
  if (p.y > H + PC.fallMargin) {
    hurtPlayer();
    p.y = PC.respawnY;
    p.vy = 0;
  }

  collidePlatforms(p, state.level.platforms);

  /* camera */
  state.camX = Math.max(0, Math.min(p.x - PC.cameraLead, state.level.width - W));

  /* bullets */
  var i;
  for (i = state.bullets.length - 1; i >= 0; i--) {
    var b = state.bullets[i];
    b.x += b.vx * dt;
    if (b.x < state.camX - BC.despawnMargin || b.x > state.camX + W + BC.despawnMargin) {
      state.bullets.splice(i, 1);
    }
  }

  /* enemies */
  for (i = 0; i < state.enemies.length; i++) {
    var e = state.enemies[i];
    if (!e.alive) continue;
    if (e.kind === "drone") {
      e.x += e.vx * dt;
      if (e.x < EC.droneMinX || e.x > state.level.width - EC.droneEdge) e.vx *= -1;
      e.y += Math.sin(state.timeLeft * EC.droneBobSpeed + i) * EC.droneBobAmp * dt;
    }
    e.shootCd -= dt;
    if (e.kind === "turret" && e.shootCd <= 0 && Math.abs(e.x - p.x) < EC.turretRange) {
      var dir = p.x + p.w / 2 > e.x ? 1 : -1;
      state.eBullets.push({
        x: e.x + e.w / 2,
        y: e.y + EC.bulletOffsetY,
        w: EC.bulletW,
        h: EC.bulletH,
        vx: EC.bulletSpeed * dir
      });
      e.shootCd = EC.turretCooldown;
    }

    if (hits(p, e) && state.invuln <= 0) hurtPlayer();

    for (var j = state.bullets.length - 1; j >= 0; j--) {
      if (hits(state.bullets[j], e)) {
        state.bullets.splice(j, 1);
        e.hp -= 1;
        if (e.hp <= 0) {
          e.alive = false;
          state.score += e.kind === "turret" ? EC.scoreTurret : EC.scoreDrone;
          AudioBus.playSfx("explode");
        }
      }
    }
  }

  for (i = state.eBullets.length - 1; i >= 0; i--) {
    var eb = state.eBullets[i];
    eb.x += eb.vx * dt;
    if (eb.x < state.camX - BC.despawnMargin || eb.x > state.camX + W + BC.despawnMargin) {
      state.eBullets.splice(i, 1);
      continue;
    }
    if (hits(eb, p)) {
      state.eBullets.splice(i, 1);
      hurtPlayer();
    }
  }

  if (hits(p, state.level.gate)) win();
  updateHud();
}

/* ---------- render ---------- */

/**
 * Draw one frame.
 */
function draw() {
  ctx.fillStyle = COL.bg;
  ctx.fillRect(0, 0, W, H);

  var cam = state ? state.camX : 0;

  /* backdrop grid */
  ctx.strokeStyle = COL.grid;
  ctx.lineWidth = 1;
  var gx;
  for (gx = -((cam | 0) % COL.gridSpacing); gx < W; gx += COL.gridSpacing) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, H);
    ctx.stroke();
  }

  if (!state) return;

  /* platforms */
  var plats = state.level.platforms;
  var i;
  for (i = 0; i < plats.length; i++) {
    var pl = plats[i];
    ctx.fillStyle = COL.platform;
    ctx.fillRect(pl.x - cam, pl.y, pl.w, pl.h);
    ctx.fillStyle = COL.platformEdge;
    ctx.fillRect(pl.x - cam, pl.y, pl.w, 3);
  }

  /* gate */
  var g = state.level.gate;
  ctx.fillStyle = COL.gate;
  ctx.fillRect(g.x - cam, g.y, g.w, g.h);
  ctx.fillStyle = COL.gateGlow;
  ctx.fillRect(g.x - cam - 8, g.y, g.w + 16, g.h);

  /* enemies */
  for (i = 0; i < state.enemies.length; i++) {
    var e = state.enemies[i];
    if (!e.alive) continue;
    ctx.fillStyle = e.kind === "turret" ? COL.turret : COL.drone;
    ctx.fillRect(e.x - cam, e.y, e.w, e.h);
  }

  /* bullets */
  ctx.fillStyle = COL.bullet;
  for (i = 0; i < state.bullets.length; i++) {
    var b = state.bullets[i];
    ctx.fillRect(b.x - cam, b.y, b.w, b.h);
  }
  ctx.fillStyle = COL.enemyBullet;
  for (i = 0; i < state.eBullets.length; i++) {
    var eb = state.eBullets[i];
    ctx.fillRect(eb.x - cam, eb.y, eb.w, eb.h);
  }

  /* player */
  var p = state.player;
  var blink = state.invuln > 0 && ((state.invuln * 20) | 0) % 2 === 0;
  if (!blink) {
    ctx.fillStyle = COL.player;
    ctx.fillRect(p.x - cam, p.y, p.w, p.h);
    ctx.fillStyle = COL.playerGun;
    ctx.fillRect(p.x - cam + (p.facing > 0 ? p.w - 4 : 0), p.y + 10, 4, 8);
  }

  if (state.paused) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 32px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(CFG.text.paused, W / 2, H / 2);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }
}

/* ---------- loop ---------- */

/** Last timestamp for dt. */
var lastTs = 0;

/**
 * rAF loop.
 */
function loop(ts) {
  if (!lastTs) lastTs = ts;
  var dt = Math.min(CFG.maxDt, (ts - lastTs) / 1000);
  lastTs = ts;
  if (state && state.running) step(dt);
  draw();
  requestAnimationFrame(loop);
}

/* ---------- boot ---------- */

/**
 * Start a match from the selected duration.
 */
function startGame() {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  clearKeys();
  var sel = document.getElementById("duration");
  var dur = parseInt(sel.value, 10) || DEFAULT_DURATION;
  state = newState(dur);
  document.getElementById("menu").classList.add("hidden");
  document.getElementById("overlay").classList.add("hidden");
  updateHud();
}

/**
 * Back to the start menu (from the end screen or a running / paused match).
 */
function showMenu() {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  if (state) { state.running = false; state.paused = false; }
  clearKeys();
  document.getElementById("overlay").classList.add("hidden");
  document.getElementById("menu").classList.remove("hidden");
}

/**
 * Pause / resume a running match.
 */
function togglePause() {
  if (!state) return;
  if (state.paused) {
    state.paused = false;
    state.running = true;
  } else if (state.running) {
    state.paused = true;
    state.running = false;
    clearKeys();
  }
}

/**
 * Wire UI and start the render loop.
 */
function init() {
  canvas = document.getElementById("game");
  ctx = canvas.getContext("2d");
  bindInput();
  document.getElementById("startBtn").addEventListener("click", startGame);
  document.getElementById("retryBtn").addEventListener("click", showMenu);
  requestAnimationFrame(loop);
}

init();
