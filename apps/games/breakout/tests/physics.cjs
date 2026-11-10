/* Run: node apps/games/breakout/tests/physics.cjs — no dependencies. */
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const context = vm.createContext({ window: {} });
for (const f of ['config.js', 'levels.js', 'physics.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../core', f), 'utf8'), context);
  if (f === 'config.js') context.BRK = context.window.BRK;
}
const B = context.BRK, C = B.C;
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS', name); }
check('10 distinct handmade layouts and 100 endless boards', () => {
  assert.equal(B.layouts.length, 10);
  assert.equal(new Set(B.layouts.map(r => r.join())).size, 10);
  for (let level = 1; level <= 110; level++) {
    const bricks = B.makeLevel(level);
    assert.ok(bricks.some(b => b.hp > 0));
    assert.ok(bricks.every(b => b.x >= 0 && b.x + C.brickWidth <= C.width && b.y < 400));
  }
});
check('all 10 boards clear through actual ball/brick collisions', () => {
  for (let level = 1; level <= 10; level++) {
    const m = new B.Model(() => .99); m.level = level; m.setupLevel(); m.launch();
    const targets = m.bricks.filter(b => b.hp > 0);
    for (const brick of targets) {
      while (brick.hp > 0) {
        const before = brick.hp;
        m.balls = [{ x: brick.x + C.brickWidth / 2, y: brick.y + C.brickHeight + C.radius + .2,
          vx: 0, vy: -C.maxSpeed, speed: C.maxSpeed }];
        m.tick(); assert.ok(brick.hp < before);
      }
    }
    assert.equal(m.level, level + 1); assert.equal(m.mode, 'ready'); assert.equal(m.lives, 3);
    assert.ok(m.score > 0);
  }
});
check('maximum-speed no tunnelling and unbreakable bricks', () => {
  const m = new B.Model(() => .99); m.launch();
  const brick = m.bricks[0]; brick.hp = -1;
  m.balls = [{ x: brick.x + 20, y: brick.y + C.brickHeight + C.radius + 1, vx: 0, vy: -650, speed: 650 }];
  m.tick(); assert.equal(brick.hp, -1); assert.ok(m.balls[0].vy > 0);
  const hp = m.bricks[1].hp;
  m.balls = [{ x: m.bricks[1].x + 20, y: m.bricks[1].y + C.brickHeight + 9, vx: 0, vy: -650, speed: 650 }];
  m.tick(); assert.equal(m.bricks[1].hp, hp - 1);
});
check('paddle angles and speed ramp at both edges and centre', () => {
  for (const offset of [-35, 0, 35]) {
    const m = new B.Model(); m.launch();
    m.balls = [{ x: m.paddle.x + offset, y: C.paddleY - C.radius - 1, vx: 0, vy: 340, speed: 340 }];
    m.tick(); const ball = m.balls[0];
    assert.ok(ball.vy < 0); assert.equal(ball.speed, 343);
    assert.equal(Math.sign(ball.vx), Math.sign(offset));
  }
});
check('all 5 falling powers caught by the paddle', () => {
  for (const type of C.powerTypes) {
    const m = new B.Model(); m.launch();
    m.drops = [{ x: m.paddle.x, y: C.paddleY - 10, type }]; m.tick();
    assert.equal(m.drops.length, 0);
    if (type === 'wide') assert.equal(m.paddleWidth, 132);
    if (type === 'multi') assert.equal(m.balls.length, 3);
    if (type === 'slow') assert.equal(m.speedFactor, .65);
    if (type === 'laser') { m.tick(); assert.equal(m.shots.length, 2); }
    if (type === 'life') assert.equal(m.lives, 4);
  }
});
check('slow movement, power expiry, multi cap and extra life cap', () => {
  const a = new B.Model(), b = new B.Model(); a.launch(); b.launch(); b.power('slow');
  const y = a.balls[0].y; a.tick(); b.tick();
  assert.ok(Math.abs((y - b.balls[0].y) / (y - a.balls[0].y) - .65) < .001);
  b.buffs.slow = .001; b.buffs.wide = .001; b.buffs.laser = .001; b.tick();
  assert.equal(b.speedFactor, 1); assert.equal(b.paddleWidth, 88); assert.equal(b.buffs.laser, 0);
  for (let i = 0; i < 12; i++) { b.power('multi'); b.power('life'); }
  assert.equal(b.balls.length, 8); assert.equal(b.lives, 9);
});
check('lasers damage breakable bricks and stop on solid bricks', () => {
  for (const solid of [false, true]) {
    const m = new B.Model(() => .99); m.launch(); const brick = m.bricks[0];
    brick.hp = solid ? -1 : 3;
    m.shots = [{ x: brick.x + 10, y: brick.y + C.brickHeight + 1 }]; m.tick();
    assert.equal(brick.hp, solid ? -1 : 2); assert.equal(m.shots.length, 0);
  }
});
check('life loss only on last ball then game over after 3 losses', () => {
  const m = new B.Model(); m.launch(); m.power('multi');
  m.balls[0].y = 660; m.tick(); assert.equal(m.lives, 3); assert.equal(m.balls.length, 2);
  for (let i = 0; i < 3; i++) {
    m.launch(); for (const b of m.balls) b.y = 660;
    m.tick(); assert.equal(m.lives, 2 - i);
  }
  assert.equal(m.mode, 'over'); assert.equal(m.balls.length, 0);
});
check('seeded 30 minute autoplay stress: bounded finite model', () => {
  let seed = 72;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const m = new B.Model(rand);
  for (let i = 0; i < 60 * 60 * 30; i++) {
    if (m.mode === 'over') m.lives = 3, m.readyBall();
    if (m.mode === 'ready') m.launch();
    const lowest = m.balls.reduce((a, b) => a.y > b.y ? a : b);
    m.movePaddle(lowest.x + Math.sin(i / 120) * 20); m.tick(); m.events = [];
    assert.ok(m.balls.every(b => Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.vx) && Number.isFinite(b.vy)));
    assert.ok(m.balls.length <= 8); assert.ok(m.paddle.x >= m.paddleWidth / 2);
  }
  assert.ok(m.score > 1000); console.log('  stress level:', m.level, 'score:', m.score);
});
console.log(`${checks} model checks passed`);
