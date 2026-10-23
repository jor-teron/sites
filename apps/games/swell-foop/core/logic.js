/*
 * Swell Foop — game logic. Tunables come from SWELL_FOOP_CONFIG (core/config.js); block art comes from the
 * active theme (core/themes.js registry + assets/themes/*.js). Grid cells hold a colour index or null.
 * Self-contained (no network). The "Hub bridge" section at the bottom lets the
 * sites hub show name / Score / Moves / New Game in its header; standalone it
 * does nothing.
 */
const CFG = SWELL_FOOP_CONFIG;
const GRID_COLS = CFG.grid.cols;
const GRID_ROWS = CFG.grid.rows;
const BALL_SIZE = CFG.grid.ballSize; // Size of each ball in pixels
const NUM_COLORS = CFG.numColors; // colour indices 0..NUM_COLORS-1; the theme draws them
const MARGIN = CFG.grid.margin;
const ANIM = CFG.animation;
const APP = CFG.APP || { name: 'Swell Foop', version: '' };
const TEXT = CFG.text || {};
const BOARD_W = GRID_COLS * BALL_SIZE; // board size in game units (unscaled pixels)
const BOARD_H = GRID_ROWS * BALL_SIZE;

// Game state variables
let canvas, ctx;
let grid = []; // The main game grid, stores final positions
let score = CFG.start.score;
let moves = CFG.start.moves;
let isGameOver = false;

// Theme / rendering state
let theme = SF_THEMES.get(SF_THEMES.DEFAULT_ID);
let groupSize = [];   // size of the same-colour group each cell belongs to (emoji moods)
let hoverCell = null; // {r,c} under the mouse pointer
let framePending = false;

// Animation variables
let animationActive = false;
let animationStartTime = 0;
const animationDuration = ANIM.durationMs; // milliseconds for falling animation
const bounceCount = ANIM.bounceCount; // Number of bounces
let currentAnimationMovements = []; // Stores objects like { color, fromR, fromC, toR, toC }

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

    // Canvas size: game units stay BOARD_W x BOARD_H; fitCanvas() scales the display
    fitCanvas();
    window.addEventListener('resize', redrawAfterResize);

    // Add event listeners for mouse and touch
    canvas.addEventListener('mousedown', handleInput);
    canvas.addEventListener('touchstart', handleInput);
    canvas.addEventListener('mousemove', onHover);
    canvas.addEventListener('mouseleave', onHover);

    newGameBtn.addEventListener('click', startNewGame);
    messageButton.addEventListener('click', hideMessageBox);

    // Theme: saved choice (localStorage) or Classic; the picker UI lives in ui/theme_picker.js
    theme = SF_THEMES.get(loadSavedTheme());
    canvas.style.background = theme.bg || '';
    if (typeof SFPicker !== 'undefined') SFPicker.init();

    // Initial game start
    startNewGame();
}

/**
 * Sizes the canvas to the space it has, keeping the board's aspect ratio.
 * Standalone: never larger than CFG.maxScale (1 = the original 750x300).
 * In the hub (body.in-hub): fills the frame up to CFG.maxScaleInHub.
 * The backing store follows devicePixelRatio and the context is scaled, so
 * the drawing code keeps using game units (BALL_SIZE).
 */
function fitCanvas() {
    const box = canvas.parentElement;
    const cs = getComputedStyle(box);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const inHub = document.body.classList.contains('in-hub');
    const availW = Math.max(50, box.clientWidth - padX);
    let scale = availW / BOARD_W;
    if (inHub) {
        const availH = Math.max(50, box.clientHeight - padY);
        scale = Math.min(scale, availH / BOARD_H, CFG.maxScaleInHub || 3);
    } else {
        scale = Math.min(scale, CFG.maxScale || 1);
    }
    const cssW = Math.floor(BOARD_W * scale);
    const cssH = Math.floor(BOARD_H * scale);
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(canvas.width / BOARD_W, 0, 0, canvas.height / BOARD_H, 0, 0);
}

/**
 * Refit and redraw (a running fall animation redraws itself on its next frame).
 */
function redrawAfterResize() {
    if (!canvas) return;
    fitCanvas();
    if (!animationActive) drawGrid();
}

/**
 * Starts a new game: resets score, moves, generates a new grid, and draws it.
 */
function startNewGame() {
    score = CFG.start.score;
    moves = CFG.start.moves;
    isGameOver = false;
    animationActive = false; // Ensure animation is off for new game
    currentAnimationMovements = []; // Clear any pending animation data
    updateScoreDisplay();
    generateGrid();
    recomputeGroups();
    drawGrid(); // Initial draw without animation
    hideMessageBox(); // Ensure message box is hidden on new game
}

/**
 * Generates a new random grid of colored balls.
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
 * Draws a rounded rectangle.
 * @param {CanvasRenderingContext2D} ctx - The canvas rendering context.
 * @param {number} x - The x-coordinate of the upper-left corner of the rectangle.
 * @param {number} y - The y-coordinate of the upper-left corner of the rectangle.
 * @param {number} width - The width of the rectangle.
 * @param {number} height - The height of the rectangle.
 * @param {number} radius - The corner radius.
 */
function drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    // Corrected typo: quadraticCurveCurveTo changed to quadraticCurveTo
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
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
 * Other balls will be drawn at their final, static positions. Blocks come from the active theme
 * (cached sprites + optional animated overlay), so a frame is cheap.
 * @param {DOMHighResTimeStamp} [timestamp] - The current time provided by requestAnimationFrame.
 */
function drawGrid(timestamp) {
    if (!grid.length) return;
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

            // Calculate interpolated position for animated balls (linear fall)
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
                    bounceOffset = Math.sin(bouncePhase * Math.PI) * (BALL_SIZE * ANIM.bounceHeight); // Max bounce height 15% of ball size
                } else if (bounceCount === 2) {
                    // Two bounces: first larger, second smaller
                    if (bouncePhase < ANIM.bounceSplit) { // First bounce phase (0 to 0.6)
                        bounceOffset = Math.sin(bouncePhase / ANIM.bounceSplit * Math.PI) * (BALL_SIZE * ANIM.bounceHeight);
                    } else { // Second bounce phase (0.6 to 1.0)
                        bounceOffset = Math.sin((bouncePhase - ANIM.bounceSplit) / (1 - ANIM.bounceSplit) * Math.PI) * (BALL_SIZE * ANIM.bounceHeight2); // Smaller bounce
                    }
                }
            }
            interpolatedY -= bounceOffset; // Subtract offset to move ball upwards for bounce

            const seed = move.toR * GRID_COLS + move.toC;
            SF_THEMES.block(ctx, theme, move.color, interpolatedX, interpolatedY, size, k, T,
                { seed, mood: moodAt(move.toR, move.toC, T) });
        }
    }

    // Draw static balls (those not part of the current animation)
    for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
            const color = grid[r][c]; // This is the FINAL position and colour index in the main grid

            // Only draw if there's a ball AND it's not currently animating to this position
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
        if (theme.fx) scheduleFrame();
    } else if (theme.fx) {
        scheduleFrame(); // themes with an animated overlay (sparkle, glow, blink) keep a light loop going
    }
}

/** Schedules one drawGrid on the next animation frame (never more than one pending). */
function scheduleFrame() {
    if (framePending) return;
    framePending = true;
    requestAnimationFrame((ts) => { framePending = false; drawGrid(ts); });
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

    // Find all connected balls of the same color
    const connectedBalls = findConnectedBalls(row, col, clickedColor);

    // Only remove if there are at least 2 connected balls
    if (connectedBalls.length >= CFG.minGroup) {
        // Create a temporary grid to calculate movements without modifying the main grid yet
        const tempGridAfterRemoval = JSON.parse(JSON.stringify(grid));
        removeBallsFromTemp(tempGridAfterRemoval, connectedBalls); // Remove balls from temp grid

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
        updateScoreDisplay();

        // Start the falling animation
        animationActive = true;
        animationStartTime = performance.now();
        scheduleFrame(); // Start the animation loop
    }
}

/**
 * Finds all connected balls of the same color using Breadth-First Search (BFS).
 * @param {number} startRow - Starting row for BFS.
 * @param {number} startCol - Starting column for BFS.
 * @param {string} targetColor - The color to match.
 * @returns {Array<Array<number>>} - An array of [row, col] pairs for connected balls.
 */
function findConnectedBalls(startRow, startCol, targetColor) {
    const connected = [];
    const queue = [[startRow, startCol]];
    const visited = new Set(); // Use a Set to store visited coordinates as "row,col" strings

    // Helper to add a coordinate to visited set
    const visit = (r, c) => visited.add(`${r},${c}`);
    // Helper to check if a coordinate has been visited
    const isVisited = (r, c) => visited.has(`${r},${c}`);

    visit(startRow, startCol); // Mark starting cell as visited

    while (queue.length > 0) {
        const [r, c] = queue.shift();
        connected.push([r, c]);

        // Check neighbors (up, down, left, right)
        const neighbors = [
            [r - 1, c], // Up
            [r + 1, c], // Down
            [r, c - 1], // Left
            [r, c + 1]  // Right
        ];

        for (const [nr, nc] of neighbors) {
            // Check bounds, if not visited, and if color matches
            if (nr >= 0 && nr < GRID_ROWS &&
                nc >= 0 && nc < GRID_COLS &&
                !isVisited(nr, nc) &&
                grid[nr][nc] === targetColor) {
                visit(nr, nc);
                queue.push([nr, nc]);
            }
        }
    }
    return connected;
}

/**
 * Removes the specified balls from a given grid by setting their color to null.
 * This operates on a temporary grid, not the main game grid.
 * @param {Array<Array<string|null>>} tempGrid - The grid to modify.
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
 * @param {Array<Array<string|null>>} inputGrid - The grid state to apply gravity to.
 * @returns {{newGrid: Array<Array<string|null>>, movements: Array<{color: string, fromR: number, fromC: number, toR: number, toC: number}>}}
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
                // This ball at (r, c) will move to (r + emptySpaces, c)
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
 * @param {Array<Array<string|null>>} inputGrid - The grid state to apply column shifts to.
 * @returns {{newGrid: Array<Array<string|null>>, movements: Array<{color: string, fromR: number, fromC: number, toR: number, toC: number}>}}
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
                if (tempGrid[r][c] !== null) { // Only move if there's a ball
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
 * Calculates the score based on the number of balls removed.
 * Formula: n * (n - 1) where n is the number of balls.
 * @param {number} numBalls - The number of balls removed in a single move.
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
 * Game is over if no group of 2 or more connected balls can be found.
 */
function checkGameOver() {
    let possibleMovesExist = false;
    for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
            const color = grid[r][c];
            if (color !== null) {
                const connected = findConnectedBalls(r, c, color);
                if (connected.length >= CFG.minGroup) {
                    possibleMovesExist = true;
                    break; // Found a possible move, no need to check further
                }
            }
        }
        if (possibleMovesExist) break;
    }

    if (!possibleMovesExist) {
        isGameOver = true;
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
            requestAnimationFrame(redrawAfterResize);
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
