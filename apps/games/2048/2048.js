/*
  ============================================================
  File:        2048.js
  Project:     2048
  Purpose:     Game logic for a 4x4 2048 board.
               Swipe, arrow keys, WASD, undo, best score.
  Location:    2048/2048.js
  Depends on:  2048.html element ids (board, score, best,
               overlay, undo-btn, new-btn).
  Storage:     localStorage key "2048_best".
  Notes:       Tiles are DOM nodes moved with translate.
               Grid array is the source of truth for values.
  ============================================================
*/
(() => {
  'use strict';

  /* Board is always 4x4 */
  const SIZE = 4;
  /* Pixel gap between cells; must match CSS gap */
  const GAP = 8;

  // ---------- DOM ----------
  /* Grid element that holds cells and tiles */
  const boardEl      = document.getElementById('board');
  /* Indigo frame; also the swipe hit target */
  const boardWrapEl  = document.getElementById('board-wrap');
  /* Current score readout */
  const scoreEl      = document.getElementById('score');
  /* Best score readout */
  const bestEl       = document.getElementById('best');
  /* Win / lose panel */
  const overlay      = document.getElementById('overlay');
  /* Overlay heading */
  const overlayTitle = document.getElementById('overlay-title');
  /* Overlay body text */
  const overlayMsg   = document.getElementById('overlay-msg');
  /* Overlay action button */
  const overlayBtn   = document.getElementById('overlay-btn');
  /* Undo last move */
  const undoBtn      = document.getElementById('undo-btn');
  /* Start a fresh board */
  const newBtn       = document.getElementById('new-btn');

  // ---------- STATE ----------
  // grid[r][c] = value (0 = empty)
  /* Value grid. 0 means empty cell. */
  let grid = [];
  /* Live tiles keyed by id */
  let tiles = new Map();   // tileId -> { id, value, r, c, el }
  /* Next unique tile id */
  let nextTileId = 1;
  /* Running score for this game */
  let score = 0;
  /* All-time best, loaded from localStorage */
  let best = +(localStorage.getItem('2048_best') || 0);
  /* True after the player first reaches 2048 */
  let won = false;
  /* True when no moves remain */
  let gameOver = false;
  let busy = false;        // block input during animation
  /* Snapshot taken before the last successful move */
  let undoState = null;    // { grid, score, tiles }

  // ---------- CELL SIZE ----------
  /* Current cell side length in pixels */
  let CELL = 96;

  /**
   * Fit the board to the stage. Repositions existing tiles.
   * Called on boot, resize, and orientation change.
   */
  function computeCellSize() {
    const stage = document.getElementById('stage');
    const rect = stage.getBoundingClientRect();
    const availW = Math.max(200, rect.width - 32);
    const availH = Math.max(200, rect.height - 32);
    const usableW = availW - GAP * (SIZE + 1);
    const usableH = availH - GAP * (SIZE + 1);
    const cell = Math.floor(Math.min(usableW, usableH) / SIZE);
    CELL = Math.max(48, cell);

    const boardSize = CELL * SIZE + GAP * (SIZE + 1);

    boardWrapEl.style.width = boardSize + 'px';
    boardWrapEl.style.height = boardSize + 'px';
    boardEl.style.width  = (CELL * SIZE + GAP * (SIZE - 1)) + 'px';
    boardEl.style.height = (CELL * SIZE + GAP * (SIZE - 1)) + 'px';
    boardEl.style.gap = GAP + 'px';
    boardEl.style.gridTemplateColumns = `repeat(${SIZE}, ${CELL}px)`;
    boardEl.style.gridTemplateRows    = `repeat(${SIZE}, ${CELL}px)`;

    // Reposition existing tiles
    for (const t of tiles.values()) {
      positionTile(t, /*instant*/ true);
    }
  }

  window.addEventListener('resize', computeCellSize);
  window.addEventListener('orientationchange', () => setTimeout(computeCellSize, 60));

  // ---------- BOARD SETUP ----------
  /**
   * Build the 16 static background cells.
   */
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

  /**
   * Look up colors for a tile value. Fallback is white on dark.
   * @param {number} value
   * @returns {{bg: string, fg: string}}
   */
  function styleFor(value) {
    return TILE_STYLES[value] || { bg: '#FFFFFF', fg: '#1a1a1a' };
  }

  /**
   * Create a tile DOM node and append it to the board.
   * @param {number} value
   * @param {boolean} isNew  true plays the appear animation
   * @returns {HTMLElement}
   */
  function makeTileEl(value, isNew) {
    const el = document.createElement('div');
    el.className = 'tile' + (isNew ? ' new' : '');
    const st = styleFor(value);
    el.style.background = st.bg;
    el.style.color = st.fg;
    el.style.width  = CELL + 'px';
    el.style.height = CELL + 'px';
    el.style.fontSize = fontSizeFor(value);
    el.textContent = value;
    boardEl.appendChild(el);
    return el;
  }

  /**
   * Font size that fits the digit count inside the cell.
   * @param {number} value
   * @returns {string}
   */
  function fontSizeFor(value) {
    const len = String(value).length;
    if (len <= 2) return Math.floor(CELL * 0.45) + 'px';
    if (len === 3) return Math.floor(CELL * 0.36) + 'px';
    if (len === 4) return Math.floor(CELL * 0.28) + 'px';
    return Math.floor(CELL * 0.22) + 'px';
  }

  /**
   * Place a tile at its row/col using translate.
   * @param {{r: number, c: number, el: HTMLElement}} t
   * @param {boolean} instant  skip the slide transition
   */
  function positionTile(t, instant = false) {
    // Board-relative position: board has no padding, gap is internal
    const x = t.c * (CELL + GAP);
    const y = t.r * (CELL + GAP);

    if (instant) {
      t.el.style.transition = 'none';
    }
    t.el.style.transform = `translate(${x}px, ${y}px)`;
    if (instant) {
      // Force reflow so next transition isn't skipped
      void t.el.offsetHeight;
      t.el.style.transition = '';
    }
  }

  /**
   * Refresh a tile's color, size, and label after a merge.
   * @param {{value: number, el: HTMLElement}} t
   */
  function updateTileStyle(t) {
    const st = styleFor(t.value);
    t.el.style.background = st.bg;
    t.el.style.color = st.fg;
    t.el.style.fontSize = fontSizeFor(t.value);
    t.el.textContent = t.value;
  }

  // ---------- GAME LOGIC ----------
  /**
   * Empty SIZE x SIZE grid of zeros.
   * @returns {number[][]}
   */
  function emptyGrid() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  }

  /**
   * Rebuild the value grid from the live tile map.
   * @returns {number[][]}
   */
  function gridFromTiles() {
    const g = emptyGrid();
    for (const t of tiles.values()) g[t.r][t.c] = t.value;
    return g;
  }

  /**
   * Drop a 2 (90%) or 4 (10%) into a random empty cell.
   * @returns {object|null} the new tile, or null if full
   */
  function spawnRandomTile() {
    const empties = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (grid[r][c] === 0) empties.push({ r, c });
      }
    }
    if (empties.length === 0) return null;

    const spot = empties[Math.floor(Math.random() * empties.length)];
    const value = Math.random() < 0.9 ? 2 : 4;
    grid[spot.r][spot.c] = value;

    const t = {
      id: nextTileId++,
      value, r: spot.r, c: spot.c,
      el: null
    };
    t.el = makeTileEl(value, true);
    positionTile(t, true);
    tiles.set(t.id, t);
    return t;
  }

  /**
   * Add points and update best if needed.
   * @param {number} delta
   */
  function updateScore(delta) {
    score += delta;
    if (score > best) {
      best = score;
      localStorage.setItem('2048_best', best);
    }
    scoreEl.textContent = score;
    bestEl.textContent = best;
  }

  // Snapshot for undo
  /**
   * Copy grid, score, and tile records for one-step undo.
   * @returns {{grid: number[][], score: number, tiles: object[]}}
   */
  function snapshot() {
    return {
      grid: grid.map(row => row.slice()),
      score,
      tiles: Array.from(tiles.values()).map(t => ({
        id: t.id, value: t.value, r: t.r, c: t.c
      }))
    };
  }

  /**
   * Put the board back to a snapshot. Clears the overlay.
   * @param {{grid: number[][], score: number, tiles: object[]}} snap
   */
  function restoreSnapshot(snap) {
    // Clear DOM tiles
    for (const t of tiles.values()) t.el.remove();
    tiles.clear();

    grid = snap.grid.map(row => row.slice());
    score = snap.score;
    scoreEl.textContent = score;

    for (const rec of snap.tiles) {
      const el = makeTileEl(rec.value, false);
      const t = { id: rec.id, value: rec.value, r: rec.r, c: rec.c, el };
      positionTile(t, true);
      tiles.set(t.id, t);
    }
    won = false;      // allow re-triggering win if 2048 still on board
    gameOver = false;
    overlay.classList.add('hidden');
    undoBtn.disabled = true;
    undoState = null;
  }

  // ---------- MOVE ----------
  // Returns true if anything moved/merged
  /**
   * Slide and merge the board in one direction.
   * @param {'left'|'right'|'up'|'down'} dir
   * @returns {boolean} true if the board changed
   */
  function move(dir) {
    if (busy || gameOver) return false;

    const before = snapshot();
    let moved = false;
    let scoreGain = 0;

    // Direction vectors
    const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
    const dy = dir === 'up'   ? -1 : dir === 'down'  ? 1 : 0;

    // Order of iteration: we want tiles closest to the destination to process first
    // Build list of tiles sorted by position along the move axis
    const tileList = Array.from(tiles.values());
    tileList.sort((a, b) => {
      if (dy !== 0) return dy < 0 ? a.r - b.r : b.r - a.r;
      return dx < 0 ? a.c - b.c : b.c - a.c;
    });

    const movedTiles = new Set();
    const mergedTiles = new Set();

    for (const t of tileList) {
      let r = t.r, c = t.c;
      let nr = r, nc = c;
      let mergeWith = null;

      // Slide as far as possible
      while (true) {
        const tr = nr + dy;
        const tc = nc + dx;
        if (tr < 0 || tr >= SIZE || tc < 0 || tc >= SIZE) break;

        if (grid[tr][tc] === 0) {
          nr = tr; nc = tc;
          continue;
        }

        // Occupied — can we merge?
        // Find the tile at that position that hasn't merged yet this turn
        const neighbor = findTileAt(tr, tc);
        if (
          neighbor &&
          neighbor.value === t.value &&
          !mergedTiles.has(neighbor.id) &&
          !movedTiles.has(neighbor.id) // extra safety
        ) {
          mergeWith = { tr, tc, neighbor };
        }
        break;
      }

      if (mergeWith) {
        const { tr, tc, neighbor } = mergeWith;

        // Update grid
        grid[r][c] = 0;
        grid[tr][tc] = t.value * 2;

        // Update the surviving neighbor tile
        neighbor.value *= 2;
        updateTileStyle(neighbor);
        neighbor.el.classList.remove('merged');
        void neighbor.el.offsetWidth;
        neighbor.el.classList.add('merged');

        mergedTiles.add(neighbor.id);

        // Move the consumed tile into the merge position, then remove it after transition
        t.r = tr; t.c = tc;
        positionTile(t, false);

        const victimEl = t.el;
        setTimeout(() => {
          victimEl.remove();
        }, 140);
        tiles.delete(t.id);

        scoreGain += neighbor.value;
        moved = true;

        if (neighbor.value === 2048 && !won) {
          won = true;
        }
      } else if (nr !== r || nc !== c) {
        // Simple slide
        grid[r][c] = 0;
        grid[nr][nc] = t.value;
        t.r = nr; t.c = nc;
        positionTile(t, false);
        movedTiles.add(t.id);
        moved = true;
      }
    }

    if (!moved) return false;

    // Apply score
    if (scoreGain > 0) updateScore(scoreGain);

    // Save undo state (the "before" board)
    undoState = before;
    undoBtn.disabled = false;

    // Spawn new tile
    busy = true;
    setTimeout(() => {
      spawnRandomTile();

      // Check win
      if (won && !gameOver) {
        showOverlay('YOU WIN!', `Score: ${score}`, 'KEEP GOING');
      } else if (!hasMoves()) {
        gameOver = true;
        if (score > best) {
          best = score;
          localStorage.setItem('2048_best', best);
        }
        showOverlay('GAME OVER', `Score: ${score}  •  Best: ${best}`, 'TRY AGAIN');
      }
      busy = false;
    }, 140);

    return true;
  }

  /**
   * Find the tile sitting on a cell.
   * @param {number} r
   * @param {number} c
   * @returns {object|null}
   */
  function findTileAt(r, c) {
    for (const t of tiles.values()) {
      if (t.r === r && t.c === c) return t;
    }
    return null;
  }

  /**
   * True if any empty cell or equal neighbor remains.
   * @returns {boolean}
   */
  function hasMoves() {
    // Any empty cell?
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (grid[r][c] === 0) return true;
      }
    }
    // Any adjacent equal pair?
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const v = grid[r][c];
        if (c + 1 < SIZE && grid[r][c + 1] === v) return true;
        if (r + 1 < SIZE && grid[r + 1][c] === v) return true;
      }
    }
    return false;
  }

  // ---------- OVERLAY ----------
  /**
   * Show the win or lose panel.
   * @param {string} title
   * @param {string} msg
   * @param {string} btn
   */
  function showOverlay(title, msg, btn) {
    overlayTitle.textContent = title;
    overlayMsg.textContent = msg;
    overlayBtn.textContent = btn;
    overlay.classList.remove('hidden');
  }

  /**
   * Hide the overlay so play can continue.
   */
  function hideOverlay() {
    overlay.classList.add('hidden');
  }

  // ---------- INPUT: KEYBOARD ----------
  /* Map of keys to move directions */
  const KEY_MAP = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
    W: 'up', S: 'down', A: 'left', D: 'right'
  };

  window.addEventListener('keydown', (e) => {
    const dir = KEY_MAP[e.key];
    if (!dir) return;
    e.preventDefault();
    if (!overlay.classList.contains('hidden')) return;
    move(dir);
  });

  // ---------- INPUT: TOUCH ----------
  /* Touch start point, or null */
  let touchStart = null;
  /* True after a swipe already fired this gesture */
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
    if (!overlay.classList.contains('hidden')) return;

    if (Math.abs(dx) > Math.abs(dy)) {
      move(dx > 0 ? 'right' : 'left');
    } else {
      move(dy > 0 ? 'down' : 'up');
    }
  }, { passive: true });

  boardWrapEl.addEventListener('touchend', () => {
    touchStart = null;
    touchMoved = false;
  }, { passive: true });

  // Also support mouse drag on desktop (nice bonus)
  /* Mouse drag start point, or null */
  let mouseStart = null;
  boardWrapEl.addEventListener('mousedown', (e) => {
    mouseStart = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener('mouseup', (e) => {
    if (!mouseStart) return;
    const dx = e.clientX - mouseStart.x;
    const dy = e.clientY - mouseStart.y;
    mouseStart = null;
    if (Math.hypot(dx, dy) < 24) return;
    if (!overlay.classList.contains('hidden')) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      move(dx > 0 ? 'right' : 'left');
    } else {
      move(dy > 0 ? 'down' : 'up');
    }
  });

  // ---------- CONTROLS ----------
  overlayBtn.addEventListener('click', () => {
    if (overlayTitle.textContent === 'YOU WIN!') {
      hideOverlay();  // keep playing
    } else {
      newGame();
    }
  });

  undoBtn.addEventListener('click', () => {
    if (!undoState || busy) return;
    restoreSnapshot(undoState);
  });

  newBtn.addEventListener('click', newGame);

  // ---------- NEW GAME ----------
  /**
   * Clear the board and spawn two starting tiles.
   */
  function newGame() {
    // Wipe tiles
    for (const t of tiles.values()) t.el.remove();
    tiles.clear();
    grid = emptyGrid();
    score = 0;
    won = false;
    gameOver = false;
    busy = false;
    undoState = null;
    undoBtn.disabled = true;
    scoreEl.textContent = '0';
    bestEl.textContent = best;
    hideOverlay();

    spawnRandomTile();
    spawnRandomTile();
  }

  // ---------- BOOT ----------
  buildCells();
  computeCellSize();
  bestEl.textContent = best;

  // Delay boot one frame so the layout has settled
  requestAnimationFrame(() => {
    computeCellSize();
    newGame();
  });
})();
