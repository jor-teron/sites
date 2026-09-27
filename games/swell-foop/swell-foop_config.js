/*
 * Swell Foop — configuration.
 * Grid, colors, animation, scoring and on-screen text.
 * swell-foop_logic.js reads everything from SWELL_FOOP_CONFIG.
 * (Mouse/touch game; it had no keyboard controls.)
 */
const SWELL_FOOP_CONFIG = {
    // Grid
    grid: {
        cols: 15,          // columns
        rows: 6,           // rows
        ballSize: 50,      // size of each cell in pixels
        margin: 2,         // gap around each ball in pixels
        cornerRadius: 8,   // ball corner radius
    },

    // Ball colors (one is picked at random per cell)
    colors: [
        '#3b82f6', // blue-500
        '#22c55e', // green-500
        '#f59e0b', // amber-500
    ],
    outline: '#cbd5e0',    // light stroke around each ball
    outlineWidth: 1,       // stroke width

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

    // On-screen text
    text: {
        gameOverTitle: 'Game Over!',            // message box title
        gameOverText: 'Your final score: {score}', // message box text ({score} replaced)
    },
};
