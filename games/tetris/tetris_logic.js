/* =============================================================================
 * BASIC ARCADE TETRIS — black / white theme
 * Game logic. Tunables are in tetris_config.js (TETRIS_CONFIG).
 * Grid: 10 columns x 20 visible rows.
 * Pieces: I O T S Z J L (classic tetrominoes).
 * Controls: arrows, X rotate, space hard drop, P pause, R restart.
 * ============================================================================= */

/* --- Config aliases (all values live in tetris_config.js) --- */
var CFG = TETRIS_CONFIG;
var COLS = CFG.board.cols;
var ROWS = CFG.board.rows;
var CELL = CFG.board.cell;
var COLOR_BG = CFG.colors.bg;
var COLOR_BLOCK = CFG.colors.block;
var COLOR_GHOST = CFG.colors.ghost;
var COLOR_GRID = CFG.colors.grid;
var BASE_MS = CFG.timing.baseMs;
var SOFT_MS = CFG.timing.softMs;
var LEVEL_STEP_MS = CFG.timing.levelStepMs;
var MIN_MS = CFG.timing.minMs;
var SHAPES = CFG.shapes;
var PIECE_NAMES = CFG.pieceNames;
var KICKS = CFG.kicks;

/* True if key is in the binding list. */
function isKey(list, key) {
  return list.indexOf(key) !== -1;
}

/* --- DOM handles --- */
/* Main playfield canvas. */
var canvas = document.getElementById("game");
/* 2D drawing context for the well. */
var ctx = canvas.getContext("2d");
/* Small canvas that shows the next piece. */
var nextCanvas = document.getElementById("nextBox");
/* 2D context for the next-piece box. */
var nctx = nextCanvas.getContext("2d");
/* Score label. */
var elScore = document.getElementById("score");
/* Lines-cleared label. */
var elLines = document.getElementById("lines");
/* Level label. */
var elLevel = document.getElementById("level");
/* Status text (PAUSE / GAME OVER). */
var elStatus = document.getElementById("status");

/* On-screen text from config */
canvas.width = COLS * CELL;
canvas.height = ROWS * CELL;
document.querySelector("#side h1").textContent = CFG.text.title;
document.querySelector("#side .muted").innerHTML = CFG.text.helpHtml;

/* --- Game state --- */
/* 2D array ROWS x COLS. 0 empty, 1 filled. */
var board = [];
/* Current falling piece object, or null. */
var current = null;
/* Next piece waiting in the sidebar. */
var nextPiece = null;
/* Player score. */
var score = CFG.start.score;
/* Total lines cleared this game. */
var lines = CFG.start.lines;
/* Current level (starts at 1). */
var level = CFG.start.level;
/* True when the stack reached the spawn. */
var gameOver = false;
/* True when the player paused. */
var paused = false;
/* Timestamp of last gravity tick. */
var lastTick = 0;
/* True while the down arrow is held. */
var softDrop = false;
/* Bag used so pieces feel fair (7-bag). */
var bag = [];

/* -----------------------------------------------------------------------------
 * createEmptyBoard
 * Build a fresh ROWS x COLS grid filled with 0.
 * --------------------------------------------------------------------------- */
function createEmptyBoard() {
  var rows = [];
  var r;
  var c;
  for (r = 0; r < ROWS; r++) {
    rows[r] = [];
    for (c = 0; c < COLS; c++) {
      rows[r][c] = 0;
    }
  }
  return rows;
}

/* -----------------------------------------------------------------------------
 * refillBag
 * Classic 7-bag: shuffle all 7 names, then deal them one by one.
 * --------------------------------------------------------------------------- */
function refillBag() {
  bag = PIECE_NAMES.slice();
  var i;
  var j;
  var tmp;
  for (i = bag.length - 1; i > 0; i--) {
    j = Math.floor(Math.random() * (i + 1));
    tmp = bag[i];
    bag[i] = bag[j];
    bag[j] = tmp;
  }
}

/* -----------------------------------------------------------------------------
 * takeFromBag
 * Return the next piece name. Refill the bag when empty.
 * --------------------------------------------------------------------------- */
function takeFromBag() {
  if (bag.length === 0) {
    refillBag();
  }
  return bag.pop();
}

/* -----------------------------------------------------------------------------
 * makePiece
 * Build a piece object from a name. Spawn near the top center.
 * --------------------------------------------------------------------------- */
function makePiece(name) {
  return {
    /* Which tetromino this is (I, O, T, ...). */
    name: name,
    /* Current rotation index 0..3. */
    rot: 0,
    /* Grid column of the piece origin. */
    x: CFG.board.spawnX,
    /* Grid row of the piece origin (can be 0). */
    y: CFG.board.spawnY
  };
}

/* -----------------------------------------------------------------------------
 * cellsOf
 * Return absolute [x, y] cells for a piece at a given rotation and offset.
 * --------------------------------------------------------------------------- */
function cellsOf(piece, rot, ox, oy) {
  var shape = SHAPES[piece.name][rot];
  var out = [];
  var i;
  for (i = 0; i < shape.length; i++) {
    out.push([shape[i][0] + ox, shape[i][1] + oy]);
  }
  return out;
}

/* -----------------------------------------------------------------------------
 * fits
 * True if every cell is inside the well and not on a locked block.
 * --------------------------------------------------------------------------- */
function fits(piece, rot, ox, oy) {
  var cells = cellsOf(piece, rot, ox, oy);
  var i;
  var x;
  var y;
  for (i = 0; i < cells.length; i++) {
    x = cells[i][0];
    y = cells[i][1];
    if (x < 0 || x >= COLS || y >= ROWS) {
      return false;
    }
    if (y >= 0 && board[y][x]) {
      return false;
    }
  }
  return true;
}

/* -----------------------------------------------------------------------------
 * spawn
 * Move next into current and roll a new next. End the game if spawn is blocked.
 * --------------------------------------------------------------------------- */
function spawn() {
  current = nextPiece || makePiece(takeFromBag());
  nextPiece = makePiece(takeFromBag());
  current.x = CFG.board.spawnX;
  current.y = CFG.board.spawnY;
  if (!fits(current, current.rot, current.x, current.y)) {
    gameOver = true;
    elStatus.textContent = CFG.text.gameOver;
  }
}

/* -----------------------------------------------------------------------------
 * lockPiece
 * Write the current piece into the board, then clear lines and spawn again.
 * --------------------------------------------------------------------------- */
function lockPiece() {
  var cells = cellsOf(current, current.rot, current.x, current.y);
  var i;
  var x;
  var y;
  for (i = 0; i < cells.length; i++) {
    x = cells[i][0];
    y = cells[i][1];
    if (y >= 0 && y < ROWS && x >= 0 && x < COLS) {
      board[y][x] = 1;
    }
  }
  clearLines();
  spawn();
}

/* -----------------------------------------------------------------------------
 * clearLines
 * Remove every full row, drop the stack, add score.
 * --------------------------------------------------------------------------- */
function clearLines() {
  var cleared = 0;
  var r;
  var c;
  var full;
  for (r = ROWS - 1; r >= 0; r--) {
    full = true;
    for (c = 0; c < COLS; c++) {
      if (!board[r][c]) {
        full = false;
        break;
      }
    }
    if (full) {
      board.splice(r, 1);
      board.unshift(emptyRow());
      cleared += 1;
      r += 1;
    }
  }
  if (cleared > 0) {
    /* Classic-ish points: 1/2/3/4 lines. */
    var table = CFG.scoring.lineTable;
    score += table[cleared] * level;
    lines += cleared;
    level = Math.floor(lines / CFG.scoring.linesPerLevel) + CFG.start.level;
    updateHud();
  }
}

/* -----------------------------------------------------------------------------
 * emptyRow
 * One new empty row used when a line is cleared.
 * --------------------------------------------------------------------------- */
function emptyRow() {
  var row = [];
  var c;
  for (c = 0; c < COLS; c++) {
    row[c] = 0;
  }
  return row;
}

/* -----------------------------------------------------------------------------
 * tryMove
 * Shift the current piece by dx, dy. Return true if it moved.
 * --------------------------------------------------------------------------- */
function tryMove(dx, dy) {
  if (!current || gameOver || paused) {
    return false;
  }
  if (fits(current, current.rot, current.x + dx, current.y + dy)) {
    current.x += dx;
    current.y += dy;
    return true;
  }
  return false;
}

/* -----------------------------------------------------------------------------
 * tryRotate
 * Rotate clockwise. Try a few wall kicks if the new pose overlaps a wall.
 * --------------------------------------------------------------------------- */
function tryRotate() {
  if (!current || gameOver || paused) {
    return;
  }
  var nextRot = (current.rot + 1) % 4;
  var k;
  var dx;
  var dy;
  for (k = 0; k < KICKS.length; k++) {
    dx = KICKS[k][0];
    dy = KICKS[k][1];
    if (fits(current, nextRot, current.x + dx, current.y + dy)) {
      current.rot = nextRot;
      current.x += dx;
      current.y += dy;
      return;
    }
  }
}

/* -----------------------------------------------------------------------------
 * hardDrop
 * Slam the piece to the floor and lock it. Award 2 points per cell dropped.
 * --------------------------------------------------------------------------- */
function hardDrop() {
  if (!current || gameOver || paused) {
    return;
  }
  var dist = 0;
  while (tryMove(0, 1)) {
    dist += 1;
  }
  score += dist * CFG.scoring.hardDropPerCell;
  updateHud();
  lockPiece();
}

/* -----------------------------------------------------------------------------
 * ghostY
 * Lowest row the current piece can sit without colliding (for the ghost).
 * --------------------------------------------------------------------------- */
function ghostY() {
  var y = current.y;
  while (fits(current, current.rot, current.x, y + 1)) {
    y += 1;
  }
  return y;
}

/* -----------------------------------------------------------------------------
 * fallInterval
 * Gravity delay for the current level (or soft-drop speed).
 * --------------------------------------------------------------------------- */
function fallInterval() {
  if (softDrop) {
    return SOFT_MS;
  }
  var ms = BASE_MS - (level - 1) * LEVEL_STEP_MS;
  if (ms < MIN_MS) {
    ms = MIN_MS;
  }
  return ms;
}

/* -----------------------------------------------------------------------------
 * updateHud
 * Push score / lines / level into the sidebar.
 * --------------------------------------------------------------------------- */
function updateHud() {
  elScore.textContent = String(score);
  elLines.textContent = String(lines);
  elLevel.textContent = String(level);
}

/* -----------------------------------------------------------------------------
 * drawCell
 * Paint one block on a given canvas context.
 * --------------------------------------------------------------------------- */
function drawCell(context, x, y, color, size) {
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
}

/* -----------------------------------------------------------------------------
 * drawBoard
 * Clear the well, draw grid, locked blocks, ghost, and falling piece.
 * --------------------------------------------------------------------------- */
function drawBoard() {
  var r;
  var c;
  var cells;
  var i;
  var gy;

  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  /* Grid */
  ctx.strokeStyle = COLOR_GRID;
  ctx.lineWidth = 1;
  for (c = 0; c <= COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * CELL + 0.5, 0);
    ctx.lineTo(c * CELL + 0.5, ROWS * CELL);
    ctx.stroke();
  }
  for (r = 0; r <= ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * CELL + 0.5);
    ctx.lineTo(COLS * CELL, r * CELL + 0.5);
    ctx.stroke();
  }

  /* Locked stack */
  for (r = 0; r < ROWS; r++) {
    for (c = 0; c < COLS; c++) {
      if (board[r][c]) {
        drawCell(ctx, c, r, COLOR_BLOCK, CELL);
      }
    }
  }

  if (!current) {
    return;
  }

  /* Ghost */
  gy = ghostY();
  cells = cellsOf(current, current.rot, current.x, gy);
  for (i = 0; i < cells.length; i++) {
    if (cells[i][1] >= 0) {
      drawCell(ctx, cells[i][0], cells[i][1], COLOR_GHOST, CELL);
    }
  }

  /* Active piece */
  cells = cellsOf(current, current.rot, current.x, current.y);
  for (i = 0; i < cells.length; i++) {
    if (cells[i][1] >= 0) {
      drawCell(ctx, cells[i][0], cells[i][1], COLOR_BLOCK, CELL);
    }
  }
}

/* -----------------------------------------------------------------------------
 * drawNext
 * Draw the queued piece in the small sidebar canvas.
 * --------------------------------------------------------------------------- */
function drawNext() {
  var cells;
  var i;
  var minX = 99;
  var minY = 99;
  var maxX = -99;
  var maxY = -99;
  var size = CFG.preview.cellSize;
  var ox;
  var oy;

  nctx.fillStyle = COLOR_BG;
  nctx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);

  if (!nextPiece) {
    return;
  }

  cells = cellsOf(nextPiece, 0, 0, 0);
  for (i = 0; i < cells.length; i++) {
    if (cells[i][0] < minX) minX = cells[i][0];
    if (cells[i][1] < minY) minY = cells[i][1];
    if (cells[i][0] > maxX) maxX = cells[i][0];
    if (cells[i][1] > maxY) maxY = cells[i][1];
  }
  ox = Math.floor((nextCanvas.width / size - (maxX - minX + 1)) / 2) - minX;
  oy = Math.floor((nextCanvas.height / size - (maxY - minY + 1)) / 2) - minY;
  for (i = 0; i < cells.length; i++) {
    drawCell(nctx, cells[i][0] + ox, cells[i][1] + oy, COLOR_BLOCK, size);
  }
}

/* -----------------------------------------------------------------------------
 * tick
 * Main loop: gravity, then redraw.
 * --------------------------------------------------------------------------- */
function tick(now) {
  if (!lastTick) {
    lastTick = now;
  }
  if (!gameOver && !paused) {
    if (now - lastTick >= fallInterval()) {
      lastTick = now;
      if (!tryMove(0, 1)) {
        lockPiece();
      } else if (softDrop) {
        score += CFG.scoring.softDropPerCell;
        updateHud();
      }
    }
  }
  drawBoard();
  drawNext();
  requestAnimationFrame(tick);
}

/* -----------------------------------------------------------------------------
 * resetGame
 * Wipe state and start a new game.
 * --------------------------------------------------------------------------- */
function resetGame() {
  board = createEmptyBoard();
  score = CFG.start.score;
  lines = CFG.start.lines;
  level = CFG.start.level;
  gameOver = false;
  paused = false;
  softDrop = false;
  bag = [];
  lastTick = 0;
  nextPiece = makePiece(takeFromBag());
  elStatus.textContent = "";
  updateHud();
  spawn();
}

/* -----------------------------------------------------------------------------
 * onKeyDown
 * Handle movement, rotate, drop, pause, restart.
 * --------------------------------------------------------------------------- */
function onKeyDown(e) {
  var key = e.key;
  if (isKey(CFG.keys.restart, key)) {
    resetGame();
    e.preventDefault();
    return;
  }
  if (isKey(CFG.keys.pause, key)) {
    if (!gameOver) {
      paused = !paused;
      elStatus.textContent = paused ? CFG.text.paused : "";
    }
    e.preventDefault();
    return;
  }
  if (gameOver || paused) {
    return;
  }
  if (isKey(CFG.keys.left, key)) {
    tryMove(-1, 0);
    e.preventDefault();
  } else if (isKey(CFG.keys.right, key)) {
    tryMove(1, 0);
    e.preventDefault();
  } else if (isKey(CFG.keys.softDrop, key)) {
    softDrop = true;
    e.preventDefault();
  } else if (isKey(CFG.keys.rotate, key)) {
    tryRotate();
    e.preventDefault();
  } else if (isKey(CFG.keys.hardDrop, key)) {
    hardDrop();
    e.preventDefault();
  }
}

/* -----------------------------------------------------------------------------
 * onKeyUp
 * Stop soft drop when the down key is released.
 * --------------------------------------------------------------------------- */
function onKeyUp(e) {
  if (isKey(CFG.keys.softDrop, e.key)) {
    softDrop = false;
  }
}

/* --- Wire events and start --- */
document.addEventListener("keydown", onKeyDown);
document.addEventListener("keyup", onKeyUp);
resetGame();
requestAnimationFrame(tick);
