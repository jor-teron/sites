/*
 * ========================================================================
 * Ping Pong — game logic
 * All state, drawing, input, physics, simple AI and the hub bridge live here.
 * Every tunable value comes from PONG_CONFIG (pong_config.js).
 * The court is COURT_W x COURT_H game units; COURT_H follows the free space
 * (court.minAspect … maxAspect) and the canvas is scaled to fit (fitCourt).
 * First to WIN_SCORE wins; Start / Enter (or hub "New Game") plays again.
 * Touch / mouse (pointer events, PONG_CONFIG.touch): drag on the left half moves the
 * left paddle; a touch on the right half makes it a 2-player match (CPU off until the
 * match restarts); a short tap starts / resumes / plays again. Pause button in the
 * court's corner.
 * ========================================================================
 */

const CFG = PONG_CONFIG;
const APP = CFG.APP || { name: "Ping Pong", version: "" };
const WIN_SCORE = Number(CFG.WIN_SCORE) || 0;

// --- DOM handles --------------------------------------------------------

const canvas = document.getElementById("court");
const ctx = canvas.getContext("2d");
const hud = document.getElementById("hud");
const topbar = document.getElementById("topbar");
const pauseBtn = document.getElementById("pause-btn");
const TOUCH = CFG.touch || {};

// Title from APP info
document.querySelector("h1").textContent = APP.name;
document.title = APP.name;

// --- Court constants (from config) --------------------------------------

const COURT_W = CFG.court.width;
const BASE_H = CFG.court.baseHeight || 480;
const PADDLE_W = CFG.paddle.width;
const PADDLE_MARGIN = CFG.paddle.margin;
const BALL_R = CFG.ball.radius;
const BALL_SPEED = CFG.ball.speed;
const BALL_SPEED_BUMP = CFG.ball.speedBump;
const BALL_SPEED_MAX = CFG.ball.speedMax;

// Height-dependent values (set by setCourtHeight)
let COURT_H = BASE_H;
let PADDLE_H = CFG.paddle.height;
let PLAYER_SPEED = CFG.paddle.playerSpeed;
let AI_SPEED = CFG.paddle.aiSpeed;

// --- Mutable game state -------------------------------------------------

let leftY = (COURT_H - PADDLE_H) / 2;   // left paddle top
let rightY = (COURT_H - PADDLE_H) / 2;  // right paddle top
let ballX = COURT_W / 2;
let ballY = COURT_H / 2;
let ballVX = BALL_SPEED;
let ballVY = 0;
let scoreL = CFG.start.scoreLeft;
let scoreR = CFG.start.scoreRight;
let paused = CFG.start.paused;          // true while the match is frozen
let waitingServe = true;                // true after a point until serve
let winner = "";                        // "" | "L" | "R" (match over)
let serveTimer = 0;
let scale = 1;                          // CSS px per game unit

// Held keys map
const keys = Object.create(null);

// Pointer control: target paddle top (game units) per side, null = not steered
let leftTarget = null;
let rightTarget = null;
let twoP = false;                       // right paddle is a second player (CPU off)
const pointers = new Map();             // pointerId -> { side, x, y, t, moved }

// --- Court size ---------------------------------------------------------

/** Set the court height (game units); paddle size / speeds follow it, positions keep their place. */
function setCourtHeight(h) {
  const k = h / COURT_H;
  COURT_H = h;
  const r = h / BASE_H;
  PADDLE_H = CFG.paddle.height * r;
  PLAYER_SPEED = CFG.paddle.playerSpeed * r;
  AI_SPEED = CFG.paddle.aiSpeed * r;
  leftY = clamp(leftY * k, 0, COURT_H - PADDLE_H);
  rightY = clamp(rightY * k, 0, COURT_H - PADDLE_H);
  ballY = clamp(ballY * k, BALL_R, COURT_H - BALL_R);
}

/** Fit the court to the free space of the page / hub frame (DPR-sharp canvas). */
function fitCourt() {
  const cs = getComputedStyle(document.body);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const gap = parseFloat(cs.rowGap) || 0;
  const border = 4; // canvas border (2px each side)
  const barH = topbar && topbar.offsetParent !== null ? topbar.offsetHeight + gap : 0;
  const availW = Math.max(100, window.innerWidth - padX - border);
  const availH = Math.max(80, window.innerHeight - padY - barH - border);
  const aspect = clamp(availH / availW, CFG.court.minAspect || 0.45, CFG.court.maxAspect || 1);
  const h = Math.round(COURT_W * aspect);
  if (h !== COURT_H) setCourtHeight(h);
  scale = Math.min(availW / COURT_W, availH / COURT_H);
  const cssW = Math.floor(COURT_W * scale);
  const cssH = Math.floor(COURT_H * scale);
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(canvas.width / COURT_W, 0, 0, canvas.height / COURT_H, 0, 0);
}

// --- Input handlers -----------------------------------------------------

/** True if the event's code or key is in the list. */
function keyIn(list, e) {
  return !!list && (list.indexOf(e.code) >= 0 || list.indexOf(e.key) >= 0);
}

/** True if any of the listed keys (code or key names) is held. */
function held(list) {
  return list.some(function (k) { return keys[k]; });
}

/** Forget every held key (focus lost: the keyup would never arrive). */
function clearKeys() {
  for (const k in keys) keys[k] = false;
}

function togglePause() {
  if (winner) return;
  paused = !paused;
  updateHud();
}

/** Tap / pause button / Start: new match after a win, else resume a pause (tap) or toggle. */
function tapAction() {
  if (winner) resetMatch();
  else if (paused) togglePause();
}

/**
 * Start (Enter / P): new match after a win, else pause / resume.
 * Pause (Space / A): pause / resume. Restart (Esc / R): full match reset.
 */
function onKeyDown(e) {
  if (e.code) keys[e.code] = true;
  if (e.key) keys[e.key] = true;
  if (keyIn(CFG.keys.up, e) || keyIn(CFG.keys.down, e)) {
    e.preventDefault();
    leftTarget = null;                  // keys take over from mouse / touch (last input wins)
  }

  if (keyIn(CFG.keys.start, e)) {
    e.preventDefault();
    if (!e.repeat) { if (winner) resetMatch(); else togglePause(); }
    return;
  }
  if (keyIn(CFG.keys.pause, e)) {
    e.preventDefault();
    if (!e.repeat) togglePause();
    return;
  }
  if (keyIn(CFG.keys.restart, e)) {
    e.preventDefault();
    if (!e.repeat) resetMatch();
  }
}

/** Mark a key as released. */
function onKeyUp(e) {
  if (e.code) keys[e.code] = false;
  if (e.key) keys[e.key] = false;
}

window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);
window.addEventListener("blur", clearKeys);
document.addEventListener("visibilitychange", function () { if (document.hidden) clearKeys(); });
window.addEventListener("resize", fitCourt);

// --- Helpers ------------------------------------------------------------

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Reset paddles and ball for a new serve.
 * dir: +1 serve toward AI, -1 serve toward player.
 */
function serve(dir) {
  clearTimeout(serveTimer);
  leftY = (COURT_H - PADDLE_H) / 2;
  rightY = (COURT_H - PADDLE_H) / 2;
  ballX = COURT_W / 2;
  ballY = COURT_H / 2;
  ballVX = BALL_SPEED * dir;
  ballVY = (Math.random() * 2 - 1) * CFG.ball.serveMaxVY;
  waitingServe = false;
}

/** Zero scores and serve toward the AI (Restart key, Start after a win, hub New Game). */
function resetMatch() {
  clearTimeout(serveTimer);
  scoreL = CFG.start.scoreLeft;
  scoreR = CFG.start.scoreRight;
  paused = false;
  winner = "";
  waitingServe = false;
  setTwoPlayer(false);                  // back to the CPU on every new match
  serve(CFG.ball.firstServeDir);
  updateHud();
}

/** Right paddle: second player (touch on the right half) or CPU. */
function setTwoPlayer(on) {
  on = !!on;
  if (on === twoP) return;
  twoP = on;
  rightTarget = null;
  updateHud();
  if (hubLinked) hubSendApp();          // labels You / CPU <-> P1 / P2
}

/** Refresh the HUD string (scores + pause) and the hub header stats. */
function updateHud() {
  const extra = paused ? CFG.text.pausedSuffix : "";
  const tag = twoP ? "  ·  " + (CFG.text.twoPlayerTag || "2P") : "";
  hud.textContent = scoreL + CFG.text.scoreSeparator + scoreR + tag + extra;
  if (pauseBtn) {
    const showPlay = paused || !!winner;
    pauseBtn.textContent = showPlay ? "▶" : "⏸";
    const t = showPlay ? (CFG.text.resumeTitle || "Resume") : (CFG.text.pauseTitle || "Pause");
    pauseBtn.title = t;
    pauseBtn.setAttribute("aria-label", t);
  }
  hubSendStats();
}

/** A side scored: win check, else serve after serveDelayMs toward dir. */
function pointScored(dir) {
  waitingServe = true;
  hubRumble(CFG.rumble && CFG.rumble.point);   // buzz the paired phone on every point
  if (WIN_SCORE > 0 && (scoreL >= WIN_SCORE || scoreR >= WIN_SCORE)) {
    winner = scoreL >= WIN_SCORE ? "L" : "R";
    ballX = COURT_W / 2;
    ballY = COURT_H / 2;
    updateHud();
    return;
  }
  updateHud();
  clearTimeout(serveTimer);
  serveTimer = setTimeout(function () { serve(dir); }, CFG.ball.serveDelayMs);
}

/** Axis-aligned hit test: ball circle vs paddle rectangle. */
function ballHitsPaddle(px, py) {
  const nearestX = clamp(ballX, px, px + PADDLE_W);
  const nearestY = clamp(ballY, py, py + PADDLE_H);
  const dx = ballX - nearestX;
  const dy = ballY - nearestY;
  return dx * dx + dy * dy <= BALL_R * BALL_R;
}

/** After a paddle hit, bounce X and add spin from contact point. */
function bounceOffPaddle(py) {
  ballVX = -ballVX;

  const speed = Math.min(
    Math.hypot(ballVX, ballVY) + BALL_SPEED_BUMP,
    BALL_SPEED_MAX
  );

  // Offset from paddle center: -1 top … +1 bottom
  const rel = (ballY - (py + PADDLE_H / 2)) / (PADDLE_H / 2);

  const angle = rel * CFG.ball.maxBounceAngle;
  const sign = ballVX < 0 ? -1 : 1;
  ballVX = Math.cos(angle) * speed * sign;
  ballVY = Math.sin(angle) * speed;

  // Nudge out so we do not stick
  if (sign > 0) {
    ballX = PADDLE_MARGIN + PADDLE_W + BALL_R + 1;
  } else {
    ballX = COURT_W - PADDLE_MARGIN - PADDLE_W - BALL_R - 1;
  }
}

// --- Update loop pieces -------------------------------------------------

/** Step a paddle top toward a target: glide (capped speed) or instant. */
function steer(y, target) {
  if (target == null) return y;
  if (TOUCH.follow === "instant") return target;
  const step = PLAYER_SPEED * (Number(TOUCH.glideSpeed) || 2);
  const d = target - y;
  return Math.abs(d) <= step ? target : y + Math.sign(d) * step;
}

/** Move the left paddle from held keys, else toward the finger / mouse. */
function updatePlayer() {
  const up = held(CFG.keys.up), down = held(CFG.keys.down);
  if (up || down) {
    if (up) leftY -= PLAYER_SPEED;
    if (down) leftY += PLAYER_SPEED;
  } else {
    leftY = steer(leftY, leftTarget);
  }
  leftY = clamp(leftY, 0, COURT_H - PADDLE_H);
  if (twoP) rightY = clamp(steer(rightY, rightTarget), 0, COURT_H - PADDLE_H);
}

/** Lightweight AI: chase ball Y with a speed cap. */
function updateAI() {
  const target = ballY - PADDLE_H / 2;
  const dead = CFG.paddle.aiDeadZone;
  const delta = target - rightY;

  if (delta > dead) {
    rightY += Math.min(AI_SPEED, delta);
  } else if (delta < -dead) {
    rightY -= Math.min(AI_SPEED, -delta);
  }

  rightY = clamp(rightY, 0, COURT_H - PADDLE_H);
}

/** Integrate ball, walls, paddles, and scoring. */
function updateBall() {
  ballX += ballVX;
  ballY += ballVY;

  // Top / bottom walls
  if (ballY - BALL_R <= 0) {
    ballY = BALL_R;
    ballVY = Math.abs(ballVY);
  } else if (ballY + BALL_R >= COURT_H) {
    ballY = COURT_H - BALL_R;
    ballVY = -Math.abs(ballVY);
  }

  // Left paddle
  const leftX = PADDLE_MARGIN;
  if (ballVX < 0 && ballHitsPaddle(leftX, leftY)) {
    bounceOffPaddle(leftY);
  }

  // Right paddle
  const rightX = COURT_W - PADDLE_MARGIN - PADDLE_W;
  if (ballVX > 0 && ballHitsPaddle(rightX, rightY)) {
    bounceOffPaddle(rightY);
  }

  // Point for AI (ball past left)
  if (ballX + BALL_R < 0) {
    scoreR += 1;
    pointScored(1);
  } else if (ballX - BALL_R > COURT_W) {
    // Point for player (ball past right)
    scoreL += 1;
    pointScored(-1);
  }
}

// --- Draw ---------------------------------------------------------------

/** Centered message on a dimmed court (pause / win). */
function drawMessage(big, small) {
  ctx.fillStyle = CFG.colors.shade;
  ctx.fillRect(0, 0, COURT_W, COURT_H);
  ctx.fillStyle = CFG.colors.message;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 56px system-ui, sans-serif";
  ctx.fillText(big, COURT_W / 2, COURT_H / 2 - (small ? 22 : 0));
  if (small) {
    ctx.font = "500 22px system-ui, sans-serif";
    ctx.fillText(small, COURT_W / 2, COURT_H / 2 + 30);
  }
}

/** Paint one frame: net, paddles, ball, message. */
function draw() {
  ctx.fillStyle = CFG.colors.court;
  ctx.fillRect(0, 0, COURT_W, COURT_H);

  // Dashed center net
  ctx.strokeStyle = CFG.colors.net;
  ctx.lineWidth = CFG.net.lineWidth;
  ctx.setLineDash(CFG.net.dash);
  ctx.beginPath();
  ctx.moveTo(COURT_W / 2, 0);
  ctx.lineTo(COURT_W / 2, COURT_H);
  ctx.stroke();
  ctx.setLineDash([]);

  // Paddles
  ctx.fillStyle = CFG.colors.pieces;
  ctx.fillRect(PADDLE_MARGIN, leftY, PADDLE_W, PADDLE_H);
  ctx.fillRect(COURT_W - PADDLE_MARGIN - PADDLE_W, rightY, PADDLE_W, PADDLE_H);

  // Ball (hidden once the match is over)
  if (!winner) {
    ctx.beginPath();
    ctx.arc(ballX, ballY, BALL_R, 0, Math.PI * 2);
    ctx.fill();
  }

  if (winner) {
    const big = twoP ? (winner === "L" ? CFG.text.p1Wins : CFG.text.p2Wins)
      : (winner === "L" ? CFG.text.youWin : CFG.text.cpuWins);
    const again = usedTouch ? (CFG.text.tapAgain || CFG.text.playAgain) : CFG.text.playAgain;
    drawMessage(big, scoreL + CFG.text.scoreSeparator + scoreR + "  ·  " + again);
  } else if (paused) {
    drawMessage(CFG.text.paused, "");
  }
}

/** Main loop: update then draw, forever. */
function tick() {
  if (!paused && !winner && !waitingServe) {
    updatePlayer();
    if (!twoP) updateAI();
    updateBall();
  } else if (!paused && !winner) {
    // Still allow paddle aim while waiting on serve
    updatePlayer();
  }
  draw();
  requestAnimationFrame(tick);
}

/* ---------------------------------------------------------------------------
 * Hub bridge (optional; same protocol as Snake / Swell Foop / hub-gamebar.js, v:1).
 * Only active in a frame, after the hub's hello:
 *   game → hub  {type:'hub-ready'}                     on load
 *   hub → game  {type:'hub-hello'}                     → body.in-hub, reply hub-app
 *   game → hub  {type:'hub-app', app, stats, buttons}  You / CPU score, New Game
 *   game → hub  {type:'hub-stat', id, value}           when a score changes
 *   hub → game  {type:'hub-action', id:'new'}          → new match
 *   game → hub  {type:'hub-rumble', ms | pattern}      every point (CFG.rumble.point)
 *               → the hub relays it to the paired phone controller
 * Accepted only from window.parent with a same-origin / file:// origin.
 * ------------------------------------------------------------------------- */
const HUB_V = 1;
const IN_FRAME = (function () { try { return window.parent && window.parent !== window; } catch (e) { return true; } })();
let hubLinked = false;
const hubLastSent = {};

function hubPost(msg) {
  if (!IN_FRAME) return;
  try { window.parent.postMessage(Object.assign({ v: HUB_V }, msg), "*"); } catch (e) { /* ignore */ }
}

function hubOriginOk(origin) {
  return origin === location.origin || origin === "null" || location.origin === "null" ||
    String(origin).indexOf("file:") === 0;
}

function hubStats() {
  return [
    { id: "left", label: twoP ? (CFG.text.statP1 || "P1") : (CFG.text.statLeft || "You"), value: scoreL },
    { id: "right", label: twoP ? (CFG.text.statP2 || "P2") : (CFG.text.statRight || "CPU"), value: scoreR },
  ];
}

/** Header layout for the hub (also re-sent when You / CPU switch to P1 / P2). */
function hubSendApp() {
  const stats = hubStats();
  stats.forEach(function (st) { hubLastSent[st.id] = st.value; });
  hubPost({
    type: "hub-app",
    app: { name: APP.name, version: APP.version },
    stats: stats,
    buttons: [{ id: "new", label: CFG.text.newGame || "New Game" }],
  });
}

/** Phone rumble via the hub (same as Snake / 2048): ms, or a pattern array; 0 = off. */
function hubRumble(v) {
  if (!hubLinked || !v) return;
  if (Array.isArray(v)) hubPost({ type: "hub-rumble", pattern: v.slice(0, 20) });
  else if (Number(v) > 0) hubPost({ type: "hub-rumble", ms: Number(v) });
}

function hubSendStats() {
  if (!hubLinked) return;
  hubStats().forEach(function (st) {
    if (hubLastSent[st.id] === st.value) return;
    hubLastSent[st.id] = st.value;
    hubPost({ type: "hub-stat", id: st.id, value: st.value });
  });
}

function onHubMessage(e) {
  if (e.source !== window.parent || !hubOriginOk(e.origin)) return;
  const d = e.data;
  if (!d || typeof d !== "object" || d.v !== HUB_V) return;
  if (d.type === "hub-hello") {
    if (!hubLinked) {
      hubLinked = true;
      document.body.classList.add("in-hub");
      fitCourt();
    }
    hubSendApp();
  } else if (d.type === "hub-action" && hubLinked && d.id === "new") {
    resetMatch();
  }
}

if (IN_FRAME) window.addEventListener("message", onHubMessage);

// --- Touch / mouse (pointer events) ------------------------------------

let usedTouch = false;                  // a touch was seen (win text says "Tap")

/** Client coords → court units (canvas CSS size / 2px border / scale). */
function toCourt(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  const bl = canvas.clientLeft || 0, bt = canvas.clientTop || 0;
  const w = canvas.clientWidth || (r.width - 2 * bl), h = canvas.clientHeight || (r.height - 2 * bt);
  return {
    x: (clientX - r.left - bl) * COURT_W / w,
    y: (clientY - r.top - bt) * COURT_H / h,
  };
}

/** Paddle top that centres the paddle on court y. */
function paddleTopAt(y) {
  return clamp(y - PADDLE_H / 2, 0, COURT_H - PADDLE_H);
}

/** Steer the paddle of a side to court y (touch / mouse). */
function aim(side, y) {
  if (side === "L") leftTarget = paddleTopAt(y);
  else if (twoP) rightTarget = paddleTopAt(y);
}

canvas.addEventListener("pointerdown", function (e) {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  e.preventDefault();
  if (e.pointerType !== "mouse") usedTouch = true;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  const c = toCourt(e.clientX, e.clientY);
  let side = c.x < COURT_W / 2 ? "L" : "R";
  if (side === "R") {
    if (TOUCH.twoPlayer !== false && e.pointerType !== "mouse") setTwoPlayer(true);
    else side = "";                     // mouse / 2P off: right half only taps
  }
  pointers.set(e.pointerId, { side: side, x: e.clientX, y: e.clientY, t: performance.now(), moved: false });
  if (side) aim(side, c.y);
});

canvas.addEventListener("pointermove", function (e) {
  const p = pointers.get(e.pointerId);
  if (!p) {
    // PC mouse hovering over the left half (no button): left paddle follows it
    if (e.pointerType === "mouse" && TOUCH.mouse !== false && !e.buttons) {
      const c = toCourt(e.clientX, e.clientY);
      if (c.x < COURT_W / 2) leftTarget = paddleTopAt(c.y);
    }
    return;
  }
  e.preventDefault();
  if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > (TOUCH.tapMaxMovePx || 12)) p.moved = true;
  if (p.side) aim(p.side, toCourt(e.clientX, e.clientY).y);
});

function pointerEnd(e, cancelled) {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  pointers.delete(e.pointerId);
  if (!cancelled && !p.moved && performance.now() - p.t <= (TOUCH.tapMaxMs || 300)) tapAction();
}
canvas.addEventListener("pointerup", function (e) { pointerEnd(e, false); });
canvas.addEventListener("pointercancel", function (e) { pointerEnd(e, true); });
canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
document.addEventListener("contextmenu", function (e) { e.preventDefault(); });
document.addEventListener("dblclick", function (e) { e.preventDefault(); });
// No page scroll / pinch on the court (iOS ignores touch-action on some gestures)
document.addEventListener("touchmove", function (e) { e.preventDefault(); }, { passive: false });

if (pauseBtn) {
  pauseBtn.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
  pauseBtn.addEventListener("click", function (e) {
    e.preventDefault();
    if (winner) resetMatch(); else togglePause();
    pauseBtn.blur();                    // Space / Enter keep going to the game
  });
}

// --- Boot ---------------------------------------------------------------

fitCourt();
serve(CFG.ball.firstServeDir);
updateHud();
requestAnimationFrame(tick);
hubPost({ type: "hub-ready" });

// Read-only peek for debugging / tests
window.__pong = {
  get scoreL() { return scoreL; }, get scoreR() { return scoreR; }, get winner() { return winner; },
  get paused() { return paused; }, get court() { return [COURT_W, COURT_H]; }, get scale() { return scale; },
  get inHub() { return hubLinked; }, get leftY() { return leftY; }, get rightY() { return rightY; },
  get twoP() { return twoP; }, get paddleH() { return PADDLE_H; }, get waitingServe() { return waitingServe; },
  get ballX() { return ballX; },
};
