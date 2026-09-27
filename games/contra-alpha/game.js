/**
 * Neon Raid — Contra-style Alpha
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

/* ---------- config (changeable without rewriting systems) ---------- */

/** Default mission length in seconds (overridden by menu). */
var DEFAULT_DURATION = 250;

/** Player hit points per life. */
var MAX_HP = 2;

/** Starting lives. */
var MAX_LIVES = 3;

/** World pixels per second for run speed. */
var RUN_SPEED = 220;

/** Jump impulse (px/s). */
var JUMP_VEL = -520;

/** Gravity (px/s^2). */
var GRAVITY = 1400;

/** Bullet speed. */
var BULLET_SPEED = 520;

/** Fire cooldown in seconds. */
var FIRE_COOLDOWN = 0.16;

/** Canvas logical size. */
var W = 960;
var H = 540;

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
 * Bind keyboard listeners.
 */
function bindInput() {
  window.addEventListener("keydown", function (e) {
    keys[e.code] = true;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].indexOf(e.code) >= 0) {
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", function (e) {
    keys[e.code] = false;
  });
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
  var platforms = [
    { x: 0, y: 480, w: 4200, h: 60 },
    { x: 280, y: 380, w: 160, h: 16 },
    { x: 560, y: 320, w: 140, h: 16 },
    { x: 820, y: 380, w: 180, h: 16 },
    { x: 1180, y: 300, w: 200, h: 16 },
    { x: 1500, y: 360, w: 120, h: 16 },
    { x: 1720, y: 280, w: 220, h: 16 },
    { x: 2100, y: 360, w: 160, h: 16 },
    { x: 2400, y: 300, w: 240, h: 16 },
    { x: 2780, y: 380, w: 140, h: 16 },
    { x: 3100, y: 320, w: 200, h: 16 },
    { x: 3480, y: 260, w: 180, h: 16 },
    { x: 3800, y: 360, w: 220, h: 16 }
  ];

  var enemies = [
    { kind: "drone", x: 520, y: 250, w: 28, h: 22, hp: 1, vx: 40 },
    { kind: "drone", x: 900, y: 200, w: 28, h: 22, hp: 1, vx: -50 },
    { kind: "turret", x: 1280, y: 276, w: 32, h: 24, hp: 2, vx: 0 },
    { kind: "drone", x: 1600, y: 180, w: 28, h: 22, hp: 1, vx: 55 },
    { kind: "turret", x: 2140, y: 336, w: 32, h: 24, hp: 2, vx: 0 },
    { kind: "drone", x: 2500, y: 160, w: 28, h: 22, hp: 1, vx: -45 },
    { kind: "drone", x: 2850, y: 220, w: 28, h: 22, hp: 1, vx: 40 },
    { kind: "turret", x: 3180, y: 296, w: 32, h: 24, hp: 2, vx: 0 },
    { kind: "drone", x: 3550, y: 140, w: 28, h: 22, hp: 1, vx: -60 },
    { kind: "turret", x: 3920, y: 336, w: 32, h: 24, hp: 3, vx: 0 }
  ];

  /** End gate — reach this to clear before time runs out. */
  var gate = { x: 4080, y: 360, w: 36, h: 120 };

  return { platforms: platforms, enemies: enemies, gate: gate, width: 4200 };
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
      x: 80,
      y: 400,
      w: 22,
      h: 36,
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
        shootCd: 1 + Math.random()
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
      if (body.vy >= 0 && body.y + body.h - overlapY <= p.y + 8) {
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
  state.invuln = 1.1;
  AudioBus.playSfx("hit");
  if (state.hp <= 0) {
    state.lives -= 1;
    state.hp = MAX_HP;
    state.player.x = Math.max(40, state.player.x - 80);
    state.player.y = 360;
    state.player.vy = 0;
    if (state.lives <= 0) {
      fail("All lives lost.");
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
  showOverlay("MISSION FAILED", msg);
}

/**
 * End match as clear.
 */
function win() {
  state.running = false;
  state.won = true;
  var bonus = Math.floor(state.timeLeft * 10);
  state.score += bonus;
  showOverlay("SECTOR CLEAR", "Time bonus " + bonus + " · Score " + state.score);
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
    x: p.x + (p.facing > 0 ? p.w : -8),
    y: p.y + 12,
    w: 10,
    h: 4,
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
    fail("Time expired.");
    return;
  }

  state.invuln = Math.max(0, state.invuln - dt);
  state.fireCd = Math.max(0, state.fireCd - dt);

  var p = state.player;
  var left = keyAny(["ArrowLeft", "KeyA"]);
  var right = keyAny(["ArrowRight", "KeyD"]);
  var jump = keyAny(["ArrowUp", "KeyW", "Space"]);
  var shoot = keyAny(["KeyZ", "KeyX", "ControlLeft", "ControlRight"]);

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
  if (p.y > H + 80) {
    hurtPlayer();
    p.y = 360;
    p.vy = 0;
  }

  collidePlatforms(p, state.level.platforms);

  /* camera */
  state.camX = Math.max(0, Math.min(p.x - 200, state.level.width - W));

  /* bullets */
  var i;
  for (i = state.bullets.length - 1; i >= 0; i--) {
    var b = state.bullets[i];
    b.x += b.vx * dt;
    if (b.x < state.camX - 40 || b.x > state.camX + W + 40) {
      state.bullets.splice(i, 1);
    }
  }

  /* enemies */
  for (i = 0; i < state.enemies.length; i++) {
    var e = state.enemies[i];
    if (!e.alive) continue;
    if (e.kind === "drone") {
      e.x += e.vx * dt;
      if (e.x < 200 || e.x > state.level.width - 80) e.vx *= -1;
      e.y += Math.sin(state.timeLeft * 3 + i) * 20 * dt;
    }
    e.shootCd -= dt;
    if (e.kind === "turret" && e.shootCd <= 0 && Math.abs(e.x - p.x) < 520) {
      var dir = p.x + p.w / 2 > e.x ? 1 : -1;
      state.eBullets.push({
        x: e.x + e.w / 2,
        y: e.y + 8,
        w: 8,
        h: 4,
        vx: 280 * dir
      });
      e.shootCd = 1.4;
    }

    if (hits(p, e) && state.invuln <= 0) hurtPlayer();

    for (var j = state.bullets.length - 1; j >= 0; j--) {
      if (hits(state.bullets[j], e)) {
        state.bullets.splice(j, 1);
        e.hp -= 1;
        if (e.hp <= 0) {
          e.alive = false;
          state.score += e.kind === "turret" ? 250 : 100;
          AudioBus.playSfx("explode");
        }
      }
    }
  }

  for (i = state.eBullets.length - 1; i >= 0; i--) {
    var eb = state.eBullets[i];
    eb.x += eb.vx * dt;
    if (eb.x < state.camX - 40 || eb.x > state.camX + W + 40) {
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
  ctx.fillStyle = "#070914";
  ctx.fillRect(0, 0, W, H);

  var cam = state ? state.camX : 0;

  /* backdrop grid */
  ctx.strokeStyle = "rgba(60,240,255,0.06)";
  ctx.lineWidth = 1;
  var gx;
  for (gx = -((cam | 0) % 48); gx < W; gx += 48) {
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
    ctx.fillStyle = "#1a2438";
    ctx.fillRect(pl.x - cam, pl.y, pl.w, pl.h);
    ctx.fillStyle = "#3cf0ff";
    ctx.fillRect(pl.x - cam, pl.y, pl.w, 3);
  }

  /* gate */
  var g = state.level.gate;
  ctx.fillStyle = "#ff3d9a";
  ctx.fillRect(g.x - cam, g.y, g.w, g.h);
  ctx.fillStyle = "rgba(255,61,154,0.25)";
  ctx.fillRect(g.x - cam - 8, g.y, g.w + 16, g.h);

  /* enemies */
  for (i = 0; i < state.enemies.length; i++) {
    var e = state.enemies[i];
    if (!e.alive) continue;
    ctx.fillStyle = e.kind === "turret" ? "#ff6b3c" : "#7cf0ff";
    ctx.fillRect(e.x - cam, e.y, e.w, e.h);
  }

  /* bullets */
  ctx.fillStyle = "#fff6a8";
  for (i = 0; i < state.bullets.length; i++) {
    var b = state.bullets[i];
    ctx.fillRect(b.x - cam, b.y, b.w, b.h);
  }
  ctx.fillStyle = "#ff4d6d";
  for (i = 0; i < state.eBullets.length; i++) {
    var eb = state.eBullets[i];
    ctx.fillRect(eb.x - cam, eb.y, eb.w, eb.h);
  }

  /* player */
  var p = state.player;
  var blink = state.invuln > 0 && ((state.invuln * 20) | 0) % 2 === 0;
  if (!blink) {
    ctx.fillStyle = "#3cf0ff";
    ctx.fillRect(p.x - cam, p.y, p.w, p.h);
    ctx.fillStyle = "#ff3d9a";
    ctx.fillRect(p.x - cam + (p.facing > 0 ? p.w - 4 : 0), p.y + 10, 4, 8);
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
  var dt = Math.min(0.033, (ts - lastTs) / 1000);
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
  var sel = document.getElementById("duration");
  var dur = parseInt(sel.value, 10) || DEFAULT_DURATION;
  state = newState(dur);
  document.getElementById("menu").classList.add("hidden");
  document.getElementById("overlay").classList.add("hidden");
  updateHud();
}

/**
 * Wire UI and start the render loop.
 */
function init() {
  canvas = document.getElementById("game");
  ctx = canvas.getContext("2d");
  bindInput();
  document.getElementById("startBtn").addEventListener("click", startGame);
  document.getElementById("retryBtn").addEventListener("click", function () {
    document.getElementById("overlay").classList.add("hidden");
    document.getElementById("menu").classList.remove("hidden");
  });
  requestAnimationFrame(loop);
}

init();
