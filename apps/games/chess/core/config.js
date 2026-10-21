/* Chess — tunable colours, copy, and computer strength. Other files read Chess.config. */
(function (root) {
  const Chess = root.Chess = root.Chess || {};
  Chess.config = {
    app: { name: 'Chess', version: '1.0', category: 'Games' },
    ai: {
      beginner: { blunder: 0.24, noise: 36, band: 55, pst: 0.22 },
      medium: { depth: 3, budget: 700, band: 8 },
      hint: { depth: 2, budget: 450, band: 0 },
      minThink: 110,
    },
    anim: { squaresPerSecond: 8 },
    colors: {
      light: '#f0d9b5', dark: '#b58863', frame: '#6b4630',
      last: 'rgba(214, 196, 78, 0.55)', select: 'rgba(246, 214, 92, 0.9)',
      dot: 'rgba(40, 28, 16, 0.32)', check: 'rgba(204, 52, 40, 0.78)',
      hint: '#1f8a78', cursor: 'rgba(255, 255, 255, 0.85)',
      white: '#fbf7ef', whiteEdge: '#2c241c', black: '#2a241e', blackEdge: '#e4d5c0',
    },
    help: {
      beginner: 'Plays shallow chess and sometimes blunders. Hints are available.',
      medium: 'Looks two or three moves ahead. No hints.',
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
