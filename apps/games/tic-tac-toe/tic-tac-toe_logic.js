/*
 * Tic-tac-toe — game logic. Rules/text come from TICTACTOE_CONFIG.
 */
const CFG = TICTACTOE_CONFIG;
const P1 = CFG.players.first;
const P2 = CFG.players.second;

const board = document.getElementById('board');
const statusEl = document.getElementById('status');
const resetBtn = document.getElementById('resetBtn');
const cells = document.querySelectorAll('.cell');

// On-screen text from config
document.querySelector('.title').textContent = CFG.text.title;
resetBtn.textContent = CFG.text.newGame;

function emptyState() {
    return new Array(CFG.cellCount).fill('');
}

function fmt(template, player) {
    return template.replace('{player}', player);
}

let gameState = emptyState();
let currentPlayer = P1;
let gameActive = true;

const winPatterns = CFG.winPatterns;

function checkWin(state, player) {
    return winPatterns.some(pattern =>
        pattern.every(index => state[index] === player)
    );
}

function isBoardFull(state) {
    return state.every(cell => cell !== '');
}

function updateStatus() {
    if (!gameActive) return;

    if (checkWin(gameState, P1)) {
        statusEl.textContent = fmt(CFG.text.win, P1);
        statusEl.className = 'status winner';
        gameActive = false;
        highlightWinningCells(P1);
    } else if (checkWin(gameState, P2)) {
        statusEl.textContent = fmt(CFG.text.win, P2);
        statusEl.className = 'status winner';
        gameActive = false;
        highlightWinningCells(P2);
    } else if (isBoardFull(gameState)) {
        statusEl.textContent = CFG.text.draw;
        statusEl.className = 'status winner';
        gameActive = false;
    } else {
        statusEl.textContent = fmt(CFG.text.turn, currentPlayer);
        statusEl.className = `status ${currentPlayer === P1 ? 'x-turn' : 'o-turn'}`;
    }
}

function highlightWinningCells(player) {
    winPatterns.forEach(pattern => {
        if (pattern.every(index => gameState[index] === player)) {
            pattern.forEach(index => {
                cells[index].classList.add('winner');
            });
        }
    });
}

function handleCellClick(e) {
    if (!gameActive) return;

    const cell = e.target;
    const index = parseInt(cell.dataset.index);

    if (gameState[index] !== '') return;

    gameState[index] = currentPlayer;
    cell.textContent = currentPlayer;
    cell.classList.add('filled', currentPlayer.toLowerCase());

    if (checkWin(gameState, currentPlayer)) {
        updateStatus();
    } else if (isBoardFull(gameState)) {
        updateStatus();
    } else {
        currentPlayer = currentPlayer === P1 ? P2 : P1;
        updateStatus();
    }
}

function resetGame() {
    gameState = emptyState();
    currentPlayer = P1;
    gameActive = true;

    cells.forEach(cell => {
        cell.textContent = '';
        cell.classList.remove('filled', 'x', 'o', 'winner');
    });

    updateStatus();
}

cells.forEach(cell => {
    cell.addEventListener('click', handleCellClick);
});

resetBtn.addEventListener('click', resetGame);

updateStatus();
