/**
 * Neon Raid — Contra-style Alpha
 * Game logic. Tunables come from CONTRA_ALPHA_CONFIG (contra-alpha_config.js).
 *
 * HTML + CSS + JS canvas run-and-gun.
 * Theme: futuristic neon (skinnable later).
 * Lives: 3. HP per life: 2.
 * Timer: 250 / 200 / 150 / 100 seconds (menu).
 * Input: keyboard, on-screen touch, Gamepad API, and the hub D-pad postMessage path.
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

/**
 * Held codes per source. keys[] is the OR of every source, so keyboard, touch,
 * a gamepad and the hub controller can be down at the same time.
 *   board — physical / synthetic keyboard
 *   touch — on-screen buttons
 *   pad   — Gamepad API (rewritten each frame)
 *   hub   — hub-dpad / hub-key postMessage
 *   stick — hub-stick postMessage (separate so a recenter does not drop the d-pad)
 */
var hold = { board: {}, touch: {}, pad: {}, hub: {}, stick: {} };
var HOLD_SOURCES = ["board", "touch", "pad", "hub", "stick"];

/** Key state map. Gameplay reads this and nothing else. */
var keys = {};

/** Last screen action, so the hub's follow-up message for that same code does not repeat it. */
var edgeStamp = 0;
var edgeCode = "";

/** Previous Start / Select so gamepad edges fire once per press. */
var padWas = { start: false, select: false };

/**
 * True if the event's code or key is in the list.
 * @param {string[]} list
 * @param {KeyboardEvent} e
 */
function keyIn(list, e) {
  return list.indexOf(e.code) >= 0 || list.indexOf(e.key) >= 0;
}

/**
 * True if a code or key name is in the list.
 * @param {string[]} list
 * @param {string} code
 * @param {string} key
 */
function codeIn(list, code, key) {
  return (code && list.indexOf(code) >= 0) || (key && list.indexOf(key) >= 0);
}

/** Recompute one code from every source. */
function refreshKey(code) {
  if (!code) return;
  var down = false;
  for (var i = 0; i < HOLD_SOURCES.length; i++) {
    if (hold[HOLD_SOURCES[i]][code]) down = true;
  }
  keys[code] = down;
}

/**
 * Set or clear one source. Other sources that still hold the code keep it down.
 * @param {string} source
 * @param {string} code
 * @param {boolean} down
 */
function setHold(source, code, down) {
  if (!code || !hold[source]) return;
  if (down) hold[source][code] = true;
  else delete hold[source][code];
  refreshKey(code);
}

/** Forget every held key (focus lost / screen change: the keyup may never arrive). */
function clearKeys() {
  var s, code, i;
  for (s in hold) {
    for (code in hold[s]) delete hold[s][code];
  }
  for (code in keys) keys[code] = false;
  var nodes = document.querySelectorAll("#touch [data-code]");
  for (i = 0; i < nodes.length; i++) {
    nodes[i]._ptrs = {};
    nodes[i].classList.remove("held");
  }
}

/** True while the start menu / end overlay is on screen. */
function isShown(id) {
  return !document.getElementById(id).classList.contains("hidden");
}

/**
 * Remember that a screen action just ran for this code.
 * The hub posts hub-dpad / hub-key just after it dispatches the same key.
 * @param {string} code
 */
function markEdge(code) {
  edgeCode = code || "";
  edgeStamp = Date.now();
}

/**
 * True when this code's screen action already ran (keyboard, then the hub message).
 * @param {string} code
 */
function edgeTaken(code) {
  return !!code && code === edgeCode && Date.now() - edgeStamp < 120;
}

/**
 * Menu / end-screen / pause action for a code (keyboard, gamepad Start, or hub).
 * @param {string} code
 * @param {string} key
 * @return {boolean} true if a screen changed
 */
function runScreenAction(code, key) {
  var acted = false;
  if (isShown("menu")) {
    if (codeIn(CFG.keys.start, code, key)) { startGame(); acted = true; }
  } else if (isShown("overlay")) {
    if (codeIn(CFG.keys.start, code, key)) { startGame(); acted = true; }
    else if (codeIn(CFG.keys.menu, code, key)) { showMenu(); acted = true; }
  } else if (state && (state.running || state.paused)) {
    if (codeIn(CFG.keys.pause, code, key)) { togglePause(); acted = true; }
    else if (codeIn(CFG.keys.menu, code, key)) { showMenu(); acted = true; }
  }
  if (acted) markEdge(code);
  return acted;
}

/**
 * Menu / end-screen / pause keys (Enter / Space / Escape).
 * @param {KeyboardEvent} e
 */
function onScreenKey(e) {
  if (runScreenAction(e.code, e.key)) e.preventDefault();
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
    if (e.code) setHold("board", e.code, true);
    if (e.key && e.key !== e.code) keys[e.key] = true;
    if (keyIn(CFG.keys.preventDefault, e)) {
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", function (e) {
    if (e.code) setHold("board", e.code, false);
    if (e.key && e.key !== e.code) keys[e.key] = false;
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

/** Lock gestures while a match is running or paused. The menu can still scroll inside itself. */
function syncChrome() {
  document.body.classList.toggle("playing", !!(state && (state.running || state.paused)));
}

/**
 * Show the on-screen pad on touch devices only (coarse pointer or a touch screen).
 */
function detectTouch() {
  var mq = window.matchMedia("(pointer: coarse)");
  function apply() {
    var on = mq.matches || (navigator.maxTouchPoints || 0) > 0;
    document.body.classList.toggle("touch-device", !!on);
  }
  apply();
  if (mq.addEventListener) mq.addEventListener("change", apply);
  else if (mq.addListener) mq.addListener(apply);
}

/**
 * Hold an on-screen button for as long as its own pointer is down.
 * Each button tracks pointer ids, so left + jump + fire work together.
 * @param {HTMLElement} el
 */
function bindHold(el) {
  var code = el.getAttribute("data-code");
  el._ptrs = {};
  function down(e) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    el._ptrs[e.pointerId] = true;
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    setHold("touch", code, true);
    el.classList.add("held");
  }
  function up(e) {
    if (!el._ptrs) return;
    delete el._ptrs[e.pointerId];
    var any = false;
    for (var id in el._ptrs) any = true;
    if (!any) {
      setHold("touch", code, false);
      el.classList.remove("held");
    }
  }
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  el.addEventListener("lostpointercapture", up);
}

/** One-shot on-screen button (pause / menu). */
function bindTap(el, fn) {
  el.addEventListener("pointerdown", function (e) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    fn();
  });
}

/**
 * On-screen controls write the same codes the keyboard uses.
 * Scroll, pinch-zoom and the long-press menu are cancelled while playing.
 */
function bindTouch() {
  var holds = document.querySelectorAll("#touch [data-code]");
  var i;
  for (i = 0; i < holds.length; i++) bindHold(holds[i]);
  bindTap(document.getElementById("tPause"), function () {
    if (state && (state.running || state.paused)) togglePause();
  });
  bindTap(document.getElementById("tMenu"), function () {
    if (isShown("overlay") || (state && (state.running || state.paused))) showMenu();
  });
  document.addEventListener("touchmove", function (e) {
    var onPad = e.target && e.target.closest && e.target.closest("#touch");
    if (onPad || (state && (state.running || state.paused))) e.preventDefault();
  }, { passive: false });
  document.addEventListener("gesturestart", function (e) { e.preventDefault(); });
  document.addEventListener("contextmenu", function (e) {
    var t = e.target;
    var onGame = t && t.closest && (t.closest("#touch") || t.closest("#frame"));
    if (onGame || (state && (state.running || state.paused))) e.preventDefault();
  });
}

/**
 * First connected standard gamepad, or null.
 */
function readPad() {
  if (!navigator.getGamepads) return null;
  var list;
  try { list = navigator.getGamepads(); } catch (err) { return null; }
  if (!list) return null;
  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].connected) return list[i];
  }
  return null;
}

/**
 * @param {Gamepad} pad
 * @param {number} index
 */
function padPressed(pad, index) {
  var b = pad.buttons && pad.buttons[index];
  return !!(b && (b.pressed || b.value > 0.5));
}

/**
 * Sample the Gamepad API once per frame onto the keyboard codes.
 * D-pad / left stick move, stick or d-pad up jumps, A jumps, B / X fire, Start pauses.
 */
function pollGamepad() {
  var pad = readPad();
  var dz = (CFG.gamepad && CFG.gamepad.deadzone) || 0.4;
  var left = false, right = false, up = false;
  var a = false, b = false, x = false, start = false, select = false;
  if (pad) {
    var ax = pad.axes && pad.axes.length > 0 ? pad.axes[0] : 0;
    var ay = pad.axes && pad.axes.length > 1 ? pad.axes[1] : 0;
    left = ax < -dz || padPressed(pad, 14);
    right = ax > dz || padPressed(pad, 15);
    up = ay < -dz || padPressed(pad, 12);
    a = padPressed(pad, 0);
    b = padPressed(pad, 1);
    x = padPressed(pad, 2);
    start = padPressed(pad, 9);
    select = padPressed(pad, 8);
  }
  setHold("pad", "ArrowLeft", left);
  setHold("pad", "ArrowRight", right);
  setHold("pad", "ArrowUp", up);
  setHold("pad", "Space", a);
  setHold("pad", "KeyX", b);
  setHold("pad", "KeyZ", x);
  if (start && !padWas.start) runScreenAction("Enter", "Enter");
  if (select && !padWas.select) runScreenAction("Escape", "Escape");
  padWas.start = start;
  padWas.select = select;
}

/**
 * Hub phone controller button name → keyboard code.
 * Same map the hub injects as KeyboardEvents (hub/controller/hub-controller.js).
 */
var HUB_BTN = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  a: "Space",
  b: "KeyX",
  x: "KeyZ",
  y: "KeyC",
  l: "KeyQ",
  r: "KeyE",
  start: "Enter",
  select: "Escape"
};

/**
 * Apply one hub button / key. The hub also dispatches a KeyboardEvent before this
 * message; edgeTaken() keeps Start / Select / A from firing twice. A press that
 * leaves the menu is not held, so it does not immediately jump.
 * @param {string} code
 * @param {boolean} down
 */
function onHubCode(code, down) {
  if (!code) return;
  if (!down) {
    setHold("hub", code, false);
    return;
  }
  var alias = code === "Space" ? " " : code;
  if (edgeTaken(code)) {
    if (!hold.board[code]) return;
    setHold("hub", code, true);
    return;
  }
  var before = isShown("menu") || isShown("overlay");
  runScreenAction(code, alias);
  if (before && !(isShown("menu") || isShown("overlay"))) return;
  setHold("hub", code, true);
}

/**
 * Hub D-pad postMessage path. Same-origin parent only.
 *   {type:'hub-dpad', b, s:1|0}   buttons
 *   {type:'hub-stick', x, y}      left stick, -1..1 (up is negative)
 *   {type:'hub-key', code, key, s} keyboard mode
 */
function onHubMessage(e) {
  if (e.source !== window.parent) return;
  var originOk = e.origin === location.origin || e.origin === "null" || location.origin === "null" ||
    String(e.origin).indexOf("file:") === 0;
  if (!originOk) return;
  var d = e.data;
  if (!d || typeof d !== "object") return;
  if (d.type === "hub-dpad") {
    onHubCode(HUB_BTN[d.b], !!d.s);
    return;
  }
  if (d.type === "hub-key") {
    onHubCode(d.code || d.key, !!d.s);
    return;
  }
  if (d.type === "hub-stick") {
    var x = Number(d.x), y = Number(d.y);
    if (!isFinite(x) || !isFinite(y)) return;
    var dz = (CFG.gamepad && CFG.gamepad.deadzone) || 0.4;
    setHold("stick", "ArrowLeft", x < -dz);
    setHold("stick", "ArrowRight", x > dz);
    setHold("stick", "ArrowUp", y < -dz);
  }
}

/** Listen for the hub controller. Keyboard forwarding from the hub keeps working too. */
function bindHub() {
  window.addEventListener("message", onHubMessage);
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

/* ---------- physics / combat ---------- */

/**
 * Resolve player vs platforms (simple vertical then horizontal).
 */
function collidePlatforms(body, platforms) {
  body.onGround = false;
  for (var i = 0; i < platforms.length; i++) {
    var p = platforms[i];
    if (!p.solid) {
      /* One-way platform: land only when falling and the feet were at/above the top last frame.
         Rising through it or walking under/past it never collides (no snagging). */
      var bottom = body.y + body.h;
      if (body.vy >= 0 &&
          body.x + body.w > p.x && body.x < p.x + p.w &&
          body.prevBottom <= p.y + PC.oneWayEps && bottom >= p.y) {
        body.y = p.y - body.h;
        body.vy = 0;
        body.onGround = true;
      }
      continue;
    }
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
  syncChrome();
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
  /* Jump: triggered on the press (edge), buffered briefly, with coyote time after leaving a ledge */
  var pressed = jump && !p.jumpHeld;
  p.jumpHeld = jump;
  if (pressed) p.jumpBuf = PC.jumpBuffer;
  else p.jumpBuf = Math.max(0, p.jumpBuf - dt);
  if (p.onGround) p.coyote = PC.coyoteTime;
  else p.coyote = Math.max(0, p.coyote - dt);
  if (p.jumpBuf > 0 && p.coyote > 0) {
    p.vy = JUMP_VEL;
    p.onGround = false;
    p.coyote = 0;
    p.jumpBuf = 0;
    p.jumpCutDone = false;
    AudioBus.playSfx("jump");
  }
  /* Variable height: letting go while rising cuts the jump short */
  if (!jump && p.vy < 0 && !p.jumpCutDone) { p.vy *= PC.jumpCut; p.jumpCutDone = true; }
  if (shoot) fire();

  /* Exact constant-gravity integration: same jump height at any frame rate */
  p.prevBottom = p.y + p.h;
  p.x += p.vx * dt;
  p.y += p.vy * dt + 0.5 * GRAVITY * dt * dt;
  p.vy += GRAVITY * dt;

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
        /* Two bullets can overlap one enemy in the same frame. Count the kill once. */
        if (!e.alive) continue;
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
  pollGamepad();
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
  syncChrome();
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
  syncChrome();
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
  syncChrome();
}

/**
 * Wire UI and start the render loop.
 */
function init() {
  canvas = document.getElementById("game");
  ctx = canvas.getContext("2d");
  bindInput();
  bindTouch();
  bindHub();
  detectTouch();
  document.getElementById("startBtn").addEventListener("click", startGame);
  document.getElementById("retryBtn").addEventListener("click", startGame);
  document.getElementById("menuBtn").addEventListener("click", showMenu);
  requestAnimationFrame(loop);
}

init();
