/**
 * Snake — grid snake with boost, wrap toggle, keyboard + hub D-pad.
 * Game logic. Every tunable value comes from SNAKE_CONFIG (snake_config.js).
 */
(function () {
  'use strict';

  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const wrapInd = document.getElementById('wrap-ind');
  const overlay = document.getElementById('overlay');
  const titleEl = document.getElementById('title');
  const msgEl = document.getElementById('msg');
  const subEl = document.getElementById('sub');

  const CFG = SNAKE_CONFIG;
  const K = CFG.keys;
  const TX = CFG.text;
  const CL = CFG.colors;
  const SZ = CFG.sizes;
  document.getElementById('help').textContent = TX.help;
  // Match a key event against a binding list by KeyboardEvent.code OR .key.
  const isKey = (list, e) => list.indexOf(e.code) !== -1 || list.indexOf(e.key) !== -1;

  const COLS = CFG.grid.cols;
  const ROWS = CFG.grid.rows;
  const BASE_STEP = CFG.timing.baseStep; // seconds per cell
  const BOOST_STEP = CFG.timing.boostStep;
  const BEST_KEY = CFG.bestKey;

  let dpr = 1, W = 0, H = 0, cell = 0, ox = 0, oy = 0;
  let state = 'title'; // title | play | pause | over
  let snake, dir, nextDir, dirQueue, food, score, best, wrap, boost;
  let acc = 0, last = 0;
  let clickStartAt = -Infinity; // time a tap/click started the game

  best = Number(localStorage.getItem(BEST_KEY) || 0) || 0;
  bestEl.textContent = 'BEST ' + best;

  const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const DELTA = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cell = Math.floor(Math.min(W / COLS, H / ROWS));
    ox = Math.floor((W - cell * COLS) / 2);
    oy = Math.floor((H - cell * ROWS) / 2);
  }

  function showOverlay(title, msg, sub) {
    overlay.hidden = false;
    titleEl.textContent = title;
    msgEl.textContent = msg;
    subEl.textContent = sub || '';
  }
  function hideOverlay() { overlay.hidden = true; }

  function resetGame() {
    const cx = Math.floor(COLS / 2);
    const cy = Math.floor(ROWS / 2);
    dir = CFG.grid.startDir;
    nextDir = dir;
    const [bdx, bdy] = DELTA[dir];
    snake = [];
    for (let i = 0; i < CFG.grid.startLength; i++) snake.push([cx - bdx * i, cy - bdy * i]);
    dirQueue = [];
    score = CFG.start.score;
    wrap = CFG.start.wrap;
    boost = false;
    acc = 0;
    placeFood();
    scoreEl.textContent = String(score);
    wrapInd.className = wrap ? 'wrap-on' : 'wrap-off';
  }

  function placeFood() {
    const taken = new Set(snake.map((p) => p[0] + ',' + p[1]));
    let x, y, guard = 0;
    do {
      x = Math.floor(Math.random() * COLS);
      y = Math.floor(Math.random() * ROWS);
      guard++;
    } while (taken.has(x + ',' + y) && guard < 500);
    food = [x, y];
  }

  function queueDir(d) {
    if (!DELTA[d]) return;
    const lastQueued = dirQueue.length ? dirQueue[dirQueue.length - 1] : nextDir;
    if (d === lastQueued) return;
    if (OPP[d] === lastQueued) return;
    if (dirQueue.length < CFG.input.queueSize) dirQueue.push(d);
  }

  function step() {
    if (dirQueue.length) nextDir = dirQueue.shift();
    if (OPP[nextDir] !== dir) dir = nextDir;
    const [dx, dy] = DELTA[dir];
    let nx = snake[0][0] + dx;
    let ny = snake[0][1] + dy;
    if (wrap) {
      nx = (nx + COLS) % COLS;
      ny = (ny + ROWS) % ROWS;
    } else if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) {
      return die();
    }
    for (let i = 0; i < snake.length; i++) {
      if (snake[i][0] === nx && snake[i][1] === ny) return die();
    }
    snake.unshift([nx, ny]);
    if (nx === food[0] && ny === food[1]) {
      score += boost ? CFG.scoring.foodBoosted : CFG.scoring.food;
      scoreEl.textContent = String(score);
      placeFood();
    } else {
      snake.pop();
    }
  }

  function die() {
    state = 'over';
    if (score > best) {
      best = score;
      localStorage.setItem(BEST_KEY, String(best));
      bestEl.textContent = 'BEST ' + best;
    }
    showOverlay(TX.gameOver, 'Score ' + score, 'Best ' + best + ' — Start / Enter');
  }

  function startPlay() {
    if (state === 'title' || state === 'over') {
      resetGame();
      state = 'play';
      hideOverlay();
    } else if (state === 'pause') {
      state = 'play';
      hideOverlay();
    } else if (state === 'play') {
      state = 'pause';
      showOverlay(TX.paused, TX.pressStart, '');
    }
  }

  /** Start key: toggles pause, except right after a tap/click started the game. */
  function onStartKey() {
    if (state === 'play' && performance.now() - clickStartAt < CFG.input.clickStartGraceMs) {
      clickStartAt = -Infinity; // swallow once: the game is already running
      return;
    }
    startPlay();
  }

  /** Tap/click start (title / game over / resume from pause). */
  function clickStart() {
    const wasStarting = state === 'title' || state === 'over';
    startPlay();
    if (wasStarting && state === 'play') clickStartAt = performance.now();
  }

  function toTitle() {
    state = 'title';
    resetGame();
    showOverlay(TX.title, TX.pressStart, TX.titleSub);
  }

  function onKey(e, down) {
    if (down) {
      if (isKey(K.up, e)) { queueDir('up'); e.preventDefault(); }
      else if (isKey(K.down, e)) { queueDir('down'); e.preventDefault(); }
      else if (isKey(K.left, e)) { queueDir('left'); e.preventDefault(); }
      else if (isKey(K.right, e)) { queueDir('right'); e.preventDefault(); }
      else if (isKey(K.boost, e)) { boost = true; e.preventDefault(); }
      else if (isKey(K.wrap, e)) {
        if (!e.repeat) {
          wrap = !wrap;
          wrapInd.className = wrap ? 'wrap-on' : 'wrap-off';
        }
      } else if (isKey(K.start, e)) { if (!e.repeat) onStartKey(); e.preventDefault(); }
      else if (isKey(K.restart, e)) { if (!e.repeat) toTitle(); e.preventDefault(); }
    } else {
      if (isKey(K.boost, e)) boost = false;
    }
  }

  /** Focus lost: the keyup would never arrive, so drop held keys. */
  function clearKeys() {
    boost = false;
  }

  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));
  window.addEventListener('blur', clearKeys);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearKeys(); });
  overlay.addEventListener('click', () => {
    if (state === 'title' || state === 'over' || state === 'pause') clickStart();
  });
  canvas.addEventListener('click', () => {
    if (state === 'title' || state === 'over') clickStart();
  });

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw() {
    ctx.fillStyle = CL.bg;
    ctx.fillRect(0, 0, W, H);
    // board
    ctx.fillStyle = CL.board;
    ctx.fillRect(ox, oy, cell * COLS, cell * ROWS);
    // grid subtle
    ctx.strokeStyle = CL.grid;
    ctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(ox + x * cell + 0.5, oy);
      ctx.lineTo(ox + x * cell + 0.5, oy + ROWS * cell);
      ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(ox, oy + y * cell + 0.5);
      ctx.lineTo(ox + COLS * cell, oy + y * cell + 0.5);
      ctx.stroke();
    }
    // food
    if (food) {
      const fx = ox + food[0] * cell;
      const fy = oy + food[1] * cell;
      const pad = cell * SZ.foodPad;
      ctx.fillStyle = CL.food;
      rr(fx + pad, fy + pad, cell - pad * 2, cell - pad * 2, SZ.foodRadius);
      ctx.fill();
    }
    // snake
    for (let i = snake.length - 1; i >= 0; i--) {
      const [sx, sy] = snake[i];
      const t = i / Math.max(1, snake.length - 1);
      const g = Math.floor(CL.bodyGMin + (1 - t) * CL.bodyGRange);
      ctx.fillStyle = i === 0 ? CL.head : 'rgb(' + CL.bodyR + ',' + g + ',' + CL.bodyB + ')';
      const pad = i === 0 ? cell * SZ.headPad : cell * SZ.bodyPad;
      rr(ox + sx * cell + pad, oy + sy * cell + pad, cell - pad * 2, cell - pad * 2, SZ.segRadius);
      ctx.fill();
    }
    if (boost && state === 'play') {
      ctx.fillStyle = CL.boostTint;
      ctx.fillRect(ox, oy, cell * COLS, cell * ROWS);
    }
  }

  function loop(ts) {
    if (!last) last = ts;
    const dt = Math.min(CFG.timing.maxDt, (ts - last) / 1000);
    last = ts;
    if (state === 'play') {
      acc += dt;
      const stepTime = boost ? BOOST_STEP : BASE_STEP;
      while (acc >= stepTime) {
        acc -= stepTime;
        step();
        if (state !== 'play') break;
      }
    }
    draw();
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resize);
  resize();
  resetGame();
  showOverlay(TX.title, TX.pressStart, TX.titleSub);
  requestAnimationFrame(loop);
})();
