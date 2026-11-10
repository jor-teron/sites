/* Pure fixed-step model. Adaptive sub-steps travel <= 0.45 radii, including at
 * maximum speed, so a ball cannot jump across a brick or the paddle. */
'use strict';
BRK.Model = class {
  constructor(random = Math.random) {
    this.random = random;
    this.events = [];
    this.level = 1;
    this.score = 0;
    this.lives = 3;
    this.time = 0;
    this.paddle = { x: BRK.C.width / 2 };
    this.buffs = { wide: 0, slow: 0, laser: 0 };
    this.setupLevel();
  }
  get paddleWidth() { return this.buffs.wide > 0 ? 132 : BRK.C.paddleWidth; }
  get speedFactor() { return this.buffs.slow > 0 ? .65 : 1; }
  get remaining() { return this.bricks.filter(b => b.hp > 0).length; }
  emit(type, data = {}) { this.events.push({ type, ...data }); }
  setupLevel() {
    this.bricks = BRK.makeLevel(this.level, this.random);
    this.buffs = { wide: 0, slow: 0, laser: 0 };
    this.drops = [];
    this.shots = [];
    this.laserCooldown = 0;
    this.readyBall();
  }
  readyBall() {
    this.mode = 'ready';
    this.balls = [{ x: this.paddle.x, y: BRK.C.paddleY - BRK.C.radius - 1,
      vx: 0, vy: 0, speed: Math.min(460, BRK.C.startSpeed + (this.level - 1) * 8) }];
  }
  movePaddle(x) {
    this.paddle.x = BRK.clamp(x, this.paddleWidth / 2 + 4, BRK.C.width - this.paddleWidth / 2 - 4);
    if (this.mode === 'ready') this.balls[0].x = this.paddle.x;
  }
  launch() {
    if (this.mode !== 'ready') return;
    this.mode = 'playing';
    this.aim(this.balls[0], .2);
    this.emit('launch');
  }
  aim(ball, angle) {
    ball.vx = Math.sin(angle) * ball.speed;
    ball.vy = -Math.cos(angle) * ball.speed;
  }
  power(type) {
    const C = BRK.C;
    if (!C.powerTypes.includes(type)) return;
    if (type === 'life') this.lives = Math.min(9, this.lives + 1);
    else if (type === 'multi') {
      // A ready ball stays ready: extra balls begin when it is launched.
      if (this.mode === 'ready') this.launch();
      const originals = this.balls.slice();
      for (const b of originals) {
        for (const angle of [-.5, .5]) {
          if (this.balls.length >= 8) break;
          const n = { ...b };
          const base = Math.atan2(b.vx, -b.vy);
          this.aim(n, BRK.clamp(base + angle, -1.2, 1.2));
          this.balls.push(n);
        }
      }
    } else this.buffs[type] = C.powerSeconds;
    this.movePaddle(this.paddle.x);
    this.emit('power', { power: type });
  }
  hit(brick) {
    if (brick.hp === -1) { this.emit('solid'); return; }
    if (brick.hp === 0) return;
    brick.hp--;
    this.score += 10;
    this.emit('hit', { x: brick.x + BRK.C.brickWidth / 2, y: brick.y + BRK.C.brickHeight / 2 });
    if (brick.hp === 0) {
      this.score += 40;
      this.emit('break', { x: brick.x + BRK.C.brickWidth / 2, y: brick.y + BRK.C.brickHeight / 2, color: brick.max });
      if (this.random() < .24) this.drops.push({ x: brick.x + BRK.C.brickWidth / 2,
        y: brick.y + BRK.C.brickHeight / 2, type: BRK.C.powerTypes[Math.floor(this.random() * 5)] });
    }
  }
  collide(ball, brick) {
    const C = BRK.C, r = C.radius;
    const nearX = BRK.clamp(ball.x, brick.x, brick.x + C.brickWidth);
    const nearY = BRK.clamp(ball.y, brick.y, brick.y + C.brickHeight);
    let dx = ball.x - nearX, dy = ball.y - nearY;
    const distance = Math.hypot(dx, dy);
    if (distance >= r) return false;
    if (distance > .0001) { dx /= distance; dy /= distance; }
    else {
      // Depenetrate even a restored ball inside a rectangle.
      const sides = [ball.x - brick.x, brick.x + C.brickWidth - ball.x,
        ball.y - brick.y, brick.y + C.brickHeight - ball.y];
      const side = sides.indexOf(Math.min(...sides));
      dx = side === 0 ? -1 : side === 1 ? 1 : 0;
      dy = side === 2 ? -1 : side === 3 ? 1 : 0;
      ball.x += dx * (sides[side] + .1);
      ball.y += dy * (sides[side] + .1);
    }
    ball.x += dx * (r - distance + .1);
    ball.y += dy * (r - distance + .1);
    const dot = ball.vx * dx + ball.vy * dy;
    if (dot < 0) {
      ball.vx -= 2 * dot * dx;
      ball.vy -= 2 * dot * dy;
      this.hit(brick);
      ball.speed = Math.min(C.maxSpeed, ball.speed + 1);
      this.normalize(ball);
    }
    return true;
  }
  normalize(ball) {
    // Keep a useful vertical component to avoid endless horizontal bouncing.
    const sign = ball.vy > 0 ? 1 : -1;
    const length = Math.hypot(ball.vx, ball.vy) || 1;
    ball.vy = sign * Math.max(Math.abs(ball.vy) / length, .24) * ball.speed;
    ball.vx = Math.sign(ball.vx || 1) * Math.sqrt(Math.max(0, ball.speed ** 2 - ball.vy ** 2));
  }
  tick(dt = BRK.C.step) {
    if (this.mode !== 'playing') return;
    const C = BRK.C;
    this.time += dt;
    for (const k of Object.keys(this.buffs)) this.buffs[k] = Math.max(0, this.buffs[k] - dt);
    this.movePaddle(this.paddle.x);
    this.laserCooldown -= dt;
    if (this.buffs.laser > 0 && this.laserCooldown <= 0) {
      this.laserCooldown = .28;
      for (const side of [-1, 1]) this.shots.push({ x: this.paddle.x + side * (this.paddleWidth / 2 - 9), y: C.paddleY });
      this.emit('laser');
    }
    const steps = Math.max(1, Math.ceil(C.maxSpeed * dt / (C.radius * .45)));
    const sub = dt / steps;
    for (let n = 0; n < steps; n++) {
      for (const ball of this.balls) {
        const oldY = ball.y;
        ball.x += ball.vx * sub * this.speedFactor;
        ball.y += ball.vy * sub * this.speedFactor;
        if (ball.x < C.radius) { ball.x = C.radius; ball.vx = Math.abs(ball.vx); }
        if (ball.x > C.width - C.radius) { ball.x = C.width - C.radius; ball.vx = -Math.abs(ball.vx); }
        if (ball.y < C.radius) { ball.y = C.radius; ball.vy = Math.abs(ball.vy); }
        if (ball.vy > 0 && oldY + C.radius <= C.paddleY && ball.y + C.radius >= C.paddleY &&
            Math.abs(ball.x - this.paddle.x) <= this.paddleWidth / 2 + C.radius) {
          ball.y = C.paddleY - C.radius - .1;
          ball.speed = Math.min(C.maxSpeed, ball.speed + 3);
          const offset = BRK.clamp((ball.x - this.paddle.x) / (this.paddleWidth / 2), -1, 1);
          this.aim(ball, offset * 1.12);
          this.emit('paddle');
        }
        for (const brick of this.bricks) if (brick.hp !== 0 && this.collide(ball, brick)) break;
      }
      // Laser motion is sub-stepped too: the first solid/regular brick stops it.
      for (const shot of this.shots) {
        shot.y -= 760 * sub;
        const brick = this.bricks.find(b => b.hp !== 0 && shot.x >= b.x && shot.x <= b.x + C.brickWidth &&
          shot.y >= b.y && shot.y <= b.y + C.brickHeight);
        if (brick) { this.hit(brick); shot.y = -100; }
      }
      this.shots = this.shots.filter(s => s.y > 0);
    }
    for (const drop of this.drops) {
      const oldY = drop.y;
      drop.y += 130 * dt;
      if (oldY <= C.paddleY + C.paddleHeight && drop.y + 10 >= C.paddleY &&
          Math.abs(drop.x - this.paddle.x) < this.paddleWidth / 2 + 12) {
        this.power(drop.type);
        drop.y = C.height + 30;
      }
    }
    this.drops = this.drops.filter(d => d.y < C.height + 15);
    this.balls = this.balls.filter(b => b.y < C.height + C.radius);
    if (!this.remaining) {
      this.score += 500 + this.level * 100;
      this.emit('level', { level: ++this.level });
      this.setupLevel();
    } else if (!this.balls.length) {
      this.lives--;
      this.buffs = { wide: 0, slow: 0, laser: 0 };
      this.drops = []; this.shots = [];
      this.emit('lost');
      if (this.lives <= 0) { this.mode = 'over'; this.emit('over'); }
      else this.readyBall();
    }
  }
};
