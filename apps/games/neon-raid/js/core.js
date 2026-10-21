/* Neon Raid — core: config aliases, audio stub, geometry, level and match state, HUD. */

/* ---------- config aliases (values live in js/config.js) ---------- */
var CFG = NEON_RAID_CONFIG;
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
    platforms: L.platforms.map(function (p) { return { x: p.x, y: p.y, w: p.w, h: p.h, solid: !!p.solid }; }),
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
      coyote: 0,        /* s left to still jump after leaving the ground */
      jumpBuf: 0,       /* s left on a buffered jump press */
      jumpHeld: false,  /* jump key state last frame (press = edge) */
      jumpCutDone: true, /* the short-hop cut is applied once per jump */
      prevBottom: 0,    /* feet y before this frame's move (one-way platforms) */
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
