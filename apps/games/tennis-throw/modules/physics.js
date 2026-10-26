/*
 * File: modules/physics.js
 * Project: tennis-throw
 * Purpose: Throwing (cooldown + ball limit), ball flight and ball/target hits.
 *          TB2: all motion uses seconds. Each step uses the exact constant-
 *          gravity formula, so the path does not depend on the step size.
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

  /** Launch a ball now (no limits; use tryThrow for player input). */
  TT.throwBall = function () {
    const p = TT.launchPoint(), v = TT.aimVelocity();
    game.balls.push({ x: p.x, y: p.y, vx: v.vx, vy: v.vy, age: 0, trailX: [], trailY: [] });
  };

  /** TB1: throw only after the cooldown and while fewer than maxBallsInAir fly. */
  TT.tryThrow = function () {
    if (!game.isRunning) return false;
    if ((game.clock - game.lastThrow) * 1000 < CFG.throwing.cooldownMs) return false;
    if (game.balls.length >= CFG.throwing.maxBallsInAir) return false;
    game.lastThrow = game.clock;
    TT.throwBall();
    return true;
  };

  /** Move balls, keep trails, drop off-screen balls, score hits. dt in seconds. */
  TT.updateBalls = function (dt) {
    const W = TT.canvas.width, H = TT.canvas.height;
    game.balls = game.balls.filter(ball => {
      TT.stepBody(ball, dt);
      ball.age += dt;
      ball.trailX.push(ball.x); ball.trailY.push(ball.y);
      if (ball.trailX.length > CFG.ball.maxTrail) { ball.trailX.shift(); ball.trailY.shift(); }

      if (ball.x < 0 || ball.x > W || ball.y > H) {
        game.lastFlight = ball.age; // TB2: seconds in the air (read by tests)
        return false;
      }
      for (let i = game.targets.length - 1; i >= 0; i--) {
        const t = game.targets[i];
        if (Math.hypot(ball.x - t.x, ball.y - t.y) < t.radius + CFG.ball.hitRadius) {
          game.score += t.points;
          game.targets.splice(i, 1);
          TT.spawnTarget(t.type);
          return false; // ball is used up
        }
      }
      return true;
    });
  };
})(window.TT);
