/*
 * Swell Foop — configuration.
 * Grid, colours count, animation, scoring and on-screen text (block drawing: assets/themes/).
 * core/logic.js reads everything from SWELL_FOOP_CONFIG.
 * (Mouse/touch game; it had no keyboard controls.)
 * APP = name / version / author / category (title bar + sites hub header).
 */
const SWELL_FOOP_CONFIG = {
    // App info (own title bar, and the sites hub header via the hub bridge)
    APP: { name: 'Swell Foop', version: '1.0', author: 'Jor Teron', category: 'Games', release: 'SF1a' },

    // Grid
    grid: {
        cols: 15,          // columns
        rows: 6,           // rows
        ballSize: 50,      // size of each cell in pixels
        margin: 2,         // gap around each ball in pixels
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
    },

    // Board scaling: standalone never grows past this (1 = original 50px cells);
    // inside the hub the board fills the frame up to maxScaleInHub.
    maxScale: 1,
    maxScaleInHub: 3,

    // On-screen text
    text: {
        gameOverTitle: 'Game Over!',            // message box title
        gameOverText: 'Your final score: {score}', // message box text ({score} replaced)
        versionPrefix: 'v',                     // small version next to the title
        statScore: 'Score',                     // hub header chip label
        statMoves: 'Moves',                     // hub header chip label
        newGame: 'New Game',                    // hub header button label
        theme: 'Theme',                         // theme picker button label
    },
};
