/*
 * ========================================================================
 * Ping Pong — core/game.js: match rules, physics, scoring, serving and the main loop.
 * First to WIN_SCORE wins; Start / Enter (or hub "New Game") plays again.
 * Calls ui/dom.js (draw, updateHud) and the hub bridge (ui/hub.js) at run time only.
 * ========================================================================
 */

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

// --- Serve / match ------------------------------------------------------

/**
 * Reset paddles and ball for a new serve.
 * dir: +1 serve toward AI, -1 serve toward player.
 */
function serve(dir) {
  clearTimeout(serveTimer);
  PP.fx.reset();                        // visual only: drop the old trail / particles
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
  PP.fx.hit(ballX, ballY, "paddle", sign > 0 ? 1 : -1, 0);   // visual only
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

/** Integrate ball, walls, paddles, and scoring. */
function updateBall() {
  ballX += ballVX;
  ballY += ballVY;

  // Top / bottom walls
  if (ballY - BALL_R <= 0) {
    ballY = BALL_R;
    ballVY = Math.abs(ballVY);
    PP.fx.hit(ballX, ballY, "wall", 0, 1);                      // visual only
  } else if (ballY + BALL_R >= COURT_H) {
    ballY = COURT_H - BALL_R;
    ballVY = -Math.abs(ballVY);
    PP.fx.hit(ballX, ballY, "wall", 0, -1);                     // visual only
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
    PP.fx.hit(0, ballY, "score", 1, 0);                         // visual only
    pointScored(1);
  } else if (ballX - BALL_R > COURT_W) {
    // Point for player (ball past right)
    scoreL += 1;
    PP.fx.hit(COURT_W, ballY, "score", -1, 0);                  // visual only
    pointScored(-1);
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
  PP.fx.step(!paused && !winner && !waitingServe);   // visual only: trail + particles
  draw();
  requestAnimationFrame(tick);
}
