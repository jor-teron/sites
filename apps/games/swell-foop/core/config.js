/*
 * Swell Foop — configuration.
 * Grid, colours count, animation, scoring and on-screen text (block drawing: assets/themes/).
 * core/logic.js reads everything from SWELL_FOOP_CONFIG.
 * (Mouse/touch game; it had no keyboard controls.)
 * APP = name / version / author / category (title bar + sites hub header).
 */
const SWELL_FOOP_CONFIG = {
    // App info (own title bar, and the sites hub header via the hub bridge)
    APP: { name: 'Swell Foop', version: '1.0', author: 'Jor Teron', category: 'Games', release: 'SF2a' },

    // Grid. cols/rows are the original size (15x6); the real board size is computed from the window in
    // core/logic.js (see layout below). ballSize = game units per cell (themes draw blocks at ballSize - 2*margin).
    // Debug: ?cols=15&rows=6 in the URL forces a board size.
    grid: {
        cols: 15,          // original columns (also used when the window gives no size)
        rows: 6,           // original rows
        ballSize: 50,      // size of each cell in game units
        margin: 2,         // gap around each block in game units
    },

    // Responsive board: how many columns / rows fit, and how big a cell may be (CSS px)
    layout: {
        cellTouch: 40,     // wanted cell size on touch screens (tap target)
        cellMouse: 56,     // wanted cell size with a mouse
        minCell: 30,       // never smaller than this when the board is rebuilt
        maxCell: 72,       // never larger than this (huge monitors)
        minCols: 6, maxCols: 32,
        minRows: 5, maxRows: 24,
        fillMax: 1.15,     // a cell may grow up to this x the wanted size to fill the window better
        wideRatio: 1.15,   // window wider than this (w/h): score + buttons go to a side panel
        keepMin: 0.8,      // keep a game in progress while its cell stays within keepMin..keepMax x the wanted size
        keepMax: 1.35,
        resizeDebounceMs: 120,
    },

    // Number of block colours (indices 0..n-1). How each index looks (colour AND shape) is decided by
    // the active theme (assets/themes/*.js, registry in core/themes.js); every theme draws 5 variants.
    numColors: 3,
    themeStorageKey: 'swellfoop.theme', // localStorage key for the chosen theme (falls back to Classic)

    // Starting values
    start: {
        score: 0,          // initial score
        moves: 0,          // initial moves
    },

    // Rules
    minGroup: 2,           // smallest group that can be removed

    // Falling animation
    animation: {
        durationMs: 400,       // fall duration
        bounceCount: 0,        // 0, 1 or 2 bounces at the end of the fall
        bounceStart: 0.7,      // fraction of the fall when bounce starts
        bounceHeight: 0.15,    // first bounce height (fraction of ball size)
        bounceHeight2: 0.08,   // second bounce height (fraction of ball size)
        bounceSplit: 0.6,      // phase split between first and second bounce
        idleMs: 33,            // wait before each idle redraw of themes with an animated overlay (<= ~30fps; flat themes never redraw)
                               // GS2: with the shared Games Settings loaded, its fpsLimit sets this rate instead
    },

    // GS2: phone vibration (shared "vibration" setting). ms or a pattern array; 0 = off
    vibrate: {
        bigGroup: 10,          // removing a group of at least this many blocks ...
        bigGroupMs: 20,        // ... buzzes this long
        gameOverMs: 150,
    },
    fpsMeterMs: 500,           // GS2: FPS counter (shared "showFps") refresh interval

    // On-screen text
    text: {
        gameOverTitle: 'Game Over!',            // message box title
        gameOverText: 'Your final score: {score}', // message box text ({score} replaced)
        versionPrefix: 'v',                     // small version next to the title
        statScore: 'Score',                     // hub header chip label
        statMoves: 'Moves',                     // hub header chip label
        newGame: 'New Game',                    // hub header button label
        theme: 'Theme',                         // theme picker button label
        fitText: 'Screen shape changed. Fit the board to it?', // shown when a game in progress would need a new board size
    },
};
