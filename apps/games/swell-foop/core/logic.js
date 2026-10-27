/*
 * Swell Foop — game logic. Tunables come from SWELL_FOOP_CONFIG (core/config.js); block art comes from the
 * active theme (core/themes.js registry + assets/themes/*.js). Grid cells hold a colour index or null.
 * Self-contained (no network). The "Hub bridge" section at the bottom lets the
 * sites hub show name / Score / Moves / New Game in its header; standalone it
 * does nothing.
 * GS2: shared Games Settings via core/settings.js (SF_SETTINGS): FPS cap, FPS counter, vibration, ⚙ gear.
 */
const CFG = SWELL_FOOP_CONFIG;
// GS2: shared Games Settings bridge (core/settings.js); stub if that file is missing
const SET = (typeof SF_SETTINGS !== 'undefined' && SF_SETTINGS) || {
    get: (k) => ({ vibration: true, showFps: false })[k], frameMs: () => CFG.animation.idleMs,
    onChange: () => () => {}, mountGear: () => null, vibrate: () => {},
    fpsMeter: () => ({ show() {}, tick() {} }),
};
let lastDrawTs = 0;   // GS2: last drawn animation frame (FPS cap)
let fpsMeter = null;  // GS2: created in initCanvas()
const LAY = CFG.layout;
let GRID_COLS = CFG.grid.cols; // board size in cells: computed from the window (see "Responsive layout")
let GRID_ROWS = CFG.grid.rows;
const BALL_SIZE = CFG.grid.ballSize; // Size of each cell in game units
const NUM_COLORS = CFG.numColors; // colour indices 0..NUM_COLORS-1; the theme draws them
const MARGIN = CFG.grid.margin;
const ANIM = CFG.animation;
const APP = CFG.APP || { name: 'Swell Foop', version: '' };
const TEXT = CFG.text || {};
let BOARD_W = GRID_COLS * BALL_SIZE; // board size in game units (the canvas scales them to CSS px)
let BOARD_H = GRID_ROWS * BALL_SIZE;
let cellPx = BALL_SIZE; // CSS px per cell

// Game state variables
let canvas, ctx;
let fitText, fitBar;
let grid = []; // The main game grid: colour index (number) or null per cell, final positions
let score = CFG.start.score;
let moves = CFG.start.moves;
let isGameOver = false;

// Theme / rendering state
let theme = SF_THEMES.get(SF_THEMES.DEFAULT_ID);
let groupSize = [];   // size of the same-colour group each cell belongs to (emoji moods)
let hoverCell = null; // {r,c} under the mouse pointer
let framePending = false;
let idleTimer = 0;    // pending idle redraw (themes with an animated overlay)

// Animation variables
let animationActive = false;
let animationStartTime = 0;
const animationDuration = ANIM.durationMs; // milliseconds for falling animation
const bounceCount = ANIM.bounceCount; // Number of bounces
let currentAnimationMovements = []; // Stores objects like { color (index), fromR, fromC, toR, toC }

// DOM elements
const scoreDisplay = document.getElementById('score');
const movesDisplay = document.getElementById('moves');
const newGameBtn = document.getElementById('newGameBtn');
const messageBox = document.getElementById('messageBox');
const messageTitle = document.getElementById('messageTitle');
const messageText = document.getElementById('messageText');
const messageButton = document.getElementById('messageButton');

/**
 * Initializes the game canvas and context.
 * Sets up event listeners.
 */
function initCanvas() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');

    // Title bar from APP info
    const nameEl = document.getElementById('appName');
    const verEl = document.getElementById('appVersion');
    if (nameEl && APP.name) nameEl.textContent = APP.name;
    if (verEl) verEl.textContent = APP.version ? (TEXT.versionPrefix || '') + APP.version : '';
    if (APP.name) document.title = APP.release ? APP.name + ' ' + APP.release : APP.name; // tab title only (no header change)

    // Board size and cell size come from the window (startNewGame -> layoutForNewGame); rebuilt live on resize
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    // Add event listeners for mouse and touch
    canvas.addEventListener('mousedown', handleInput);
    canvas.addEventListener('touchstart', handleInput);
    canvas.addEventListener('mousemove', onHover);
    canvas.addEventListener('mouseleave', onHover);

    newGameBtn.addEventListener('click', startNewGame);
    messageButton.addEventListener('click', hideMessageBox);
    fitText = document.getElementById('fitText');
    fitBar = document.getElementById('fitBar');
    if (fitText && TEXT.fitText) fitText.textContent = TEXT.fitText;
    document.getElementById('fitYes').addEventListener('click', startNewGame);
    document.getElementById('fitNo').addEventListener('click', () => { fitDeclined = true; fitBar.classList.add('hidden'); });

    // Theme: saved choice (localStorage) or Classic; the picker UI lives in ui/theme_picker.js
    theme = SF_THEMES.get(loadSavedTheme());
    canvas.style.background = theme.bg || '';
    if (typeof SFPicker !== 'undefined') SFPicker.init();

    // GS2: shared settings — ⚙ next to New Game / Theme, FPS counter, live changes
    SET.mountGear(document.querySelector('.sf-controls'));
    fpsMeter = SET.fpsMeter(CFG.fpsMeterMs || 500);
    fpsMeter.show(!!SET.get('showFps'));
    SET.onChange((ch) => { if ('showFps' in ch) fpsMeter.show(!!ch.showFps); });

    // Initial game start
    startNewGame();
}

/* ---------------------------------------------------------------------------
 * Responsive layout. The window decides the board: how many columns x rows fit at a comfortable cell
 * (CFG.layout.cellTouch / cellMouse), then the cell grows a little so the board fills the space
 * (never above maxCell). Score + buttons sit above the board on tall windows (body.sf-tall) and in a side
 * panel on wide ones (body.sf-wide). Game units stay BALL_SIZE per cell; the canvas just scales them.
 * ------------------------------------------------------------------------- */
const QS = new URLSearchParams(location.search);
const FORCE_COLS = parseInt(QS.get('cols'), 10) || 0; // debug: ?cols=15&rows=6 forces a board size
const FORCE_ROWS = parseInt(QS.get('rows'), 10) || 0;
let resizeTimer = 0;
let fitDeclined = false; // the player chose "Keep": don't ask again until the board fits the window again

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function isTouchDevice() {
    return (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0;
}

/** Picks tall / wide, then measures the space left for the board (CSS px) and the wanted cell size. */
function measureBoardArea() {
    const box = document.querySelector('.game-container');
    const hud = document.querySelector('.sf-hud');
    const wide = box.clientWidth >= box.clientHeight * LAY.wideRatio;
    document.body.classList.toggle('sf-wide', wide);
    document.body.classList.toggle('sf-tall', !wide);
    const cs = getComputedStyle(box);
    let w = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    let h = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (hud && hud.offsetParent !== null) { // panel is shown (not in the hub)
        const gap = parseFloat(cs.gap) || 0;
        if (wide) w -= hud.offsetWidth + gap; else h -= hud.offsetHeight + gap;
    }
    return { w: Math.max(40, Math.floor(w)), h: Math.max(40, Math.floor(h)), want: isTouchDevice() ? LAY.cellTouch : LAY.cellMouse };
}

/**
 * Columns, rows and cell size (CSS px) that fill the measured area: tries every cell size from the wanted
 * one up to fillMax x that (never above maxCell) and keeps the one whose columns x rows cover the most area.
 */
function chooseLayout(a) {
    const best = { cols: 0, rows: 0, cell: 0, score: -1 };
    const top = Math.min(LAY.maxCell, Math.max(a.want, Math.floor(a.want * LAY.fillMax)));
    for (let cell = a.want; cell <= top; cell++) {
        const cols = FORCE_COLS || clamp(Math.floor(a.w / cell), LAY.minCols, LAY.maxCols);
        const rows = FORCE_ROWS || clamp(Math.floor(a.h / cell), LAY.minRows, LAY.maxRows);
        const fit = Math.min(1, a.w / (cols * cell)) * Math.min(1, a.h / (rows * cell)); // 0..1 if the board is too big
        const score = (cols * cell * rows * cell) / (a.w * a.h) * fit - (cell - a.want) * 0.0005; // prefer the wanted size
        if (score > best.score) { best.cols = cols; best.rows = rows; best.cell = cell; best.score = score; }
    }
    // clamp(...) can hold the counts above what fits (tiny windows / forced size): shrink the cell to fit
    const cell = clamp(Math.floor(Math.min(a.w / best.cols, a.h / best.rows, best.cell)), 10, LAY.maxCell);
    return { cols: best.cols, rows: best.rows, cell };
}

function setBoardSize(cols, rows) {
    GRID_COLS = cols;
    GRID_ROWS = rows;
    BOARD_W = cols * BALL_SIZE;
    BOARD_H = rows * BALL_SIZE;
}

/**
 * Sizes the canvas to GRID_COLS x GRID_ROWS cells of cellPx CSS px. The backing store follows
 * devicePixelRatio and the context is scaled, so the drawing code keeps using game units.
 */
function fitCanvas() {
    const cssW = GRID_COLS * cellPx;
    const cssH = GRID_ROWS * cellPx;
    const dpr = window.devicePixelRatio || 1;
    const pw = Math.round(cssW * dpr), ph = Math.round(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    ctx.setTransform(canvas.width / BOARD_W, 0, 0, canvas.height / BOARD_H, 0, 0);
}

/** Sets board size + cell for a NEW game from the current window. */
function layoutForNewGame() {
    const L = chooseLayout(measureBoardArea());
    setBoardSize(L.cols, L.rows);
    cellPx = L.cell;
    fitCanvas();
}

function rescale(cell) {
    cellPx = cell;
    fitCanvas();
    if (!animationActive) drawGrid(); // a running fall redraws itself on its next frame
}

/** Debounced window resize / rotation. */
function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(relayout, LAY.resizeDebounceMs);
}

/**
 * Re-fits the board to the window. Same board size: just rescale. Game in progress that still fits
 * (cell within keepMin..keepMax of the wanted size): keep it and rescale. Otherwise a game with no moves
 * is rebuilt at once; one in progress keeps its board (rescaled to fit) and the player is asked.
 */
function relayout() {
    if (!canvas) return;
    const a = measureBoardArea();
    const L = chooseLayout(a);
    if (L.cols === GRID_COLS && L.rows === GRID_ROWS) { rescale(L.cell); hideFitBar(true); return; }
    const keep = Math.floor(Math.min(a.w / GRID_COLS, a.h / GRID_ROWS));
    if (keep >= Math.max(LAY.minCell, a.want * LAY.keepMin) && keep <= a.want * LAY.keepMax) {
        rescale(Math.min(keep, LAY.maxCell));
        hideFitBar(true);
        return;
    }
    if (moves === 0 && !isGameOver) { startNewGame(); return; } // nothing to lose
    rescale(clamp(keep, 8, LAY.maxCell));
    if (!fitDeclined && fitBar) fitBar.classList.remove('hidden');
}

function hideFitBar(resetDeclined) {
    if (fitBar) fitBar.classList.add('hidden');
    if (resetDeclined) fitDeclined = false;
}

/**
 * Starts a new game: resets score, moves, sizes the board to the window, generates a new grid, and draws it.
 */
function startNewGame() {
    score = CFG.start.score;
    moves = CFG.start.moves;
    isGameOver = false;
    animationActive = false; // Ensure animation is off for new game
    currentAnimationMovements = []; // Clear any pending animation data
    hoverCell = null;
    hideFitBar(true);
    layoutForNewGame(); // board size from the current window
    updateScoreDisplay();
    generateGrid();
    recomputeGroups();
    drawGrid(); // Initial draw without animation
    hideMessageBox(); // Ensure message box is hidden on new game
}

/**
 * Generates a new random grid of colour indices (0..NUM_COLORS-1).
 */
function generateGrid() {
    grid = [];
    for (let r = 0; r < GRID_ROWS; r++) {
        grid[r] = [];
        for (let c = 0; c < GRID_COLS; c++) {
            grid[r][c] = Math.floor(Math.random() * NUM_COLORS);
        }
    }
}

/**
 * Mood of the block at (r,c) for themes that react (Emoji Faces): excited under the pointer's group,
 * sad when lonely, happy in a group, with a brief random blink.
 */
function moodAt(r, c, T) {
    if (!theme.moods) return '';
    if (hoverCell && grid[hoverCell.r] && grid[hoverCell.r][hoverCell.c] !== null && groupSize[hoverCell.r][hoverCell.c] >= CFG.minGroup) {
        if (grid[r][c] === grid[hoverCell.r][hoverCell.c] && inHoverGroup(r, c)) return 'excited';
    }
    if (((T + (r * GRID_COLS + c) * 997) % 3600) < 140) return 'blink';
    return groupSize[r][c] >= CFG.minGroup ? 'happy' : 'sad';
}
let hoverSet = null;
function inHoverGroup(r, c) { return hoverSet !== null && hoverSet.has(r * GRID_COLS + c); }

/**
 * Draws the current state of the grid on the canvas, with optional falling animation.
 * Balls that are part of `currentAnimationMovements` will be drawn at interpolated positions.
 * Other blocks will be drawn at their final, static positions. Blocks come from the active theme
 * (cached sprites + optional animated overlay), so a frame is cheap.
 * @param {DOMHighResTimeStamp} [timestamp] - The current time provided by requestAnimationFrame.
 */
function drawGrid(timestamp) {
    if (!grid.length) return;
    if (fpsMeter) fpsMeter.tick();
    ctx.clearRect(0, 0, BOARD_W, BOARD_H); // Clear canvas (game units; context is scaled)
    if (theme.board) theme.board(ctx, BOARD_W, BOARD_H);
    const T = timestamp || performance.now();
    const k = canvas.width / BOARD_W;     // device pixels per game unit (sprite cache scale)
    const size = BALL_SIZE - MARGIN * 2;  // block size without the margin

    let progress = 1; // Default to 1 (no animation)
    if (animationActive && timestamp) { // Only calculate progress if animation is active and timestamp is provided
        const elapsedTime = Math.max(0, timestamp - animationStartTime);
        progress = Math.min(elapsedTime / animationDuration, 1);
    }

    // Keep track of which final positions are being animated to avoid drawing them twice
    const animatingToPositions = new Set();

    if (animationActive) {
        for (const move of currentAnimationMovements) {
            animatingToPositions.add(`${move.toR},${move.toC}`);

            // Calculate interpolated position for animated blocks (linear fall)
            let interpolatedX = move.fromC * BALL_SIZE + MARGIN + (move.toC - move.fromC) * BALL_SIZE * progress;
            let interpolatedY = move.fromR * BALL_SIZE + MARGIN + (move.toR - move.fromR) * BALL_SIZE * progress;

            // Apply bounce effect if configured and near the end of the fall
            let bounceOffset = 0;
            const bounceStartProgress = ANIM.bounceStart; // Start bounce when 70% of fall is complete
            const bounceEndProgress = 1.0; // End bounce at 100% of fall

            if (bounceCount > 0 && progress >= bounceStartProgress && progress <= bounceEndProgress) {
                const bouncePhase = (progress - bounceStartProgress) / (bounceEndProgress - bounceStartProgress); // Normalize phase for bounce (0 to 1)

                if (bounceCount === 1) {
                    // Single bounce: up and down
                    bounceOffset = Math.sin(bouncePhase * Math.PI) * (BALL_SIZE * ANIM.bounceHeight); // Max bounce height 15% of block size
                } else if (bounceCount === 2) {
                    // Two bounces: first larger, second smaller
                    if (bouncePhase < ANIM.bounceSplit) { // First bounce phase (0 to 0.6)
                        bounceOffset = Math.sin(bouncePhase / ANIM.bounceSplit * Math.PI) * (BALL_SIZE * ANIM.bounceHeight);
                    } else { // Second bounce phase (0.6 to 1.0)
                        bounceOffset = Math.sin((bouncePhase - ANIM.bounceSplit) / (1 - ANIM.bounceSplit) * Math.PI) * (BALL_SIZE * ANIM.bounceHeight2); // Smaller bounce
                    }
                }
            }
            interpolatedY -= bounceOffset; // Subtract offset to move block upwards for bounce

            const seed = move.toR * GRID_COLS + move.toC;
            SF_THEMES.block(ctx, theme, move.color, interpolatedX, interpolatedY, size, k, T,
                { seed, mood: moodAt(move.toR, move.toC, T) });
        }
    }

    // Draw static blocks (those not part of the current animation)
    for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
            const color = grid[r][c]; // This is the FINAL position and colour index in the main grid

            // Only draw if there's a block AND it's not currently animating to this position
            if (color !== null && (!animationActive || !animatingToPositions.has(`${r},${c}`))) {
                SF_THEMES.block(ctx, theme, color, c * BALL_SIZE + MARGIN, r * BALL_SIZE + MARGIN, size, k, T,
                    { seed: r * GRID_COLS + c, mood: moodAt(r, c, T) });
            }
        }
    }

    // Continue animation if still active and not finished
    if (animationActive && progress < 1) {
        scheduleFrame();
    } else if (animationActive && progress >= 1) {
        // Animation finished, reset flag and clear movements
        animationActive = false;
        currentAnimationMovements = [];
        checkGameOver();
        if (theme.fx) scheduleIdle();
    } else if (theme.fx) {
        scheduleIdle(); // themes with an animated overlay (sparkle, glow, blink): a light ~30fps loop; none for flat themes
    }
}

/**
 * Schedules one drawGrid on the next animation frame (never more than one pending).
 * GS2 FPS cap: while the fall animation runs, frames that come before the next slot (SET.frameMs()) are skipped.
 * The fall is timed in ms, so it takes the same time at any frame rate.
 */
function scheduleFrame() {
    if (framePending) return;
    framePending = true;
    requestAnimationFrame(function frame(ts) {
        if (animationActive && ts - lastDrawTs < SET.frameMs() - 1) { requestAnimationFrame(frame); return; }
        framePending = false;
        lastDrawTs = ts;
        drawGrid(ts);
    });
}

/** Idle redraw for animated-overlay themes, throttled to CFG.animation.idleMs (~30fps). Classic has no overlay, so never loops. */
function scheduleIdle() {
    if (framePending || idleTimer) return;
    idleTimer = setTimeout(() => { idleTimer = 0; scheduleFrame(); }, SET.frameMs()); // GS2: fpsLimit (fallback ANIM.idleMs)
}

/** Recomputes the same-colour group size of every cell (used for reactive themes). */
function recomputeGroups() {
    groupSize = [];
    for (let r = 0; r < GRID_ROWS; r++) groupSize[r] = new Array(GRID_COLS).fill(0);
    for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
            if (grid[r][c] === null || groupSize[r][c]) continue;
            const g = findConnectedBalls(r, c, grid[r][c]);
            g.forEach(([gr, gc]) => { groupSize[gr][gc] = g.length; });
        }
    }
    updateHoverSet();
}

function updateHoverSet() {
    hoverSet = null;
    if (hoverCell && grid[hoverCell.r] && grid[hoverCell.r][hoverCell.c] !== null) {
        hoverSet = new Set(findConnectedBalls(hoverCell.r, hoverCell.c, grid[hoverCell.r][hoverCell.c]).map(([r, c]) => r * GRID_COLS + c));
    }
}

/** Pointer position (client px) to {r,c} on the board, or null outside. */
function cellFromClient(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (BOARD_W / rect.width);
    const y = (clientY - rect.top) * (BOARD_H / rect.height);
    const col = Math.floor(x / BALL_SIZE), row = Math.floor(y / BALL_SIZE);
    return row >= 0 && row < GRID_ROWS && col >= 0 && col < GRID_COLS ? { r: row, c: col } : null;
}

function onHover(event) {
    if (!theme.moods) return;
    const cell = cellFromClient(event.clientX, event.clientY);
    const same = (!cell && !hoverCell) || (cell && hoverCell && cell.r === hoverCell.r && cell.c === hoverCell.c);
    if (same) return;
    hoverCell = cell;
    updateHoverSet();
    scheduleFrame();
}

/* ---- themes ---- */

/** Applies a theme by id (unknown id falls back to Classic), saves the choice, and redraws. */
function setTheme(id, save) {
    theme = SF_THEMES.get(id);
    canvas.style.background = theme.bg || '';
    hoverCell = null;
    updateHoverSet();
    if (save !== false) {
        try { localStorage.setItem(CFG.themeStorageKey, theme.id); } catch (e) { /* storage blocked: choice not saved */ }
    }
    SF_THEMES.clearCache();
    if (!animationActive) drawGrid();
    if (typeof SFPicker !== 'undefined') SFPicker.sync();
}

function loadSavedTheme() {
    let id = SF_THEMES.DEFAULT_ID;
    try { const v = localStorage.getItem(CFG.themeStorageKey); if (v && SF_THEMES.has(v)) id = v; } catch (e) { /* ignore */ }
    return id;
}

function cycleTheme() {
    const ids = SF_THEMES.list().map((t) => t.id);
    setTheme(ids[(ids.indexOf(theme.id) + 1) % ids.length]);
}

/**
 * Handles mouse and touch input on the canvas.
 * @param {Event} event - The input event (mousedown or touchstart).
 */
function handleInput(event) {
    if (event.type === 'mousedown' && event.button) return; // primary button only (no right / middle click)
    if (isGameOver || animationActive) return; // Do nothing if game is over or animation is running

    event.preventDefault(); // Prevent default browser actions (e.g., scrolling on touch)

    let clientX, clientY;
    if (event.type === 'touchstart') {
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
    } else {
        clientX = event.clientX;
        clientY = event.clientY;
    }

    // Get canvas position relative to the viewport, in game units (the canvas may be scaled)
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (BOARD_W / rect.width);
    const y = (clientY - rect.top) * (BOARD_H / rect.height);

    // Calculate grid coordinates
    const col = Math.floor(x / BALL_SIZE);
    const row = Math.floor(y / BALL_SIZE);

    // Ensure coordinates are within bounds
    if (row >= 0 && row < GRID_ROWS && col >= 0 && col < GRID_COLS) {
        handleClick(row, col);
    }
}

/**
 * Processes a click on a specific grid cell.
 * @param {number} row - The row index of the clicked cell.
 * @param {number} col - The column index of the clicked cell.
 */
function handleClick(row, col) {
    const clickedColor = grid[row][col];
    if (clickedColor === null) return; // If clicked an empty space, do nothing

    // Find all connected blocks of the same color
    const connectedBalls = findConnectedBalls(row, col, clickedColor);

    // Only remove if there are at least 2 connected blocks
    if (connectedBalls.length >= CFG.minGroup) {
        // Create a temporary grid to calculate movements without modifying the main grid yet
        const tempGridAfterRemoval = JSON.parse(JSON.stringify(grid));
        removeBallsFromTemp(tempGridAfterRemoval, connectedBalls); // Remove blocks from temp grid

        // Calculate gravity movements and get the grid state after gravity
        const { newGrid: gridAfterGravity, movements: gravityMovements } = calculateGravityMovements(tempGridAfterRemoval);

        // Calculate column shift movements and get the final grid state
        const { newGrid: finalGrid, movements: columnMovements } = calculateShiftMovements(gridAfterGravity);

        // Update the actual game grid with the final state
        grid = finalGrid;
        recomputeGroups();

        // Combine all movements for animation
        currentAnimationMovements = [...gravityMovements, ...columnMovements];

        score += calculateScore(connectedBalls.length);
        moves++;
        if (CFG.vibrate && connectedBalls.length >= CFG.vibrate.bigGroup) SET.vibrate(CFG.vibrate.bigGroupMs); // GS2
        updateScoreDisplay();

        // Start the falling animation
        animationActive = true;
        animationStartTime = performance.now();
        scheduleFrame(); // Start the animation loop
    }
}

/**
 * Finds all connected blocks of the same color using Breadth-First Search (BFS).
 * @param {number} startRow - Starting row for BFS.
 * @param {number} startCol - Starting column for BFS.
 * @param {number} targetColor - The colour index to match.
 * @returns {Array<Array<number>>} - An array of [row, col] pairs for connected blocks.
 */
function findConnectedBalls(startRow, startCol, targetColor) {
    const connected = [[startRow, startCol]]; // doubles as the BFS queue (read with `head`)
    const seen = new Uint8Array(GRID_ROWS * GRID_COLS);
    seen[startRow * GRID_COLS + startCol] = 1;
    for (let head = 0; head < connected.length; head++) {
        const [r, c] = connected[head];
        // Check neighbors (up, down, left, right)
        for (const [nr, nc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
            if (nr >= 0 && nr < GRID_ROWS && nc >= 0 && nc < GRID_COLS &&
                !seen[nr * GRID_COLS + nc] && grid[nr][nc] === targetColor) {
                seen[nr * GRID_COLS + nc] = 1;
                connected.push([nr, nc]);
            }
        }
    }
    return connected;
}

/**
 * Removes the specified blocks from a given grid by setting their color to null.
 * This operates on a temporary grid, not the main game grid.
 * @param {Array<Array<number|null>>} tempGrid - The grid to modify (colour indices or null).
 * @param {Array<Array<number>>} ballsToRemove - Array of [row, col] pairs to remove.
 */
function removeBallsFromTemp(tempGrid, ballsToRemove) {
    for (const [r, c] of ballsToRemove) {
        tempGrid[r][c] = null; // Set to null to represent an empty space
    }
}

/**
 * Calculates gravity movements and returns the new grid state after gravity.
 * This function works on a copy of the grid and does not modify the original.
 * @param {Array<Array<number|null>>} inputGrid - The grid state to apply gravity to.
 * @returns {{newGrid: Array<Array<number|null>>, movements: Array<{color: number, fromR: number, fromC: number, toR: number, toC: number}>}}
 */
function calculateGravityMovements(inputGrid) {
    const tempGrid = JSON.parse(JSON.stringify(inputGrid)); // Work on a copy
    const movements = [];

    for (let c = 0; c < GRID_COLS; c++) {
        let emptySpaces = 0;
        // Iterate from bottom to top
        for (let r = GRID_ROWS - 1; r >= 0; r--) {
            if (tempGrid[r][c] === null) {
                emptySpaces++;
            } else if (emptySpaces > 0) {
                // This block at (r, c) will move to (r + emptySpaces, c)
                const originalColor = tempGrid[r][c];
                tempGrid[r + emptySpaces][c] = originalColor;
                tempGrid[r][c] = null; // Clear the original position
                movements.push({
                    color: originalColor,
                    fromR: r,
                    fromC: c,
                    toR: r + emptySpaces,
                    toC: c
                });
            }
        }
    }
    return { newGrid: tempGrid, movements: movements };
}

/**
 * Calculates column shift movements and returns the new grid state after shifts.
 * This function works on a copy of the grid and does not modify the original.
 * @param {Array<Array<number|null>>} inputGrid - The grid state to apply column shifts to.
 * @returns {{newGrid: Array<Array<number|null>>, movements: Array<{color: number, fromR: number, fromC: number, toR: number, toC: number}>}}
 */
function calculateShiftMovements(inputGrid) {
    const tempGrid = JSON.parse(JSON.stringify(inputGrid)); // Work on a copy
    const movements = [];
    let emptyCols = 0;
    for (let c = 0; c < GRID_COLS; c++) {
        let isColumnEmpty = true;
        for (let r = 0; r < GRID_ROWS; r++) {
            if (tempGrid[r][c] !== null) {
                isColumnEmpty = false;
                break;
            }
        }

        if (isColumnEmpty) {
            emptyCols++;
        } else if (emptyCols > 0) {
            // Shift this non-empty column left by `emptyCols` positions
            for (let r = 0; r < GRID_ROWS; r++) {
                if (tempGrid[r][c] !== null) { // Only move if there's a block
                    const originalColor = tempGrid[r][c];
                    tempGrid[r][c - emptyCols] = originalColor;
                    tempGrid[r][c] = null; // Clear the original position
                    movements.push({
                        color: originalColor,
                        fromR: r,
                        fromC: c,
                        toR: r,
                        toC: c - emptyCols
                    });
                }
            }
        }
    }
    return { newGrid: tempGrid, movements: movements };
}

/**
 * Calculates the score based on the number of blocks removed.
 * Formula: n * (n - 1) where n is the number of blocks.
 * @param {number} numBalls - The number of blocks removed in a single move.
 * @returns {number} - The score for the move.
 */
function calculateScore(numBalls) {
    return numBalls * (numBalls - 1);
}

/**
 * Updates the score and moves displayed on the UI.
 */
function updateScoreDisplay() {
    scoreDisplay.textContent = score;
    movesDisplay.textContent = moves;
    hubSendStats();
}

/**
 * Checks if there are any more possible moves left in the game.
 * Game is over if no group of minGroup (2) or more connected blocks can be found.
 */
function checkGameOver() {
    let possibleMovesExist = false;
    for (let r = 0; r < GRID_ROWS && !possibleMovesExist; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
            if (groupSize[r][c] >= CFG.minGroup) { possibleMovesExist = true; break; } // groupSize is kept current by recomputeGroups()
        }
    }

    if (!possibleMovesExist) {
        isGameOver = true;
        if (CFG.vibrate) SET.vibrate(CFG.vibrate.gameOverMs); // GS2
        showMessageBox(CFG.text.gameOverTitle, CFG.text.gameOverText.replace('{score}', score));
    }
}

/**
 * Displays a custom message box.
 * @param {string} title - The title of the message.
 * @param {string} text - The main text content of the message.
 */
function showMessageBox(title, text) {
    messageTitle.textContent = title;
    messageText.textContent = text;
    messageBox.classList.remove('hidden');
}

/**
 * Hides the custom message box.
 */
function hideMessageBox() {
    messageBox.classList.add('hidden');
}

/* ---------------------------------------------------------------------------
 * Hub bridge (optional; no dependency on hub files).
 * Only active when this page runs inside a frame. Protocol (postMessage, v:1):
 *   game → hub  {type:'hub-ready'}                      on load (asks for hello)
 *   hub → game  {type:'hub-hello'}                      → reply hub-app, body.in-hub
 *   game → hub  {type:'hub-app', app, stats, buttons}
 *   game → hub  {type:'hub-stat', id, value}            when Score / Moves change
 *   hub → game  {type:'hub-action', id:'new'}           → New Game
 * Accepted only from window.parent, and only when it is same-origin or a
 * file:// / null origin. Standalone (no hello) nothing changes.
 * ------------------------------------------------------------------------- */
const HUB_V = 1;
const IN_FRAME = (() => { try { return window.parent && window.parent !== window; } catch (e) { return true; } })();
let hubLinked = false;
const hubLastSent = {};

function hubPost(msg) {
    if (!IN_FRAME) return;
    try { window.parent.postMessage(Object.assign({ v: HUB_V }, msg), '*'); } catch (e) { /* ignore */ }
}

function hubOriginOk(origin) {
    return origin === location.origin || origin === 'null' || location.origin === 'null' ||
        String(origin).indexOf('file:') === 0;
}

function hubStats() {
    return [
        { id: 'score', label: TEXT.statScore || 'Score', value: score },
        { id: 'moves', label: TEXT.statMoves || 'Moves', value: moves },
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

function onHubMessage(event) {
    if (!IN_FRAME || event.source !== window.parent || !hubOriginOk(event.origin)) return;
    const d = event.data;
    if (!d || typeof d !== 'object' || d.v !== HUB_V) return;
    if (d.type === 'hub-hello') {
        if (!hubLinked) {
            hubLinked = true;
            document.body.classList.add('in-hub');
            requestAnimationFrame(relayout);
        }
        const stats = hubStats();
        stats.forEach((st) => { hubLastSent[st.id] = st.value; });
        hubPost({
            type: 'hub-app',
            app: { name: APP.name, version: APP.version },
            stats: stats,
            buttons: [{ id: 'new', label: TEXT.newGame || 'New Game' }, { id: 'theme', label: TEXT.theme || 'Theme' }],
        });
    } else if (d.type === 'hub-action' && hubLinked) {
        if (d.id === 'new' && canvas) startNewGame();
        else if (d.id === 'theme' && canvas) cycleTheme();
    }
}

if (IN_FRAME) window.addEventListener('message', onHubMessage);

// Initialize the game when the window loads
window.onload = function () {
    initCanvas();
    hubPost({ type: 'hub-ready' });
};
