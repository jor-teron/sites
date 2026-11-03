/*
 * Go — game controller (GO-1). Wires rules, AI, renderer, sound, settings and the page.
 * Phases: 'play' → two passes in a row → 'mark' (tap dead stones) → Count score → 'over'.
 * vs CPU you are Black (you start) and the computer is White.
 * Undo: 2 players = one move; vs CPU = the computer's reply and your move together.
 * In 'mark', Undo = Resume play; in 'over', Undo takes the result off the tally and goes back to 'mark'.
 * Saves wins, mode, size, tap choice and the game in progress in localStorage (GO_CONFIG.storeKey).
 */
(() => {
  const R = GoRules, CFG = GO_CONFIG, S = GO_SETTINGS, PASS = R.PASS;
  const $ = (id) => document.getElementById(id);
  const NAMES = { 1: 'Black', 2: 'White' };
  const CPU = 2;

  // ---- persistent state ----
  function load() {
    try { const s = JSON.parse(localStorage.getItem(CFG.storeKey)); if (s && s.score) return s; } catch (_) {}
    return { score: { 1: 0, 2: 0 }, mode: CFG.difficultyToLevel[S.get('difficulty')] || 'medium', size: CFG.defaultSize, tap: 'auto', game: null };
  }
  const saved = load();
  if (CFG.sizes.indexOf(saved.size) < 0) saved.size = CFG.defaultSize;
  const save = () => { try { localStorage.setItem(CFG.storeKey, JSON.stringify(saved)); } catch (_) {} };

  // ---- game state ----
  let pos, history, moves, phase, dead, result, cpuTimer = 0, flash = '';
  const view = { b: null, n: 9, last: -1, ghost: -1, pending: -1, toPlay: 1, phase: 'play', dead: null, owner: null };
  const isCpu = () => saved.mode !== '2p';
  const humanTurn = () => phase === 'play' && !(isCpu() && pos.toPlay === CPU);

  function newGame(size) {
    clearTimeout(cpuTimer);
    if (size) saved.size = size;
    pos = R.create(saved.size); history = []; moves = []; phase = 'play'; dead = null; result = null; flash = '';
    view.pending = -1; view.ghost = -1;
    saved.game = { size: saved.size, moves: [] }; save();
    refresh();
  }

  function restore() {
    const g = saved.game;
    if (!g || g.size !== saved.size || !Array.isArray(g.moves)) return newGame();
    newGame();
    for (const m of g.moves) { history.push(R.clone(pos)); if (!R.play(pos, m)) { history.pop(); break; } moves.push(m); }
    saved.game.moves = moves.slice();
    if (pos.passes >= 2) enterMark(); else { refresh(); maybeCpu(); }
  }

  const lastPoint = () => (moves.length ? moves[moves.length - 1] : -1);

  function refresh() {
    view.b = pos.b; view.n = pos.n; view.toPlay = pos.toPlay; view.phase = phase; view.dead = dead;
    view.last = lastPoint();
    view.owner = phase === 'mark' || phase === 'over' ? R.score(pos.b, pos.n, dead, CFG.komi).owner : null;
    GoRender.setState(view);
    status();
  }

  function status() {
    let t;
    if (phase === 'over') {
      t = (isCpu() ? (result.winner === CPU ? 'Computer wins' : 'You win') : NAMES[result.winner] + ' wins') +
        ' by ' + result.margin + ' (Black ' + result.black + ' – White ' + result.white + ')';
    } else if (phase === 'mark') {
      const sc = R.score(pos.b, pos.n, dead, CFG.komi);
      t = 'Game over: tap dead stones, then Count score. Now: Black ' + sc.black + ' – White ' + sc.white;
    } else if (flash) t = flash;
    else if (isCpu() && pos.toPlay === CPU) t = 'Computer is thinking…';
    else {
      const who = isCpu() ? 'Your move (Black)' : NAMES[pos.toPlay] + ' to play';
      const passed = moves.length && moves[moves.length - 1] === PASS ? (isCpu() && pos.toPlay !== CPU ? 'Computer passed. ' : NAMES[3 - pos.toPlay] + ' passed. ') : '';
      t = passed + who + (view.pending >= 0 ? ' – tap again to place' : '');
    }
    $('status').textContent = t;
    $('capB').textContent = pos.caps[1]; $('capW').textContent = pos.caps[2];
    $('lblB').textContent = isCpu() ? 'You' : 'Black'; $('lblW').textContent = isCpu() ? 'CPU' : 'White';
    $('winB').textContent = saved.score[1]; $('winW').textContent = saved.score[2];
    $('modeSel').value = saved.mode; $('sizeSel').value = String(saved.size); $('tapSel').value = saved.tap;
    $('passBtn').textContent = phase === 'play' ? 'Pass' : 'Count score';
    $('passBtn').disabled = phase === 'over' || (phase === 'play' && !humanTurn());
    $('undoBtn').textContent = phase === 'mark' ? 'Resume' : 'Undo';
    $('undoBtn').disabled = phase === 'play' ? !moves.length || (isCpu() && pos.toPlay === CPU) : false;
  }

  /** Apply a move (point or PASS) for the side to play. Returns false if illegal. */
  function doMove(pt) {
    if (phase !== 'play') return false;
    const before = R.clone(pos);
    if (!R.play(pos, pt)) return false;
    history.push(before); moves.push(pt); view.pending = -1; flash = '';
    saved.game.moves = moves.slice(); save();
    const capped = pos.caps[before.toPlay] - before.caps[before.toPlay];
    if (pt === PASS) GoSound.pass(); else if (capped) { GoSound.capture(); S.vibrate(30); } else GoSound.stone();
    if (pos.passes >= 2) { enterMark(); return true; }
    refresh(); maybeCpu();
    return true;
  }

  function maybeCpu() {
    clearTimeout(cpuTimer);
    if (phase === 'play' && isCpu() && pos.toPlay === CPU) cpuTimer = setTimeout(cpuMove, CFG.cpuDelayMs);
  }

  function cpuMove() {
    if (phase !== 'play' || pos.toPlay !== CPU) return;
    const lastM = moves.length ? moves[moves.length - 1] : -1;
    let pt = GoAI.choose(pos, saved.mode, lastM, lastM === PASS && moves.length > 0);
    if (!doMove(pt)) doMove(PASS);
  }

  /** Human tap on a point. */
  function tap(pt, needConfirm) {
    if (phase === 'mark') return toggleDead(pt);
    if (!humanTurn() || pt < 0) return false;
    const why = R.whyIllegal(pos, pt);
    if (why) {
      view.pending = -1;
      flash = why === 'ko' ? "Ko: you can't take back at once – play elsewhere first" : why === 'suicide' ? "Can't play there: the stone would have no liberties" : '';
      refresh(); flash = ''; return false;
    }
    if (needConfirm && view.pending !== pt) { view.pending = pt; refresh(); return false; }
    return doMove(pt);
  }

  function pass() {
    if (phase === 'mark') return finish();
    if (!humanTurn()) return;
    doMove(PASS);
  }

  function enterMark() {
    clearTimeout(cpuTimer);
    phase = 'mark'; dead = new Uint8Array(pos.n * pos.n); view.pending = -1;
    GoSound.end(); refresh();
  }

  /** Toggle a whole chain dead / alive while counting. */
  function toggleDead(pt) {
    if (phase !== 'mark' || pt < 0 || !pos.b[pt]) return false;
    const g = R.group(pos.b, pos.n, pt), v = dead[pt] ? 0 : 1;
    for (const st of g.stones) dead[st] = v;
    refresh(); return true;
  }

  function finish() {
    if (phase !== 'mark') return;
    result = R.score(pos.b, pos.n, dead, CFG.komi);
    phase = 'over'; saved.score[result.winner]++; saved.game = null; save();
    S.vibrate(isCpu() && result.winner === CPU ? [60, 60, 60] : 120);
    refresh();
  }

  function popMove() { pos = history.pop(); moves.pop(); }

  function undo() {
    clearTimeout(cpuTimer); view.pending = -1;
    if (phase === 'over') {
      saved.score[result.winner] = Math.max(0, saved.score[result.winner] - 1);
      saved.game = { size: pos.n, moves: moves.slice() }; save();
      phase = 'mark'; result = null; refresh(); return;
    }
    if (phase === 'mark') {                                                 // Resume: take back the last pass
      phase = 'play'; dead = null; popMove();
      if (isCpu() && pos.toPlay === CPU && moves.length) popMove();        // vs CPU: back to your turn
    }
    else if (moves.length) {
      popMove();
      if (isCpu() && pos.toPlay === CPU && moves.length) popMove();        // CPU reply + your move
    }
    saved.game = { size: pos.n, moves: moves.slice() }; save();
    refresh(); maybeCpu();
  }

  // ---- input ----
  const cv = $('board');
  GoRender.init(cv);
  const needConfirm = (e) => saved.tap === 'twice' ||
    (saved.tap === 'auto' && e.pointerType !== 'mouse' && GoRender.cellPx() < CFG.confirmBelowPx);
  cv.addEventListener('pointerdown', (e) => { tap(GoRender.pointAt(e.clientX, e.clientY), needConfirm(e)); });
  cv.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const p = humanTurn() ? GoRender.pointAt(e.clientX, e.clientY) : -1;
    if (p !== view.ghost) { view.ghost = p; GoRender.draw(); }
  });
  cv.addEventListener('pointerleave', () => { if (view.ghost >= 0) { view.ghost = -1; GoRender.draw(); } });
  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'SELECT') return;
    if (e.key === 'p') pass();
    else if (e.key === 'u' || e.key === 'Backspace') undo();
    else if (e.key === 'n') newGame();
    else if (e.key === 'Escape') $('help').hidden = true;
  });
  $('newBtn').onclick = () => newGame();
  $('passBtn').onclick = pass;
  $('undoBtn').onclick = undo;
  $('clearBtn').onclick = () => { saved.score = { 1: 0, 2: 0 }; save(); status(); };
  $('modeSel').onchange = (e) => { saved.mode = e.target.value; save(); newGame(); };
  $('sizeSel').onchange = (e) => newGame(Number(e.target.value));
  $('tapSel').onchange = (e) => { saved.tap = e.target.value; view.pending = -1; save(); refresh(); };
  $('helpBtn').onclick = () => { $('help').hidden = false; };
  $('helpClose').onclick = () => { $('help').hidden = true; };
  $('help').addEventListener('pointerdown', (e) => { if (e.target === $('help')) $('help').hidden = true; });

  // ---- theme + layout ----
  function applyTheme() { document.documentElement.classList.toggle('dark', S.isDark()); GoRender.draw(); }
  S.onChange((ch) => { if ('theme' in ch) applyTheme(); });
  const wrap = $('boardWrap');
  const fit = () => GoRender.resize(wrap);
  window.addEventListener('resize', fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(wrap);

  const gear = S.mountGear($('gearSlot'));
  if (!gear) $('gearSlot').remove();

  applyTheme(); restore(); fit();
  // for tests
  window.GoGame = {
    tap: (x, y) => tap(y * pos.n + x, false), pass, undo, newGame, toggleDead: (x, y) => toggleDead(y * pos.n + x), finish,
    state: () => ({ n: pos.n, board: Array.from(pos.b), toPlay: pos.toPlay, caps: pos.caps.slice(1), ko: pos.ko, phase, moves: moves.length, result, mode: saved.mode }),
  };
})();
