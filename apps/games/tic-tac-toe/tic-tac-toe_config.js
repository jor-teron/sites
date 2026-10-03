/*
 * Tic-tac-toe — configuration.
 * Players, rules, modes, CPU, rumble and on-screen text. tic-tac-toe_logic.js reads
 * TICTACTOE_CONFIG.
 * Controls: click / tap a cell. Keyboard / gamepad: arrows or WASD move the focus,
 * Enter / Space place a mark (or start a new game when it is over), N or Escape =
 * new game, M = next mode. (Hub controller: A = Space, Start = Enter, Select = Escape.)
 */
const TICTACTOE_CONFIG = {
  app: { name: 'Tic-Tac-Toe', version: '1.1' },

  // Player marks. The human is always X in vs CPU modes; the CPU plays O.
  players: {
    first: 'X',
    second: 'O',
  },

  // Board size (cells) — must match the 9 .cell elements in the HTML
  cellCount: 9,

  // Winning lines as lists of cell indexes (rows, columns, diagonals)
  winPatterns: [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ],

  // Modes, in the order the Mode button cycles. id is saved in localStorage.
  modes: [
    { id: 'easy', label: 'vs CPU Easy', cpu: 'easy' },
    { id: 'hard', label: 'vs CPU Hard', cpu: 'hard' },
    { id: '2p',   label: '2 Players',   cpu: null },
  ],
  defaultMode: 'easy',      // used on first load / when no mode is saved

  // Alternate who moves first each new game (X, then O, ...). In vs CPU modes the
  // CPU opens when it is O's turn to start.
  alternateStart: true,

  cpu: {
    delayMs: 400,           // pause before the CPU moves (human input blocked meanwhile)
    easyWinChance: 0.6,     // Easy: chance to take a winning move when it has one
    easyBlockChance: 0.4,   // Easy: chance to block your winning move; otherwise random
  },

  // Phone-controller rumble via the hub (ms, or a pattern array; 0 = off)
  rumble: {
    winMs: 120,             // you (or anyone in 2 Players) win
    lossMs: [90, 60, 90],   // the CPU wins
  },

  // Mark size as a fraction of the cell side
  markScale: 0.62,

  // localStorage keys (score is kept per mode)
  storage: {
    mode: 'ttt-mode',
    score: 'ttt-score',
  },

  // On-screen text
  text: {
    title: 'Tic-tac-toe',
    turn: "{player}'s turn",
    win: '{player} wins!',
    draw: 'Draw!',
    yourTurn: 'Your turn',
    cpuTurn: 'CPU thinking…',
    youWin: 'You win!',
    cpuWins: 'CPU wins!',
    newGame: 'New game',
    hubNewGame: 'New Game',
    resetScore: 'Reset score',
    modePrefix: '',         // put before the mode label on the Mode button, e.g. 'Mode: '
    statTurn: 'Turn',
    labelX: 'X',
    labelO: 'O',
    labelYou: 'You',
    labelCpu: 'CPU',
    labelDraws: 'Draws',
  },
};
