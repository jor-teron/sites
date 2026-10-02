/*
 * Tic-tac-toe — configuration.
 * Players, rules and on-screen text. tic-tac-toe_logic.js reads TICTACTOE_CONFIG.
 * (This game is mouse/touch only; it had no keyboard controls.)
 */
const TICTACTOE_CONFIG = {
  // Player marks
  players: {
    first: 'X',    // who moves first on a new game
    second: 'O',   // the other player
  },

  // Board size (cells) — must match the 9 .cell elements in the HTML
  cellCount: 9,

  // Winning lines as lists of cell indexes (rows, columns, diagonals)
  winPatterns: [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ],

  // On-screen text
  text: {
    title: 'Tic-tac-toe',         // heading
    turn: "{player}'s turn",      // status during play ({player} replaced)
    win: '{player} wins!',        // status when someone wins
    draw: 'Draw!',                // status on a full board with no winner
    newGame: 'New game',          // reset button label
  },
};
