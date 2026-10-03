/**
 * Snake — grid snake with boost, wrap-around walls, keyboard + hub D-pad.
 * Game logic. Every tunable value comes from SNAKE_CONFIG (snake_config.js).
 * Keys: arrows/WASD move, Space (A) pause/resume, Enter/P (Start) new game or
 * pause/resume, Esc/R (Select) title, X (B) wrap toggle, Shift boost.
 * Touch / mouse: swipe anywhere to turn, tap = start / pause / restart,
 * optional on-screen D-pad (CFG.touch).
 * Hub bridge at the bottom (header stats + New Game, death rumble); standalone
 * the page is unchanged and keeps its own HUD.
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
  const APP = CFG.APP || { name: 'Snake', version: '' };
  const WRAP_START = CFG.WRAP_WALLS !== undefined ? !!CFG.WRAP_WALLS : !!(CFG.start && CFG.start.wrap);
  if (APP.name) document.title = APP.name;

  let dpr = 1, W = 0, H = 0, cell = 0, ox = 0, oy = 0;
  let state = 'title'; // title | play | pause | over
  let snake, dir, nextDir, dirQueue, food, score, best, wrap, boost;
  let acc = 0, last = 0;
  let clickStartAt = -Infinity; // time a tap/click started the game
  // Hub bridge state (functions at the bottom)
  const HUB_V = 1;
  const IN_FRAME = (() => { try { return window.parent && window.parent !== window; } catch (_) { return true; } })();
  let hubLinked = false;
  const hubLastSent = {};

  try { best = Number(localStorage.getItem(BEST_KEY) || 0) || 0; } catch (_) { best = 0; }
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
    wrap = WRAP_START;
    boost = false;
    acc = 0;
    placeFood();
    scoreEl.textContent = String(score);
    wrapInd.className = wrap ? 'wrap-on' : 'wrap-off';
    hubSendStats();
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
      hubSendStats();
      placeFood();
    } else {
      snake.pop();
    }
  }

  function die() {
    state = 'over';
    if (score > best) {
      best = score;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch (_) { /* ignore */ }
      bestEl.textContent = 'BEST ' + best;
      hubSendStats();
    }
    hubRumble(CFG.DIE_VIBRATE_MS);
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

  /** A / Space: pause or resume a running game (nothing on title / game over). */
  function togglePause() {
    if (state === 'play' || state === 'pause') startPlay();
  }

  /** New game at once (hub header "New Game"). */
  function newGame() {
    resetGame();
    state = 'play';
    hideOverlay();
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
      else if (K.pause && isKey(K.pause, e)) { if (!e.repeat) togglePause(); e.preventDefault(); }
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

  /* ---------------------------------------------------------------------------
   * Touch / mouse (pointer events, anywhere on screen; one pointer at a time).
   * Swipe: a direction is queued as soon as the finger moves CFG.touch.swipeMinPx
   * from the anchor; the anchor then moves to that point, so a new swipe can be
   * chained in the same touch. queueDir() ignores reverses / repeats and keeps up
   * to input.queueSize turns. Tap (short, small move) = start / restart after
   * game over / pause-resume. The D-pad and its toggle are excluded (.ui).
   * ------------------------------------------------------------------------- */
  const TC = Object.assign({ swipeMinPx: 24, tapMaxMs: 300, tapMaxMovePx: 12, showDpad: false, dpadKey: 'snake-dpad' }, CFG.touch || {});
  let ptr = null; // {id, x0, y0, ax, ay, t0, swiped, maxMove}
  function onTap() {
    if (state === 'play') togglePause();
    else clickStart(); // title / over → new game, pause → resume
  }
  window.addEventListener('pointerdown', (e) => {
    if (e.target.closest && e.target.closest('.ui')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (ptr) return;
    ptr = { id: e.pointerId, x0: e.clientX, y0: e.clientY, ax: e.clientX, ay: e.clientY, t0: performance.now(), swiped: false, maxMove: 0 };
  });
  window.addEventListener('pointermove', (e) => {
    if (!ptr || e.pointerId !== ptr.id) return;
    ptr.maxMove = Math.max(ptr.maxMove, Math.hypot(e.clientX - ptr.x0, e.clientY - ptr.y0));
    const dx = e.clientX - ptr.ax, dy = e.clientY - ptr.ay;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < TC.swipeMinPx) return;
    const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    ptr.ax = e.clientX; ptr.ay = e.clientY; ptr.swiped = true;
    if (state === 'play' || state === 'pause') queueDir(d);
  });
  function endPtr(e, cancelled) {
    if (!ptr || e.pointerId !== ptr.id) return;
    const p = ptr; ptr = null;
    if (cancelled || p.swiped) return;
    if (performance.now() - p.t0 <= TC.tapMaxMs && p.maxMove <= TC.tapMaxMovePx) onTap();
  }
  window.addEventListener('pointerup', (e) => endPtr(e, false));
  window.addEventListener('pointercancel', (e) => endPtr(e, true));
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });

  // Optional on-screen D-pad (off by default; toggle saved in localStorage)
  const dpadEl = document.getElementById('dpad');
  const dpadToggle = document.getElementById('dpad-toggle');
  let dpadOn = !!TC.showDpad;
  try { const v = localStorage.getItem(TC.dpadKey); if (v === '1' || v === '0') dpadOn = v === '1'; } catch (_) { /* ignore */ }
  function renderDpad() {
    dpadEl.hidden = !dpadOn;
    dpadToggle.classList.toggle('on', dpadOn);
    dpadToggle.setAttribute('aria-pressed', String(dpadOn));
    dpadToggle.title = dpadOn ? (TX.dpadHide || 'Hide D-pad') : (TX.dpadShow || 'Show D-pad');
  }
  function setDpad(on) {
    dpadOn = !!on;
    try { localStorage.setItem(TC.dpadKey, dpadOn ? '1' : '0'); } catch (_) { /* ignore */ }
    renderDpad();
    hubSendApp();
  }
  dpadToggle.addEventListener('click', () => { setDpad(!dpadOn); dpadToggle.blur(); });
  dpadEl.querySelectorAll('[data-dir]').forEach((b) => {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (state === 'play' || state === 'pause') queueDir(b.dataset.dir);
    });
  });
  renderDpad();

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

  /* ---------------------------------------------------------------------------
   * Hub bridge (optional; same protocol as Swell Foop / hub-gamebar.js, v:1).
   * Only active in a frame, after the hub's hello:
   *   game → hub  {type:'hub-ready'}                     on load
   *   hub → game  {type:'hub-hello'}                     → body.in-hub, reply hub-app
   *   game → hub  {type:'hub-app', app, stats, buttons}  Score / Best, New Game
   *   game → hub  {type:'hub-stat', id, value}           when Score / Best change
   *   hub → game  {type:'hub-action', id:'new'}          → new game
   *   game → hub  {type:'hub-rumble', ms}                on death (DIE_VIBRATE_MS;
   *               an array is sent as pattern) → hub relays to the paired phone
   * Accepted only from window.parent with a same-origin / file:// origin.
   * ------------------------------------------------------------------------- */
  function hubPost(msg) {
    if (!IN_FRAME) return;
    try { window.parent.postMessage(Object.assign({ v: HUB_V }, msg), '*'); } catch (_) { /* ignore */ }
  }
  function hubOriginOk(origin) {
    return origin === location.origin || origin === 'null' || location.origin === 'null' ||
      String(origin).indexOf('file:') === 0;
  }
  function hubStats() {
    return [
      { id: 'score', label: TX.statScore || 'Score', value: score },
      { id: 'best', label: TX.statBest || 'Best', value: best },
    ];
  }
  function hubSendStats() {
    if (!hubLinked) return;
    hubStats().forEach((st) => {
      if (hubLastSent[st.id] === st.value) return;
      hubLastSent[st.id] = st.value;
      hubPost({ type: 'hub-stat', id: st.id, value: st.value });
    });
  }
  function hubSendApp() {
    if (!hubLinked) return;
    const stats = hubStats();
    stats.forEach((st) => { hubLastSent[st.id] = st.value; });
    hubPost({
      type: 'hub-app',
      app: { name: APP.name, version: APP.version },
      stats: stats,
      buttons: [
        { id: 'new', label: TX.newGame || 'New Game' },
        { id: 'dpad', label: dpadOn ? (TX.hubDpadOn || 'D-pad: On') : (TX.hubDpadOff || 'D-pad: Off') },
      ],
    });
  }
  function hubRumble(v) {
    if (!hubLinked || !v) return;
    if (Array.isArray(v)) hubPost({ type: 'hub-rumble', pattern: v.slice(0, 20) });
    else if (Number(v) > 0) hubPost({ type: 'hub-rumble', ms: Number(v) });
  }
  function onHubMessage(e) {
    if (e.source !== window.parent || !hubOriginOk(e.origin)) return;
    const d = e.data;
    if (!d || typeof d !== 'object' || d.v !== HUB_V) return;
    if (d.type === 'hub-hello') {
      if (!hubLinked) {
        hubLinked = true;
        document.body.classList.add('in-hub');
      }
      hubSendApp();
    } else if (d.type === 'hub-action' && hubLinked && d.id === 'new') {
      newGame();
    } else if (d.type === 'hub-action' && hubLinked && d.id === 'dpad') {
      setDpad(!dpadOn);
    }
  }
  if (IN_FRAME) window.addEventListener('message', onHubMessage);

  window.addEventListener('resize', resize);
  resize();
  resetGame();
  showOverlay(TX.title, TX.pressStart, TX.titleSub);
  requestAnimationFrame(loop);
  hubPost({ type: 'hub-ready' });

  // Read-only peek for debugging / tests
  window.__snake = {
    get state() { return state; }, get dir() { return dir; }, get head() { return snake[0].slice(); },
    get score() { return score; }, get best() { return best; }, get wrap() { return wrap; },
    get length() { return snake.length; }, get inHub() { return hubLinked; }, get food() { return food.slice(); },
    get queue() { return dirQueue.slice(); }, get dpad() { return dpadOn; },
  };
})();
