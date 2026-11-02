/*
 * Connect 4 — game controller (C4-1). Wires board, AI, renderer, sound, settings and DOM.
 * Red (1) always starts; vs CPU you are Red and the computer is Yellow.
 * Undo: 2 players = one move; vs CPU = the computer's reply and your move together.
 * Saves score + mode in localStorage (C4_CONFIG.storeKey).
 */
(() => {
  const B = C4Board, CFG = C4_CONFIG, S = C4_SETTINGS;
  const $ = (id) => document.getElementById(id);
  const NAMES = { 1: 'Red', 2: 'Yellow' };
  const CPU = 2;

  // ---- persistent state (score + mode) ----
  function load() {
    try { const s = JSON.parse(localStorage.getItem(CFG.storeKey)); if (s && s.score) return s; } catch (_) {}
    return { score: { 1: 0, 2: 0, d: 0 }, mode: CFG.difficultyToLevel[S.get('difficulty')] || 'medium' };
  }
  const saved = load();
  const save = () => { try { localStorage.setItem(CFG.storeKey, JSON.stringify(saved)); } catch (_) {} };

  // ---- game state ----
  let grid, turn, moves, win, over, cpuTimer = 0;
  const view = { grid: null, win: null, hoverCol: -1 };
  const isCpu = () => saved.mode !== '2p';

  function newGame() {
    clearTimeout(cpuTimer);
    grid = B.create(); turn = 1; moves = []; win = null; over = false;
    sync(); status();
  }
  function sync() { view.grid = grid; view.win = win; C4Render.setState(view); }

  function status(text) {
    $('status').textContent = text || (isCpu() && turn === CPU ? 'Computer is thinking…' : NAMES[turn] + "'s turn");
    $('lblR').textContent = isCpu() ? 'You' : 'Red';
    $('lblY').textContent = isCpu() ? 'CPU' : 'Yellow';
    $('scR').textContent = saved.score[1]; $('scY').textContent = saved.score[2]; $('scD').textContent = saved.score.d;
    $('modeSel').value = saved.mode;
    $('undoBtn').disabled = !moves.length || C4Render.busy();
  }

  /** Drop a disc for the current player in column c (animated). */
  function play(c) {
    if (over || C4Render.busy()) return false;
    const r = B.openRow(grid, c); if (r < 0) return false;
    const p = turn;
    grid[r][c] = p; moves.push({ r, c });
    C4Render.drop(c, r, p, () => landed(r, c, p));
    status(' '); return true;
  }

  function landed(r, c, p) {
    C4Sound.drop();
    win = B.winAt(grid, r, c);
    if (win) {
      over = true; saved.score[p]++; save(); sync(); C4Sound.win();
      S.vibrate(isCpu() && p === CPU ? [60, 60, 60] : 120);
      status(isCpu() ? (p === CPU ? 'Computer wins!' : 'You win!') : NAMES[p] + ' wins!');
      return;
    }
    if (B.isFull(grid)) { over = true; saved.score.d++; save(); sync(); C4Sound.draw(); status('Draw!'); return; }
    turn = 3 - p; sync(); status();
    if (isCpu() && turn === CPU) cpuTimer = setTimeout(cpuMove, CFG.cpuDelayMs);
  }

  function cpuMove() {
    if (over || turn !== CPU) return;
    play(C4AI.choose(grid, CPU, saved.mode));
  }

  function undo() {
    if (C4Render.busy() || !moves.length) return;
    clearTimeout(cpuTimer);
    let n = 1;
    if (isCpu()) n = turn === CPU && !over ? 1 : (moves.length >= 2 ? 2 : 1); // take back CPU reply + yours
    if (over) { // undoing a finished game also takes the result off the tally
      const last = moves[moves.length - 1];
      const p = grid[last.r][last.c];
      if (win) saved.score[p] = Math.max(0, saved.score[p] - 1); else saved.score.d = Math.max(0, saved.score.d - 1);
      save();
      if (isCpu() && p === 1) n = 1;          // you won: only your move
    }
    for (let i = 0; i < n && moves.length; i++) { const m = moves.pop(); grid[m.r][m.c] = 0; }
    turn = moves.length % 2 === 0 ? 1 : 2; win = null; over = false;
    sync(); status();
    if (isCpu() && turn === CPU) cpuTimer = setTimeout(cpuMove, CFG.cpuDelayMs);
  }

  // ---- input ----
  const cv = $('board');
  C4Render.init(cv);
  const humanTurn = () => !(isCpu() && turn === CPU);
  cv.addEventListener('pointerdown', (e) => { const c = C4Render.colAt(e.clientX); if (c >= 0 && humanTurn()) play(c); });
  cv.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { view.hoverCol = C4Render.colAt(e.clientX); C4Render.draw(); } });
  cv.addEventListener('pointerleave', () => { view.hoverCol = -1; C4Render.draw(); });
  document.addEventListener('keydown', (e) => {
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 7 && humanTurn()) play(n - 1);
    else if (e.key === 'u' || e.key === 'Backspace') undo();
    else if (e.key === 'n') newGame();
  });
  $('newBtn').onclick = newGame;
  $('undoBtn').onclick = undo;
  $('clearBtn').onclick = () => { saved.score = { 1: 0, 2: 0, d: 0 }; save(); status(); };
  $('modeSel').onchange = (e) => { saved.mode = e.target.value; save(); newGame(); };

  // ---- theme + layout ----
  function applyTheme() { document.documentElement.classList.toggle('dark', S.isDark()); C4Render.draw(); }
  S.onChange((ch) => { if ('theme' in ch) applyTheme(); });
  const wrap = $('boardWrap');
  const fit = () => C4Render.resize(wrap);
  window.addEventListener('resize', fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(wrap);

  // gear inside the button row (its own slot, never hidden by the row's overflow)
  const gear = S.mountGear($('gearSlot'));
  if (!gear) $('gearSlot').remove();

  applyTheme(); newGame(); fit();
  window.C4Game = { play, undo, newGame, state: () => ({ grid, turn, over, win, moves: moves.length, mode: saved.mode }) }; // for tests
})();
