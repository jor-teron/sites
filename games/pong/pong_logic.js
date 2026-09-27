/*
 * ========================================================================
 * Pong — game logic
 * All state, drawing, input, physics, and simple AI live here.
 * Every tunable value comes from PONG_CONFIG (pong_config.js).
 * ========================================================================
 */

const CFG = PONG_CONFIG;

// --- DOM handles --------------------------------------------------------

// Canvas element used as the court
const canvas = document.getElementById("court");
canvas.width = CFG.court.width;
canvas.height = CFG.court.height;

// 2D drawing context
const ctx = canvas.getContext("2d");

// Score / pause text node
const hud = document.getElementById("hud");

// On-screen text from config
document.querySelector("h1").textContent = CFG.text.title;
document.getElementById("hint").textContent = CFG.text.hint;

// --- Court constants (from config) --------------------------------------

const COURT_W = canvas.width;
const COURT_H = canvas.height;
const PADDLE_W = CFG.paddle.width;
const PADDLE_H = CFG.paddle.height;
const PADDLE_MARGIN = CFG.paddle.margin;
const PLAYER_SPEED = CFG.paddle.playerSpeed;
const AI_SPEED = CFG.paddle.aiSpeed;
const BALL_R = CFG.ball.radius;
const BALL_SPEED = CFG.ball.speed;
const BALL_SPEED_BUMP = CFG.ball.speedBump;
const BALL_SPEED_MAX = CFG.ball.speedMax;

// --- Mutable game state -------------------------------------------------

// Left paddle Y (top edge)
let leftY = (COURT_H - PADDLE_H) / 2;

// Right paddle Y (top edge)
let rightY = (COURT_H - PADDLE_H) / 2;

// Ball center X / Y
let ballX = COURT_W / 2;
let ballY = COURT_H / 2;

// Ball velocity
let ballVX = BALL_SPEED;
let ballVY = 0;

// Scores
let scoreL = CFG.start.scoreLeft;
let scoreR = CFG.start.scoreRight;

// True while the match is frozen
let paused = CFG.start.paused;

// True after a point until serve
let waitingServe = true;

// Held keys map
const keys = Object.create(null);

// --- Input handlers -----------------------------------------------------

/** True if the event's code or key is in the list. */
function keyIn(list, e) {
  return list.indexOf(e.code) >= 0 || list.indexOf(e.key) >= 0;
}

/** True if any of the listed keys (code or key names) is held. */
function held(list) {
  return list.some(function (k) { return keys[k]; });
}

/** Forget every held key (focus lost: the keyup would never arrive). */
function clearKeys() {
  for (const k in keys) keys[k] = false;
}

/**
 * Mark a key as held when pressed.
 * Pause key toggles pause. Restart key restarts the whole match.
 */
function onKeyDown(e) {
  if (e.code) keys[e.code] = true;
  if (e.key) keys[e.key] = true;
  if (keyIn(CFG.keys.up, e) || keyIn(CFG.keys.down, e)) e.preventDefault();

  // Pause / unpause
  if (keyIn(CFG.keys.pause, e)) {
    e.preventDefault();
    if (!e.repeat) {
      paused = !paused;
      updateHud();
    }
    return;
  }

  // Full reset
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

// --- Helpers ------------------------------------------------------------

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Reset paddles and ball for a new serve.
 * dir: +1 serve toward AI, -1 serve toward player.
 */
function serve(dir) {
  leftY = (COURT_H - PADDLE_H) / 2;
  rightY = (COURT_H - PADDLE_H) / 2;
  ballX = COURT_W / 2;
  ballY = COURT_H / 2;
  ballVX = BALL_SPEED * dir;
  ballVY = (Math.random() * 2 - 1) * CFG.ball.serveMaxVY;
  waitingServe = false;
}

/** Zero scores and serve toward the AI. */
function resetMatch() {
  scoreL = CFG.start.scoreLeft;
  scoreR = CFG.start.scoreRight;
  paused = false;
  waitingServe = false;
  serve(CFG.ball.firstServeDir);
  updateHud();
}

/** Refresh the HUD string (scores + pause). */
function updateHud() {
  const extra = paused ? CFG.text.pausedSuffix : "";
  hud.textContent = scoreL + CFG.text.scoreSeparator + scoreR + extra;
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

/** Move the left paddle from held keys. */
function updatePlayer() {
  if (held(CFG.keys.up)) leftY -= PLAYER_SPEED;
  if (held(CFG.keys.down)) leftY += PLAYER_SPEED;
  leftY = clamp(leftY, 0, COURT_H - PADDLE_H);
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
    waitingServe = true;
    updateHud();
    setTimeout(function () { serve(1); }, CFG.ball.serveDelayMs);
  }

  // Point for player (ball past right)
  if (ballX - BALL_R > COURT_W) {
    scoreL += 1;
    waitingServe = true;
    updateHud();
    setTimeout(function () { serve(-1); }, CFG.ball.serveDelayMs);
  }
}

// --- Draw ---------------------------------------------------------------

/** Paint one frame: net, paddles, ball. */
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

  // Ball
  ctx.beginPath();
  ctx.arc(ballX, ballY, BALL_R, 0, Math.PI * 2);
  ctx.fill();
}

/** Main loop: update then draw, forever. */
function tick() {
  if (!paused && !waitingServe) {
    updatePlayer();
    updateAI();
    updateBall();
  } else if (!paused) {
    // Still allow paddle aim while waiting on serve
    updatePlayer();
  }
  draw();
  requestAnimationFrame(tick);
}

// --- Boot ---------------------------------------------------------------

serve(CFG.ball.firstServeDir);
updateHud();
requestAnimationFrame(tick);
