/*
  ============================================================
  File:        2048_logic.js
  Project:     2048
  Purpose:     Game logic for a 4x4 2048 board.
               Swipe, arrow keys, WASD, undo, best score,
               saved game, sites hub bridge (header stats /
               buttons, phone rumble).
  Location:    apps/games/2048/2048_logic.js
  Depends on:  2048_config.js (G2048_CONFIG) and 2048.html
               element ids (stage, board, score, best,
               overlay, undo-btn, new-btn).
  Storage:     localStorage keys from G2048_CONFIG.storage
               (best score, current game). Every access is
               wrapped: blocked storage just means no saving.
  Notes:       Tiles are DOM nodes moved with translate on the
               outer element; the appear / pop animations run on
               an inner element so they never cancel the move.
               grid[][] is the source of truth for values.
  ============================================================
*/
(() => {
  'use strict';

  const CFG = (typeof G2048_CONFIG !== 'undefined' && G2048_CONFIG) || {};
  const APP = CFG.APP || { name: '2048', version: '' };
  const RUMBLE = CFG.rumble || {};
  const KEYS = CFG.keys || {};
  const STORE = CFG.storage || { best: '2048_best', game: '2048_game' };

  /* Board is always 4x4 */
  const SIZE = 4;
  /* Pixel gap between cells (also the board frame padding) */
  const GAP = 8;
  /* Slide time; must match the .tile transition in 2048.css */
  const SLIDE_MS = 120;
  /* Tile value that wins */
  const WIN_VALUE = 2048;
  /* Smallest cell; the board is fitted to the free space down to this */
  const MIN_CELL = 24;
  /* Undo levels kept (moves) */
  const UNDO_LEVELS = 3;

  // ---------- DOM ----------
  const stageEl      = document.getElementById('stage');
  const boardEl      = document.getElementById('board');
  const boardWrapEl  = document.getElementById('board-wrap');
  const scoreEl      = document.getElementById('score');
  const bestEl       = document.getElementById('best');
  const overlay      = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayMsg   = document.getElementById('overlay-msg');
  const overlayBtn   = document.getElementById('overlay-btn');
  const overlayUndo  = document.getElementById('overlay-undo');
  const undoBtn      = document.getElementById('undo-btn');
  const newBtn       = document.getElementById('new-btn');

  // ---------- STORAGE (never throws) ----------
  function store(key, val) {
    try { localStorage.setItem(key, val); } catch (_) { /* blocked / full: no saving */ }
  }
  function load(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }

  // ---------- STATE ----------
  let grid = [];                 // grid[r][c] = value (0 = empty)
  let tiles = new Map();         // tileId -> { id, value, r, c, el, inner }
  let nextTileId = 1;
  let score = 0;
  let best = Number(load(STORE.best)) || 0;
  let won = false;               // a 2048 tile was made this game (win overlay shown once)
  let gameOver = false;
  let overlayMode = null;        // null | 'win' | 'over'
  let busy = false;              // a move is animating
  let pendingMove = null;        // one move queued during the animation
  let undoStack = [];            // [{ grid, score, won }] newest last
  let CELL = 96;

  // ---------- SIZE ----------
  /**
   * Fit the board into the stage (never larger than the free space) and
   * resize / reposition every tile. Boot, resize, rotate, hub layout change.
   */
  function computeCellSize() {
    const rect = stageEl.getBoundingClientRect();
    const cs = getComputedStyle(stageEl);
    const availW = rect.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const availH = rect.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const avail = Math.min(availW, availH);
    CELL = Math.max(MIN_CELL, Math.floor((avail - GAP * (SIZE + 1)) / SIZE));

    const inner = CELL * SIZE + GAP * (SIZE - 1);
    const boardSize = inner + GAP * 2;
    boardWrapEl.style.width = boardSize + 'px';
    boardWrapEl.style.height = boardSize + 'px';
    boardEl.style.width = inner + 'px';
    boardEl.style.height = inner + 'px';
    boardEl.style.gap = GAP + 'px';
    boardEl.style.gridTemplateColumns = `repeat(${SIZE}, ${CELL}px)`;
    boardEl.style.gridTemplateRows = `repeat(${SIZE}, ${CELL}px)`;

    for (const t of tiles.values()) {
      sizeTile(t);
      positionTile(t, true);
    }
  }

  let resizeRaf = 0;
  function scheduleResize() {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(computeCellSize);
  }
  window.addEventListener('resize', scheduleResize);
  window.addEventListener('orientationchange', () => setTimeout(computeCellSize, 60));
  if (typeof ResizeObserver === 'function') new ResizeObserver(scheduleResize).observe(stageEl);

  // ---------- BOARD SETUP ----------
  function buildCells() {
    boardEl.innerHTML = '';
    for (let i = 0; i < SIZE * SIZE; i++) {
      const c = document.createElement('div');
      c.className = 'cell';
      boardEl.appendChild(c);
    }
  }

  // ---------- TILE VISUALS ----------
  /* Background and text color per tile value */
  const TILE_STYLES = {
    2:    { bg: '#3B3BFF', fg: '#FFFFFF' },
    4:    { bg: '#5B5BFF', fg: '#FFFFFF' },
    8:    { bg: '#FF6B6B', fg: '#FFFFFF' },
    16:   { bg: '#FF8C42', fg: '#FFFFFF' },
    32:   { bg: '#FFB852', fg: '#FFFFFF' },
    64:   { bg: '#FFD700', fg: '#1a1a1a' },
    128:  { bg: '#FFE66D', fg: '#1a1a1a' },
    256:  { bg: '#B8FF6B', fg: '#1a1a1a' },
    512:  { bg: '#6BFFB8', fg: '#1a1a1a' },
    1024: { bg: '#6BE8FF', fg: '#1a1a1a' },
    2048: { bg: '#FF6BFF', fg: '#1a1a1a' },
    4096: { bg: '#FF3BFF', fg: '#FFFFFF' },
    8192: { bg: '#FFFFFF', fg: '#1a1a1a' }
  };
  function styleFor(value) {
    return TILE_STYLES[value] || { bg: '#FFFFFF', fg: '#1a1a1a' };
  }

  /** Font size that fits the digit count inside the cell. */
  function fontSizeFor(value) {
    const len = String(value).length;
    if (len <= 2) return Math.floor(CELL * 0.45) + 'px';
    if (len === 3) return Math.floor(CELL * 0.36) + 'px';
    if (len === 4) return Math.floor(CELL * 0.28) + 'px';
    return Math.floor(CELL * 0.22) + 'px';
  }

  /** Width / height / font from the current CELL. */
  function sizeTile(t) {
    t.el.style.width = CELL + 'px';
    t.el.style.height = CELL + 'px';
    t.inner.style.fontSize = fontSizeFor(t.value);
  }

  /** Colours + label for the tile value. */
  function paintTile(t) {
    const st = styleFor(t.value);
    t.inner.style.background = st.bg;
    t.inner.style.color = st.fg;
    t.inner.style.fontSize = fontSizeFor(t.value);
    t.inner.textContent = t.value;
  }

  /** Restart a CSS animation class on the inner element ('new' / 'merged'). */
  function animateTile(t, cls) {
    t.inner.classList.remove('new', 'merged');
    void t.inner.offsetWidth;
    t.inner.classList.add(cls);
  }

  /** Create a tile (outer = position, inner = colour + animation) at r, c. */
  function addTile(value, r, c, isNew) {
    const el = document.createElement('div');
    el.className = 'tile';
    const inner = document.createElement('div');
    inner.className = 'tile-inner';
    el.appendChild(inner);
    const t = { id: nextTileId++, value, r, c, el, inner };
    paintTile(t);
    sizeTile(t);
    boardEl.appendChild(el);
    positionTile(t, true);
    if (isNew) animateTile(t, 'new');
    tiles.set(t.id, t);
    return t;
  }

  /** Place a tile at its row / col with translate on the outer element. */
  function positionTile(t, instant) {
    const x = t.c * (CELL + GAP);
    const y = t.r * (CELL + GAP);
    if (instant) t.el.style.transition = 'none';
    t.el.style.transform = `translate(${x}px, ${y}px)`;
    if (instant) {
      void t.el.offsetHeight;   // next transition is not skipped
      t.el.style.transition = '';
    }
  }

  // ---------- GRID ----------
  function emptyGrid() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  }
  function copyGrid(g) {
    return g.map((row) => row.slice());
  }

  /** Replace every tile with the values of grid (undo / restore). */
  function rebuildTiles() {
    for (const t of tiles.values()) t.el.remove();
    tiles.clear();
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (grid[r][c]) addTile(grid[r][c], r, c, false);
      }
    }
  }

  /** Drop a 2 (90%) or 4 (10%) into a random empty cell. */
  function spawnRandomTile() {
    const empties = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) if (grid[r][c] === 0) empties.push({ r, c });
    }
    if (!empties.length) return null;
    const spot = empties[Math.floor(Math.random() * empties.length)];
    const value = Math.random() < 0.9 ? 2 : 4;
    grid[spot.r][spot.c] = value;
    return addTile(value, spot.r, spot.c, true);
  }

  /** True if any empty cell or equal neighbour remains. */
  function hasMoves() {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const v = grid[r][c];
        if (v === 0) return true;
        if (c + 1 < SIZE && grid[r][c + 1] === v) return true;
        if (r + 1 < SIZE && grid[r + 1][c] === v) return true;
      }
    }
    return false;
  }

  // ---------- SCORE ----------
  function renderScore() {
    scoreEl.textContent = score;
    bestEl.textContent = best;
    hubSendStats();
  }
  function addScore(delta) {
    score += delta;
    if (score > best) {
      best = score;
      store(STORE.best, String(best));
    }
    renderScore();
  }

  // ---------- SAVE / RESTORE GAME ----------
  function saveGame() {
    store(STORE.game, JSON.stringify({ v: 1, grid, score, won, over: gameOver }));
  }

  /** Saved game → state. Returns false when there is none / it is invalid. */
  function restoreGame() {
    let s = null;
    try { s = JSON.parse(load(STORE.game) || 'null'); } catch (_) { s = null; }
    if (!s || s.v !== 1 || !Array.isArray(s.grid) || s.grid.length !== SIZE) return false;
    const okVal = (v) => v === 0 || (Number.isInteger(v) && v >= 2 && (v & (v - 1)) === 0);
    if (!s.grid.every((row) => Array.isArray(row) && row.length === SIZE && row.every(okVal))) return false;
    if (!s.grid.some((row) => row.some((v) => v > 0))) return false;
    grid = copyGrid(s.grid);
    score = Number(s.score) || 0;
    won = !!s.won;
    gameOver = false;
    undoStack = [];
    rebuildTiles();
    renderScore();
    renderUndo();
    hideOverlay();
    if (s.over || !hasMoves()) endGame(false);
    return true;
  }

  // ---------- UNDO ----------
  function renderUndo() {
    const can = undoStack.length > 0;
    undoBtn.disabled = !can;
    overlayUndo.hidden = !can;
  }

  function undo() {
    if (!undoStack.length) return;
    finishPending();
    const snap = undoStack.pop();
    grid = copyGrid(snap.grid);
    score = snap.score;
    won = snap.won;
    gameOver = false;
    rebuildTiles();
    hideOverlay();
    renderScore();
    renderUndo();
    saveGame();
  }

  // ---------- MOVE ----------
  /** Lines of [r, c] cells, each ordered from the destination edge inwards. */
  function linesFor(dir) {
    const lines = [];
    for (let i = 0; i < SIZE; i++) {
      const line = [];
      for (let j = 0; j < SIZE; j++) {
        if (dir === 'left') line.push([i, j]);
        else if (dir === 'right') line.push([i, SIZE - 1 - j]);
        else if (dir === 'up') line.push([j, i]);
        else line.push([SIZE - 1 - j, i]);
      }
      lines.push(line);
    }
    return lines;
  }

  function findTileAt(r, c) {
    for (const t of tiles.values()) if (t.r === r && t.c === c) return t;
    return null;
  }

  /**
   * Slide and merge in one direction. Each tile merges at most once per move;
   * a new tile spawns only when the board changed. Returns true if it changed.
   */
  function move(dir) {
    if (gameOver || overlayMode) return false;
    if (busy) { pendingMove = dir; return false; }   // one move queued, not dropped

    const before = { grid: copyGrid(grid), score, won };
    const next = emptyGrid();
    let moved = false;
    let gain = 0;
    let biggest = 0;
    let justWon = false;

    for (const line of linesFor(dir)) {
      let slot = 0;          // next free index along the line
      let last = null;       // last placed tile that may still merge: { t, merged }
      for (const [r, c] of line) {
        if (!grid[r][c]) continue;
        const t = findTileAt(r, c);
        if (last && !last.merged && last.t.value === t.value) {
          // merge t into last (merge-once: last.merged)
          const keep = last.t;
          keep.value *= 2;
          last.merged = true;
          const [kr, kc] = line[slot - 1];
          next[kr][kc] = keep.value;
          t.r = kr; t.c = kc;
          positionTile(t, false);
          tiles.delete(t.id);
          const victim = t.el;
          setTimeout(() => victim.remove(), SLIDE_MS);
          paintTile(keep);
          animateTile(keep, 'merged');
          gain += keep.value;
          biggest = Math.max(biggest, keep.value);
          if (keep.value >= WIN_VALUE && !won) { won = true; justWon = true; }
          moved = true;
        } else {
          const [nr, nc] = line[slot++];
          next[nr][nc] = t.value;
          if (nr !== r || nc !== c) {
            t.r = nr; t.c = nc;
            positionTile(t, false);
            moved = true;
          }
          last = { t, merged: false };
        }
      }
    }

    if (!moved) return false;
    grid = next;
    if (gain) addScore(gain);
    undoStack.push(before);
    if (undoStack.length > UNDO_LEVELS) undoStack.shift();
    renderUndo();

    if (justWon) hubRumble(RUMBLE.winPattern);
    else if (biggest && biggest >= (RUMBLE.bigTileMin || Infinity)) hubRumble(RUMBLE.bigTileMs);

    busy = true;
    settleTimer = setTimeout(() => settle(justWon), SLIDE_MS + 10);
    return true;
  }

  let settleTimer = 0;
  /** After the slide: spawn, check game over / win, save, run a queued move. */
  function settle(justWon) {
    settleTimer = 0;
    busy = false;
    spawnRandomTile();
    if (!hasMoves()) endGame(true);
    else if (justWon) showOverlay('win');
    saveGame();
    const q = pendingMove;
    pendingMove = null;
    if (q && !overlayMode) move(q);
  }

  /** Undo / new game while a slide is still animating: finish it first. */
  function finishPending() {
    pendingMove = null;
    if (settleTimer) {
      clearTimeout(settleTimer);
      settleTimer = 0;
      busy = false;
      spawnRandomTile();
    }
  }

  function endGame(rumble) {
    gameOver = true;
    if (score > best) {
      best = score;
      store(STORE.best, String(best));
      renderScore();
    }
    showOverlay('over');
    if (rumble) hubRumble(RUMBLE.gameOverMs);
  }

  // ---------- OVERLAY ----------
  function showOverlay(mode) {
    overlayMode = mode;
    if (mode === 'win') {
      overlayTitle.textContent = 'YOU WIN!';
      overlayMsg.textContent = `Score: ${score}`;
      overlayBtn.textContent = 'KEEP GOING';
    } else {
      overlayTitle.textContent = 'GAME OVER';
      overlayMsg.textContent = `Score: ${score}  •  Best: ${best}` + (won ? '  •  2048 reached!' : '');
      overlayBtn.textContent = 'TRY AGAIN';
    }
    renderUndo();
    overlay.classList.remove('hidden');
  }
  function hideOverlay() {
    overlayMode = null;
    overlay.classList.add('hidden');
  }
  /** Overlay main action by state: win → keep playing, game over → new game. */
  function overlayAction() {
    if (overlayMode === 'win') hideOverlay();
    else if (overlayMode === 'over') newGame();
  }

  // ---------- INPUT: KEYBOARD ----------
  const KEY_ACTION = {};
  const addKeys = (list, action) => (list || []).forEach((k) => { KEY_ACTION[k] = action; });
  addKeys(KEYS.up || ['ArrowUp'], 'up');
  addKeys(KEYS.down || ['ArrowDown'], 'down');
  addKeys(KEYS.left || ['ArrowLeft'], 'left');
  addKeys(KEYS.right || ['ArrowRight'], 'right');
  addKeys(KEYS.confirm || ['Enter', ' '], 'confirm');
  addKeys(KEYS.undo || ['Escape', 'Backspace'], 'undo');
  addKeys(KEYS.newGame || [], 'new');

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;   // leave browser shortcuts alone
    const action = KEY_ACTION[e.key];
    if (!action) return;
    e.preventDefault();
    if (action === 'undo') { if (!e.repeat) undo(); return; }
    if (action === 'new') { if (!e.repeat) newGame(); return; }
    if (action === 'confirm') { if (!e.repeat && overlayMode) overlayAction(); return; }
    if (!overlayMode) move(action);
  });

  // ---------- INPUT: TOUCH ----------
  let touchStart = null;
  let touchMoved = false;

  boardWrapEl.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    touchStart = { x: t.clientX, y: t.clientY };
    touchMoved = false;
  }, { passive: true });

  boardWrapEl.addEventListener('touchmove', (e) => {
    if (!touchStart || touchMoved) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    if (Math.hypot(dx, dy) < 24) return;
    touchMoved = true;
    if (overlayMode) return;
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
    else move(dy > 0 ? 'down' : 'up');
  }, { passive: true });

  boardWrapEl.addEventListener('touchend', () => {
    touchStart = null;
    touchMoved = false;
  }, { passive: true });

  // Mouse drag on desktop
  let mouseStart = null;
  boardWrapEl.addEventListener('mousedown', (e) => {
    mouseStart = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener('mouseup', (e) => {
    if (!mouseStart) return;
    const dx = e.clientX - mouseStart.x;
    const dy = e.clientY - mouseStart.y;
    mouseStart = null;
    if (Math.hypot(dx, dy) < 24 || overlayMode) return;
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
    else move(dy > 0 ? 'down' : 'up');
  });

  // ---------- CONTROLS ----------
  overlayBtn.addEventListener('click', overlayAction);
  overlayUndo.addEventListener('click', undo);
  undoBtn.addEventListener('click', undo);
  newBtn.addEventListener('click', newGame);

  // ---------- NEW GAME ----------
  function newGame() {
    finishPending();
    grid = emptyGrid();
    for (const t of tiles.values()) t.el.remove();
    tiles.clear();
    score = 0;
    won = false;
    gameOver = false;
    undoStack = [];
    hideOverlay();
    renderScore();
    renderUndo();
    spawnRandomTile();
    spawnRandomTile();
    saveGame();
  }

  // ---------- HUB BRIDGE ----------
  /*
   * Optional; same protocol as Snake / hub-gamebar.js (v:1). Only in a frame, after
   * the hub's hello:
   *   game → hub  {type:'hub-ready'}                     on load
   *   hub → game  {type:'hub-hello'}                     → body.in-hub, reply hub-app
   *   game → hub  {type:'hub-app', app, stats, buttons}  Score / Best, New Game / Undo
   *   game → hub  {type:'hub-stat', id, value}           when Score / Best change
   *   hub → game  {type:'hub-action', id:'new'|'undo'}
   *   game → hub  {type:'hub-rumble', ms | pattern}      big tile / 2048 / game over
   *               → the hub relays it to the paired phone controller
   * Accepted only from window.parent with a same-origin / file:// origin.
   */
  const HUB_V = 1;
  const IN_FRAME = (() => { try { return window.parent && window.parent !== window; } catch (_) { return true; } })();
  let hubLinked = false;
  const hubLastSent = {};

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
      { id: 'score', label: 'Score', value: score },
      { id: 'best', label: 'Best', value: best },
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
        document.body.classList.add('in-hub');   // own HUD / buttons hidden: more board
        scheduleResize();
      }
      const stats = hubStats();
      stats.forEach((st) => { hubLastSent[st.id] = st.value; });
      hubPost({
        type: 'hub-app',
        app: { name: APP.name, version: APP.version },
        stats: stats,
        buttons: [{ id: 'new', label: 'New Game' }, { id: 'undo', label: 'Undo' }],
      });
    } else if (d.type === 'hub-action' && hubLinked) {
      if (d.id === 'new') newGame();
      else if (d.id === 'undo') undo();
    }
  }
  if (IN_FRAME) window.addEventListener('message', onHubMessage);

  // ---------- BOOT ----------
  buildCells();
  computeCellSize();
  grid = emptyGrid();
  renderScore();
  if (!restoreGame()) newGame();
  hubPost({ type: 'hub-ready' });

  // Delay one frame so the layout has settled (fonts, safe areas)
  requestAnimationFrame(computeCellSize);
})();
