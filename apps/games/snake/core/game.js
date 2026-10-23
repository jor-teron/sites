/**
 * Snake — game rules and state machine: reset, food, stepping, death,
 * start / pause / title flow and the overlay card.
 */
window.SN = window.SN || {};
(function () {
  'use strict';
  const CFG = SN.CFG, TX = SN.TX, G = SN.G, el = SN.el;
  const COLS = SN.COLS, ROWS = SN.ROWS, OPP = SN.OPP, DELTA = SN.DELTA;

  function showOverlay(title, msg, sub) {
    el.overlay.hidden = false;
    el.title.textContent = title;
    el.msg.textContent = msg;
    el.sub.textContent = sub || '';
  }
  function hideOverlay() { el.overlay.hidden = true; }

  function setWrapInd() { el.wrapInd.className = G.wrap ? 'wrap-on' : 'wrap-off'; }

  function resetGame() {
    const cx = Math.floor(COLS / 2);
    const cy = Math.floor(ROWS / 2);
    G.dir = CFG.grid.startDir;
    G.nextDir = G.dir;
    const [bdx, bdy] = DELTA[G.dir];
    G.snake = [];
    for (let i = 0; i < CFG.grid.startLength; i++) G.snake.push([cx - bdx * i, cy - bdy * i]);
    G.dirQueue = [];
    G.score = CFG.start.score;
    G.wrap = SN.WRAP_START;
    G.boost = false;
    G.acc = 0;
    placeFood();
    el.score.textContent = String(G.score);
    setWrapInd();
    SN.hub.sendStats();
  }

  function placeFood() {
    const taken = new Set(G.snake.map((p) => p[0] + ',' + p[1]));
    let x, y, guard = 0;
    do {
      x = Math.floor(Math.random() * COLS);
      y = Math.floor(Math.random() * ROWS);
      guard++;
    } while (taken.has(x + ',' + y) && guard < 500);
    G.food = [x, y];
  }

  function queueDir(d) {
    if (!DELTA[d]) return;
    const q = G.dirQueue;
    const lastQueued = q.length ? q[q.length - 1] : G.nextDir;
    if (d === lastQueued) return;
    if (OPP[d] === lastQueued) return;
    if (q.length < CFG.input.queueSize) q.push(d);
  }

  function step() {
    if (G.dirQueue.length) G.nextDir = G.dirQueue.shift();
    if (OPP[G.nextDir] !== G.dir) G.dir = G.nextDir;
    const snake = G.snake;
    const [dx, dy] = DELTA[G.dir];
    let nx = snake[0][0] + dx;
    let ny = snake[0][1] + dy;
    if (G.wrap) {
      nx = (nx + COLS) % COLS;
      ny = (ny + ROWS) % ROWS;
    } else if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) {
      return die();
    }
    for (let i = 0; i < snake.length; i++) {
      if (snake[i][0] === nx && snake[i][1] === ny) return die();
    }
    snake.unshift([nx, ny]);
    if (nx === G.food[0] && ny === G.food[1]) {
      G.score += G.boost ? CFG.scoring.foodBoosted : CFG.scoring.food;
      el.score.textContent = String(G.score);
      SN.hub.sendStats();
      SN.hub.rumble(CFG.EAT_VIBRATE_MS);
      placeFood();
    } else {
      snake.pop();
    }
  }

  function die() {
    G.state = 'over';
    if (G.score > G.best) {
      G.best = G.score;
      try { localStorage.setItem(SN.BEST_KEY, String(G.best)); } catch (_) { /* ignore */ }
      el.best.textContent = 'BEST ' + G.best;
      SN.hub.sendStats();
    }
    SN.hub.rumble(CFG.DIE_VIBRATE_MS);
    showOverlay(TX.gameOver, 'Score ' + G.score, 'Best ' + G.best + ' — Start / Enter');
  }

  function startPlay() {
    if (G.state === 'title' || G.state === 'over') {
      resetGame();
      G.state = 'play';
      hideOverlay();
    } else if (G.state === 'pause') {
      G.state = 'play';
      hideOverlay();
    } else if (G.state === 'play') {
      G.state = 'pause';
      showOverlay(TX.paused, TX.pressStart, '');
    }
  }

  /** Start key: toggles pause, except right after a tap/click started the game. */
  function onStartKey() {
    if (G.state === 'play' && performance.now() - G.clickStartAt < CFG.input.clickStartGraceMs) {
      G.clickStartAt = -Infinity; // swallow once: the game is already running
      return;
    }
    startPlay();
  }

  /** Tap/click start (title / game over / resume from pause). */
  function clickStart() {
    const wasStarting = G.state === 'title' || G.state === 'over';
    startPlay();
    if (wasStarting && G.state === 'play') G.clickStartAt = performance.now();
  }

  /** A / Space: pause or resume a running game (nothing on title / game over). */
  function togglePause() {
    if (G.state === 'play' || G.state === 'pause') startPlay();
  }

  /** New game at once (hub header "New Game"). */
  function newGame() {
    resetGame();
    G.state = 'play';
    hideOverlay();
  }

  function toTitle() {
    G.state = 'title';
    resetGame();
    showOverlay(TX.title, TX.pressStart, TX.titleSub);
  }

  /** Wrap walls toggle (B / X). */
  function toggleWrap() {
    G.wrap = !G.wrap;
    setWrapInd();
  }

  SN.game = {
    showOverlay, hideOverlay, resetGame, queueDir, step, startPlay, onStartKey,
    clickStart, togglePause, newGame, toTitle, toggleWrap,
  };
})();
