/*
 * ========================================================================
 * Ping Pong — core/ai.js: the right paddle's CPU player (used when not 2-player).
 * ========================================================================
 */

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
