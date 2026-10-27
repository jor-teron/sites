/*
 * File: modules/physics.js
 * Project: tennis-throw
 * Purpose: Throwing (cooldown + ball limit), ball flight and ball/target hits.
 *          TB2: all motion uses seconds. Each step uses the exact constant-
 *          gravity formula, so the path does not depend on the step size.
 *          TB6: side-wall bounce with damping, swept (segment vs circle) hits
 *          so a fast ball cannot tunnel through a small target.
 */
(function (TT) {
  const CFG = TT.CFG, game = TT.game;

  /** Initial velocity (px/s) for the current aim. Shared by throws and the arc preview. */
  TT.aimVelocity = function () {
    const r = game.aimAngle * Math.PI / 180;
    const speed = game.ballSpeed * game.aimPower;
    return { vx: Math.cos(r) * speed, vy: -Math.sin(r) * speed };
  };

  /** Advance a point {x,y,vx,vy} by dt seconds under gravity (exact). */
  TT.stepBody = function (b, dt) {
    b.x += b.vx * dt;
    b.y += b.vy * dt + 0.5 * game.gravity * dt * dt;
    b.vy += game.gravity * dt;
  };

  /** TB6: true if segment (ax,ay)-(bx,by) passes within r of (cx,cy). */
  TT.segmentHitsCircle = function (ax, ay, bx, by, cx, cy, r) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / l2)) : 0;
    return Math.hypot(ax + dx * t - cx, ay + dy * t - cy) < r;
  };

  /** TB6: reflect off the side walls (damped). Returns true if it bounced. */
  TT.bounceWalls = function (b, W) {
    const R = CFG.ball.radius, k = CFG.physics.wallBounce;
    if (b.x < R) { b.x = R + (R - b.x) * k; b.vx = Math.abs(b.vx) * k; return true; }
    if (b.x > W - R) { b.x = W - R - (b.x - (W - R)) * k; b.vx = -Math.abs(b.vx) * k; return true; }
    return false;
  };

  /** Launch a ball now (no limits; use tryThrow for player input). */
  TT.throwBall = function () {
    const p = TT.launchPoint(), v = TT.aimVelocity();
    game.balls.push({ x: p.x, y: p.y, vx: v.vx, vy: v.vy, age: 0, spin: 0, trailX: [], trailY: [] });
  };

  /** TB1: throw only after the cooldown and while fewer than maxBallsInAir fly. */
  TT.tryThrow = function () {
    if (!game.isRunning) return false;
    if ((game.clock - game.lastThrow) * 1000 < CFG.throwing.cooldownMs) return false;
    if (game.balls.length >= CFG.throwing.maxBallsInAir) return false;
    game.lastThrow = game.clock;
    TT.throwBall();
    if (TT.sound) TT.sound('throw');
    return true;
  };

  /** Move balls, keep trails, drop off-screen balls, score hits. dt in seconds. */
  TT.updateBalls = function (dt) {
    const W = TT.canvas.width, H = TT.canvas.height;
    game.balls = game.balls.filter(ball => {
      const px = ball.x, py = ball.y;
      TT.stepBody(ball, dt);
      ball.age += dt;
      ball.spin += ball.vx * dt * 0.05;   // TB9: rolling spin for the seam
      if (TT.bounceWalls(ball, W) && TT.onBounce) TT.onBounce(ball);
      ball.trailX.push(ball.x); ball.trailY.push(ball.y);
      if (ball.trailX.length > CFG.ball.maxTrail) { ball.trailX.shift(); ball.trailY.shift(); }

      for (let i = game.targets.length - 1; i >= 0; i--) {
        const t = game.targets[i];
        if (TT.segmentHitsCircle(px, py, ball.x, ball.y, t.x, t.y, t.radius + CFG.ball.hitRadius)) {
          game.targets.splice(i, 1);
          if (TT.onHit) TT.onHit(t, ball); else { game.score += t.points; TT.spawnTarget(t.type); }
          TT.settings.vibrate();  // TB4/GS1: buzz on a hit if 'vibration' is on
          return false; // ball is used up
        }
      }
      if (ball.y > H + CFG.ball.radius) {
        game.lastFlight = ball.age; // TB2: seconds in the air (read by tests)
        if (TT.onMiss) TT.onMiss(ball);
        return false;
      }
      return true;
    });
  };
})(window.TT);
