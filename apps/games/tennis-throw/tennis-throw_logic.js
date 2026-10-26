/*
 * Tennis Ball Blitz — game logic.
 * Every tunable value comes from TENNIS_THROW_CONFIG (tennis-throw_config.js).
 */
const CFG = TENNIS_THROW_CONFIG;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// On-screen text from config
document.querySelector('.controls-hint').textContent = CFG.text.controls;
document.querySelector('.restart-hint').textContent = CFG.text.restart;
document.querySelector('.score').lastChild.textContent = '/' + CFG.targetScore;

/** True if the event's code or key is in the binding list. */
function isKey(list, e) {
  return list.includes(e.code) || list.includes(e.key);
}

// Game state (initialized from config)
const game = {
  score: CFG.start.score,
  targetScore: CFG.targetScore,
  time: 0,            // TB1: seconds as a number (formatted only for display)
  lastThrow: 0,       // TB1: Date.now() of the last throw (cooldown)
  startTime: null,
  isRunning: false,
  isFinished: false,
  isPaused: false,
  pausedAt: 0,

  // Physics
  gravity: CFG.physics.gravity,
  ballSpeed: CFG.physics.ballSpeed,

  // Input state
  aimAngle: CFG.start.aimAngle, // degrees
  aimPower: CFG.start.aimPower, // 0-1 scale

  // Objects
  targets: [],
  balls: [],

  // Target pool
  targetPool: CFG.targets.pool
};

// Initialize
function init() {
  game.score = CFG.start.score;
  game.time = 0;
  game.startTime = Date.now();
  game.isRunning = true;
  game.isFinished = false;
  game.isPaused = false;
  game.aimAngle = CFG.start.aimAngle;
  game.aimPower = CFG.start.aimPower;
  game.targets = [];
  game.balls = [];

  document.getElementById('endScreen').classList.remove('show');

  // Populate target pool
  game.targetPool.forEach(poolItem => {
    for (let i = 0; i < poolItem.count; i++) {
      spawnTarget(poolItem.type);
    }
  });
}

/** Launch point of every ball. */
function launchPoint() {
  return { x: canvas.width / 2, y: canvas.height - CFG.ball.launchOffsetY };
}

/**
 * TB1: highest y a target may use. The ball's max rise (full power, straight up)
 * is speed²/(2·gravity); only a share of it (reachFraction) is used so every
 * target can be hit with some margin.
 */
function minReachableY() {
  const rise = (game.ballSpeed * game.ballSpeed) / (2 * game.gravity) * CFG.physics.reachFraction;
  return Math.max(CFG.targets.marginTop, launchPoint().y - rise);
}

/** TB3: true if (x, y) is clear of other targets and (for non-birds) of bird rows. */
function spotIsFree(x, y, type) {
  const T = CFG.targets;
  return game.targets.every(t => {
    if (Math.hypot(t.x - x, t.y - y) < T.minGap) return false;
    // Birds fly sideways across the whole width: keep other targets out of their row
    if ((t.type === 'bird') !== (type === 'bird') && Math.abs(t.y - y) < T.birdClearance) return false;
    return true;
  });
}

function spawnTarget(type) {
  const T = CFG.targets;
  const poolItem = game.targetPool.find(p => p.type === type);
  const yMin = minReachableY();
  const yMax = canvas.height - T.bottomReserve;
  // TB3: retry random spots until one is free. If none is, keep the try
  // farthest from its nearest target so overlaps stay rare.
  let x, y, best = -1;
  for (let i = 0; i < T.spawnTries; i++) {
    const cx = Math.random() * (canvas.width - T.marginX * 2) + T.marginX;
    const cy = yMin + Math.random() * (yMax - yMin);
    if (spotIsFree(cx, cy, type)) { x = cx; y = cy; break; }
    const near = Math.min(Infinity, ...game.targets.map(t => Math.hypot(t.x - cx, t.y - cy)));
    if (near > best) { best = near; x = cx; y = cy; }
  }
  const target = {
    type: type,
    x: x,
    y: y,
    vx: type === 'bird' ? (Math.random() > 0.5 ? 1 : -1) * poolItem.speed : 0,
    emoji: poolItem.emoji,
    points: poolItem.points,
    radius: type === 'star' ? T.starRadius : T.radius
  };
  game.targets.push(target);
}

/** Initial velocity for the current aim (shared by throws and the arc preview). */
function aimVelocity() {
  const radians = (game.aimAngle * Math.PI) / 180;
  const speed = game.ballSpeed * game.aimPower;
  return { vx: Math.cos(radians) * speed, vy: -Math.sin(radians) * speed };
}

/** TB1: throw only after the cooldown and while fewer than maxBallsInAir are flying. */
function tryThrow() {
  const now = Date.now();
  if (now - game.lastThrow < CFG.throwing.cooldownMs) return;
  if (game.balls.length >= CFG.throwing.maxBallsInAir) return;
  game.lastThrow = now;
  throwBall();
}

function throwBall() {
  const p = launchPoint();
  const v = aimVelocity();
  const ball = {
    x: p.x,
    y: p.y,
    vx: v.vx,
    vy: v.vy,
    trailX: [],
    trailY: [],
    maxTrail: CFG.ball.maxTrail
  };
  game.balls.push(ball);
}

function updateBalls() {
  game.balls = game.balls.filter(ball => {
    // Physics
    ball.x += ball.vx;
    ball.y += ball.vy;
    ball.vy += game.gravity;

    // Trail
    ball.trailX.push(ball.x);
    ball.trailY.push(ball.y);
    if (ball.trailX.length > ball.maxTrail) {
      ball.trailX.shift();
      ball.trailY.shift();
    }

    // Out of bounds
    if (ball.x < 0 || ball.x > canvas.width || ball.y > canvas.height) {
      return false;
    }

    // Collision with targets
    for (let i = game.targets.length - 1; i >= 0; i--) {
      const target = game.targets[i];
      const dx = ball.x - target.x;
      const dy = ball.y - target.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < target.radius + CFG.ball.hitRadius) {
        game.score += target.points;
        game.targets.splice(i, 1);
        spawnTarget(target.type);
        return false; // Ball disappears
      }
    }

    return true;
  });
}

function updateTargets() {
  game.targets.forEach(target => {
    if (target.type === 'bird') {
      target.x += target.vx;
      if (target.x - target.radius < 0 || target.x + target.radius > canvas.width) {
        target.vx *= -1;
      }
    }
  });
}

function updateTimer() {
  if (game.isRunning) {
    game.time = (Date.now() - game.startTime) / 1000; // TB1: keep as a number
    document.getElementById('timerValue').textContent = game.time.toFixed(1);
  }
}

function updateScore() {
  document.getElementById('scoreValue').textContent = game.score;
  if (game.score >= game.targetScore && !game.isFinished) {
    finishGame();
  }
}

function getRank(seconds) {
  return CFG.ranks.find(r => seconds < r.maxSeconds) || CFG.ranks[CFG.ranks.length - 1];
}

function finishGame() {
  game.isRunning = false;
  game.isFinished = true;

  const rank = getRank(game.time);
  const endScreen = document.getElementById('endScreen');

  document.getElementById('rankText').textContent = rank.name;
  document.getElementById('badge').textContent = rank.emoji;
  document.getElementById('finalTime').textContent = game.time.toFixed(1);

  endScreen.classList.add('show');
}

function drawBalls() {
  game.balls.forEach(ball => {
    // Trail
    ctx.strokeStyle = CFG.colors.trail;
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (ball.trailX.length > 0) {
      ctx.moveTo(ball.trailX[0], ball.trailY[0]);
      for (let i = 1; i < ball.trailX.length; i++) {
        ctx.lineTo(ball.trailX[i], ball.trailY[i]);
      }
      ctx.stroke();
    }

    // Ball
    ctx.fillStyle = CFG.colors.ball;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, CFG.ball.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = CFG.colors.ballOutline;
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

function drawTargets() {
  game.targets.forEach(target => {
    ctx.font = (target.radius * 2) + 'px ' + CFG.colors.targetFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(target.emoji, target.x, target.y);
  });
}

function drawAim() {
  const A = CFG.aim;
  const { x: startX, y: startY } = launchPoint();
  const ch = A.crosshairSize;

  // Crosshair
  ctx.strokeStyle = CFG.colors.crosshair;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(startX - ch, startY);
  ctx.lineTo(startX + ch, startY);
  ctx.moveTo(startX, startY - ch);
  ctx.lineTo(startX, startY + ch);
  ctx.stroke();

  // TB3: dotted predicted arc. Same per-frame steps as updateBalls(),
  // so the dots sit exactly where the ball will fly.
  let { vx, vy } = aimVelocity();
  let x = startX, y = startY;
  ctx.fillStyle = CFG.colors.aimLine;
  game.arcDots = 0; // read by tests
  for (let f = 1; f <= A.previewFrames; f++) {
    x += vx; y += vy; vy += game.gravity;
    if (x < 0 || x > canvas.width || y > canvas.height) break;
    if (f % A.previewDotEvery === 0) {
      ctx.beginPath();
      ctx.arc(x, y, 3 - 1.5 * f / A.previewFrames, 0, Math.PI * 2); // dots shrink along the arc
      ctx.fill();
      game.arcDots++;
    }
  }

  // Power indicator (red = strong, green = weak)
  const bw = A.powerBarWidth;
  ctx.fillStyle = `rgba(${Math.round(game.aimPower * 255)}, ${Math.round((1 - game.aimPower) * 255)}, 0, 0.8)`;
  ctx.fillRect(startX - bw / 2, startY + A.powerBarOffsetY, game.aimPower * bw, A.powerBarHeight);
  ctx.strokeStyle = CFG.colors.powerBarOutline;
  ctx.lineWidth = 1;
  ctx.strokeRect(startX - bw / 2, startY + A.powerBarOffsetY, bw, A.powerBarHeight);
}

function draw() {
  // Clear
  ctx.fillStyle = CFG.colors.skyTop;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Sky gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, CFG.colors.skyTop);
  gradient.addColorStop(1, CFG.colors.skyBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawTargets();
  drawBalls();
  if (!game.isFinished) {
    drawAim();
  }
  if (game.isPaused) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(CFG.text.paused, canvas.width / 2, canvas.height / 2);
    ctx.font = '18px sans-serif'; // TB3: Esc hint
    ctx.fillText(CFG.text.pausedHint, canvas.width / 2, canvas.height / 2 + 36);
  }
}

function gameLoop() {
  updateTimer();
  if (game.isRunning) {
    updateScore(); // TB3: no score / game-over checks while paused
    updateBalls();
    updateTargets();
  }
  draw();
  requestAnimationFrame(gameLoop);
}

// Input handling
const keys = {};

/** Pause / resume a running game (the timer does not count while paused). */
function togglePause() {
  if (game.isFinished) return;
  if (game.isPaused) {
    game.isPaused = false;
    game.startTime += Date.now() - game.pausedAt;
    game.isRunning = true;
  } else if (game.isRunning) {
    game.isPaused = true;
    game.pausedAt = Date.now();
    game.isRunning = false;
  }
}

/** Focus lost: the keyup would never arrive, so drop held keys. */
function clearKeys() {
  for (const k in keys) keys[k] = false;
}

window.addEventListener('keydown', (e) => {
  if (e.code) keys[e.code] = true;
  if (e.key) keys[e.key] = true;

  if (isKey(CFG.keys.throw, e)) {
    e.preventDefault();
    if (game.isFinished) {
      if (!e.repeat) init();
    } else if (game.isRunning && !e.repeat) { // TB1: held Space does not auto-fire
      tryThrow();
    }
  } else if (isKey(CFG.keys.start, e)) {
    e.preventDefault();
    if (e.repeat) return;
    if (game.isFinished) init();
    else togglePause();
  } else if (isKey(CFG.keys.restart, e)) {
    e.preventDefault();
    if (!e.repeat) init();
  }
  if (isKey(CFG.keys.resetAim, e) && !game.isPaused) {
    game.aimAngle = CFG.start.aimAngle;
    game.aimPower = CFG.start.aimPower;
  }
  if (isKey(CFG.keys.aimLeft, e) || isKey(CFG.keys.aimRight, e) ||
      isKey(CFG.keys.powerUp, e) || isKey(CFG.keys.powerDown, e)) e.preventDefault();
});

window.addEventListener('keyup', (e) => {
  if (e.code) keys[e.code] = false;
  if (e.key) keys[e.key] = false;
});
window.addEventListener('blur', clearKeys);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearKeys(); });

function held(list) {
  return list.some(k => keys[k]);
}

// Continuous input
setInterval(() => {
  const A = CFG.aim;
  if (game.isRunning) {
    // TB1: angle 0 = right, 180 = left, so Left raises the angle and Right lowers it
    if (held(CFG.keys.aimLeft)) game.aimAngle = Math.min(A.angleMax, game.aimAngle + A.angleStep);
    if (held(CFG.keys.aimRight)) game.aimAngle = Math.max(A.angleMin, game.aimAngle - A.angleStep);
    if (held(CFG.keys.powerUp)) game.aimPower = Math.min(A.powerMax, game.aimPower + A.powerStep);
    if (held(CFG.keys.powerDown)) game.aimPower = Math.max(A.powerMin, game.aimPower - A.powerStep);
  }
}, CFG.aim.inputIntervalMs);

// Start
init();
gameLoop();
