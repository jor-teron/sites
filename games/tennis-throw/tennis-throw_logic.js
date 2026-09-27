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

function isKey(list, key) {
  return list.includes(key);
}

// Game state (initialized from config)
const game = {
  score: CFG.start.score,
  targetScore: CFG.targetScore,
  time: 0,
  startTime: null,
  isRunning: false,
  isFinished: false,

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

function spawnTarget(type) {
  const T = CFG.targets;
  const poolItem = game.targetPool.find(p => p.type === type);
  const target = {
    type: type,
    x: Math.random() * (canvas.width - T.marginX * 2) + T.marginX,
    y: Math.random() * (canvas.height - T.bottomReserve) + T.marginTop,
    vx: type === 'bird' ? (Math.random() > 0.5 ? 1 : -1) * poolItem.speed : 0,
    emoji: poolItem.emoji,
    points: poolItem.points,
    radius: type === 'star' ? T.starRadius : T.radius
  };
  game.targets.push(target);
}

function throwBall() {
  const radians = (game.aimAngle * Math.PI) / 180;
  const speed = game.ballSpeed * game.aimPower;

  const ball = {
    x: canvas.width / 2,
    y: canvas.height - CFG.ball.launchOffsetY,
    vx: Math.cos(radians) * speed,
    vy: -Math.sin(radians) * speed,
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
    game.time = ((Date.now() - game.startTime) / 1000).toFixed(1);
    document.getElementById('timerValue').textContent = game.time;
  }
}

function updateScore() {
  document.getElementById('scoreValue').textContent = game.score;
  if (game.score >= game.targetScore && !game.isFinished) {
    finishGame();
  }
}

function getRank(seconds) {
  const sec = parseFloat(seconds);
  return CFG.ranks.find(r => sec < r.maxSeconds) || CFG.ranks[CFG.ranks.length - 1];
}

function finishGame() {
  game.isRunning = false;
  game.isFinished = true;

  const rank = getRank(game.time);
  const endScreen = document.getElementById('endScreen');

  document.getElementById('rankText').textContent = rank.name;
  document.getElementById('badge').textContent = rank.emoji;
  document.getElementById('finalTime').textContent = game.time;

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
  const radians = (game.aimAngle * Math.PI) / 180;
  const previewLength = A.previewLength;

  const startX = canvas.width / 2;
  const startY = canvas.height - CFG.ball.launchOffsetY;
  const endX = startX + Math.cos(radians) * previewLength;
  const endY = startY - Math.sin(radians) * previewLength;
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

  // Aim line
  ctx.strokeStyle = CFG.colors.aimLine;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

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
}

function gameLoop() {
  updateTimer();
  updateScore();
  if (game.isRunning) {
    updateBalls();
    updateTargets();
  }
  draw();
  requestAnimationFrame(gameLoop);
}

// Input handling
const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.key] = true;

  if (isKey(CFG.keys.throw, e.key)) {
    e.preventDefault();
    if (game.isFinished) {
      init();
    } else if (game.isRunning) {
      throwBall();
    }
  }
  if (isKey(CFG.keys.resetAim, e.key)) {
    game.aimAngle = CFG.start.aimAngle;
    game.aimPower = CFG.start.aimPower;
  }
});

window.addEventListener('keyup', (e) => {
  keys[e.key] = false;
});

function held(list) {
  return list.some(k => keys[k]);
}

// Continuous input
setInterval(() => {
  const A = CFG.aim;
  if (game.isRunning) {
    if (held(CFG.keys.aimLeft)) game.aimAngle = Math.max(A.angleMin, game.aimAngle - A.angleStep);
    if (held(CFG.keys.aimRight)) game.aimAngle = Math.min(A.angleMax, game.aimAngle + A.angleStep);
    if (held(CFG.keys.powerUp)) game.aimPower = Math.min(A.powerMax, game.aimPower + A.powerStep);
    if (held(CFG.keys.powerDown)) game.aimPower = Math.max(A.powerMin, game.aimPower - A.powerStep);
  }
}, CFG.aim.inputIntervalMs);

// Start
init();
gameLoop();
