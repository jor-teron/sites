/**
 * Snake — grid snake with boost, wrap toggle, keyboard + hub D-pad.
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

  const COLS = 24;
  const ROWS = 18;
  const BASE_STEP = 0.14; // seconds per cell
  const BOOST_STEP = 0.07;
  const BEST_KEY = 'snake-best';

  let dpr = 1, W = 0, H = 0, cell = 0, ox = 0, oy = 0;
  let state = 'title'; // title | play | pause | over
  let snake, dir, nextDir, dirQueue, food, score, best, wrap, boost;
  let acc = 0, last = 0;

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
    snake = [[cx, cy], [cx - 1, cy], [cx - 2, cy]];
    dir = 'right';
    nextDir = 'right';
    dirQueue = [];
    score = 0;
    wrap = false;
    boost = false;
    acc = 0;
    placeFood();
    scoreEl.textContent = '0';
    wrapInd.className = 'wrap-off';
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
    if (dirQueue.length < 2) dirQueue.push(d);
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
      score += boost ? 2 : 1;
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
    showOverlay('GAME OVER', 'Score ' + score, 'Best ' + best + ' — Start / Enter');
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
      showOverlay('PAUSED', 'Press Start / Enter', '');
    }
  }

  function toTitle() {
    state = 'title';
    resetGame();
    showOverlay('SNAKE', 'Press Start / Enter', 'or tap / click');
  }

  function onKey(e, down) {
    const code = e.code;
    if (down) {
      if (code === 'ArrowUp' || code === 'KeyW') queueDir('up');
      else if (code === 'ArrowDown' || code === 'KeyS') queueDir('down');
      else if (code === 'ArrowLeft' || code === 'KeyA') queueDir('left');
      else if (code === 'ArrowRight' || code === 'KeyD') queueDir('right');
      else if (code === 'Space') { boost = true; e.preventDefault(); }
      else if (code === 'KeyX') {
        wrap = !wrap;
        wrapInd.className = wrap ? 'wrap-on' : 'wrap-off';
      } else if (code === 'Enter') { startPlay(); e.preventDefault(); }
      else if (code === 'Escape') { toTitle(); e.preventDefault(); }
    } else {
      if (code === 'Space') boost = false;
    }
  }

  document.addEventListener('keydown', (e) => onKey(e, true));
  document.addEventListener('keyup', (e) => onKey(e, false));
  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (!d || d.type !== 'hub-dpad') return;
    // Already mapped to keys by hub; ignore duplicate if desired
  });
  overlay.addEventListener('click', () => {
    if (state === 'title' || state === 'over' || state === 'pause') startPlay();
  });
  canvas.addEventListener('click', () => {
    if (state === 'title' || state === 'over') startPlay();
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
    ctx.fillStyle = '#0c1016';
    ctx.fillRect(0, 0, W, H);
    // board
    ctx.fillStyle = '#141a22';
    ctx.fillRect(ox, oy, cell * COLS, cell * ROWS);
    // grid subtle
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
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
      const pad = cell * 0.18;
      ctx.fillStyle = '#f87171';
      rr(fx + pad, fy + pad, cell - pad * 2, cell - pad * 2, 4);
      ctx.fill();
    }
    // snake
    for (let i = snake.length - 1; i >= 0; i--) {
      const [sx, sy] = snake[i];
      const t = i / Math.max(1, snake.length - 1);
      const g = Math.floor(80 + (1 - t) * 140);
      ctx.fillStyle = i === 0 ? '#86efac' : 'rgb(40,' + g + ',80)';
      const pad = i === 0 ? cell * 0.08 : cell * 0.14;
      rr(ox + sx * cell + pad, oy + sy * cell + pad, cell - pad * 2, cell - pad * 2, 3);
      ctx.fill();
    }
    if (boost && state === 'play') {
      ctx.fillStyle = 'rgba(110,168,254,0.12)';
      ctx.fillRect(ox, oy, cell * COLS, cell * ROWS);
    }
  }

  function loop(ts) {
    if (!last) last = ts;
    const dt = Math.min(0.05, (ts - last) / 1000);
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
  showOverlay('SNAKE', 'Press Start / Enter', 'or tap / click');
  requestAnimationFrame(loop);
})();
