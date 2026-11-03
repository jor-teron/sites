/*
 * Blockade — game controller (BLKD-1). Wires rules, AI, renderer, sound, settings and the page.
 * A turn: tap one of your pawns, tap a dot to move it, then place a wall (tap a groove → preview,
 * Rotate to turn it, tap again or Place to set) or Skip. vs CPU you are Orange (bottom, moves first).
 * Undo: in the wall step = take back the pawn move; otherwise one turn (vs CPU: the computer's turn
 * and yours together); after a win it also takes the win off the tally.
 * Saves wins, mode and the game in progress in localStorage (BK_CONFIG.storeKey).
 */
(() => {
  const R = BKRules, CFG = BK_CONFIG, S = BK_SETTINGS;
  const $ = (id) => document.getElementById(id);
  const CPU = 2;

  function load() {
    try { const s = JSON.parse(localStorage.getItem(CFG.storeKey)); if (s && s.score) return s; } catch (_) {}
    return { score: { 1: 0, 2: 0 }, mode: CFG.difficultyToLevel[S.get('difficulty')] || 'medium', game: null };
  }
  const saved = load();
  const save = () => { try { localStorage.setItem(CFG.storeKey, JSON.stringify(saved)); } catch (_) {} };

  let s, start, hist, phase, sel = -1, orient = 'v', preview = null, last = null, flash = '', cpuTimer = 0;
  const isCpu = () => saved.mode !== '2p';
  const name = (p) => (isCpu() ? (p === CPU ? 'Computer' : 'You') : CFG.names[p]);
  const humanTurn = () => phase !== 'over' && !(isCpu() && s.turn === CPU);

  function persist() {
    saved.game = phase === 'over' ? null : { hist, start: R.serialize(start), cur: R.serialize(s), phase, last };
    save();
  }

  function newGame() {
    clearTimeout(cpuTimer);
    s = R.create(); start = R.clone(s); hist = []; phase = 'move'; sel = -1; preview = null; last = null; flash = '';
    persist(); refresh(); maybeCpu();
  }

  function restore() {
    const g = saved.game;
    try {
      if (g && g.cur && g.start && Array.isArray(g.hist)) {
        s = R.deserialize(g.cur); start = R.deserialize(g.start); hist = g.hist; phase = g.phase === 'wall' ? 'wall' : 'move';
        last = g.last || null; sel = -1; preview = null; flash = ''; refresh(); maybeCpu(); return;
      }
    } catch (_) { /* bad save: start fresh */ }
    newGame();
  }

  function refresh() {
    const targets = phase === 'move' && sel >= 0 && humanTurn() ? R.pawnMoves(s, sel) : null;
    BKRender.setState({ s, sel: phase === 'move' ? sel : -1, targets, preview, last });
    status();
  }

  function status() {
    const p = s.turn;
    let t;
    if (phase === 'over') t = (isCpu() ? (s.winner === CPU ? 'The computer wins!' : 'You win!') : CFG.names[s.winner] + ' wins!');
    else if (flash) t = flash;
    else if (isCpu() && p === CPU) t = 'Computer is thinking…';
    else if (phase === 'wall') t = (isCpu() ? 'Your' : CFG.names[p] + "'s") + ' wall: tap a groove, then tap again to place – or Skip';
    else t = (isCpu() ? 'Your' : CFG.names[p] + "'s") + ' move: ' + (sel >= 0 ? 'tap a dot' : 'tap one of your pawns');
    $('status').textContent = t;
    for (const q of [1, 2]) {
      $('lbl' + q).textContent = name(q);
      $('wv' + q).textContent = s.left[q].v; $('wh' + q).textContent = s.left[q].h;
      $('win' + q).textContent = saved.score[q];
    }
    $('modeSel').value = saved.mode;
    const wall = phase === 'wall' && humanTurn();
    $('rotBtn').disabled = !wall; $('skipBtn').disabled = !wall; $('placeBtn').disabled = !(wall && preview && preview.ok);
    $('rotBtn').textContent = orient === 'v' ? 'Rotate: │ green' : 'Rotate: ─ blue';
    $('undoBtn').disabled = !(phase === 'wall' || hist.length || phase === 'over') || (isCpu() && s.turn === CPU && phase !== 'over');
  }

  // ---- turn steps ----
  function movePawn(i, q) {
    R.movePawn(s, i, q); last = [start.pawns[i], q]; sel = -1;
    BKSound.move();
    if (s.winner) return win();
    const p = s.turn;
    if (s.left[p].v + s.left[p].h === 0) return endTurn();
    phase = 'wall'; if (s.left[p][orient] === 0) orient = orient === 'v' ? 'h' : 'v';
    persist(); refresh();
  }

  function setPreview(c) {
    const p = s.turn, why = R.wallProblem(s, c[0], c[1], orient, p);
    preview = { cx: c[0], cy: c[1], o: orient, ok: !why };
    flash = why === 'blocks' ? "That wall would shut a pawn in – every pawn needs a way home" :
      why === 'overlap' ? 'That wall would overlap or cross another wall' : why === 'none left' ? 'No walls of that colour left – Rotate' : '';
    refresh(); flash = '';
  }

  function placeWall() {
    if (!preview || !preview.ok) return false;
    R.placeWall(s, preview.cx, preview.cy, preview.o, s.turn); BKSound.wall();
    preview = null; endTurn(); return true;
  }

  function endTurn() {
    hist.push(R.serialize(start)); R.endTurn(s); start = R.clone(s); phase = 'move'; preview = null;
    persist(); refresh(); maybeCpu();
  }

  function win() {
    clearTimeout(cpuTimer);
    hist.push(R.serialize(start)); phase = 'over'; saved.score[s.winner]++; persist();
    BKSound.win(); S.vibrate(isCpu() && s.winner === CPU ? [60, 60, 60] : 120);
    refresh();
  }

  function maybeCpu() {
    clearTimeout(cpuTimer);
    if (phase === 'move' && isCpu() && s.turn === CPU) { status(); cpuTimer = setTimeout(cpuTurn, CFG.cpuDelayMs); }
  }
  function cpuTurn() {
    if (phase !== 'move' || s.turn !== CPU) return;
    const t = BKAI.choose(s, saved.mode);
    if (!t) { endTurn(); return; }
    R.movePawn(s, t.pawn, t.to); last = [start.pawns[t.pawn], t.to]; BKSound.move();
    if (s.winner) return win();
    if (t.wall && R.legalWall(s, t.wall[0], t.wall[1], t.wall[2], CPU)) { R.placeWall(s, t.wall[0], t.wall[1], t.wall[2], CPU); BKSound.wall(); }
    endTurn();
  }

  function undo() {
    clearTimeout(cpuTimer); preview = null; sel = -1; flash = '';
    if (phase === 'over') {
      saved.score[s.winner] = Math.max(0, saved.score[s.winner] - 1);
      s = R.deserialize(hist.pop()); start = R.clone(s);
      if (isCpu() && s.turn === CPU && hist.length) { s = R.deserialize(hist.pop()); start = R.clone(s); }
    } else if (phase === 'wall') s = R.clone(start);
    else if (hist.length) {
      s = R.deserialize(hist.pop());
      if (isCpu() && s.turn === CPU && hist.length) s = R.deserialize(hist.pop());
      start = R.clone(s);
    }
    phase = 'move'; last = null; persist(); refresh(); maybeCpu();
  }

  /** A tap on the board (client coordinates). */
  function tapAt(x, y) {
    if (!humanTurn()) return;
    if (phase === 'wall') {
      const c = BKRender.cornerAt(x, y);
      if (preview && preview.cx === c[0] && preview.cy === c[1] && preview.o === orient && preview.ok) { placeWall(); return; }
      setPreview(c); if (!preview.ok) BKSound.bad(); return;
    }
    const q = BKRender.squareAt(x, y); if (q < 0) return;
    const mine = s.turn === 1 ? [0, 1] : [2, 3], hit = mine.find((i) => s.pawns[i] === q);
    if (hit !== undefined) { sel = sel === hit ? -1 : hit; refresh(); return; }
    if (sel >= 0 && R.pawnMoves(s, sel).indexOf(q) >= 0) { movePawn(sel, q); return; }
  }

  // ---- input ----
  const cv = $('board');
  BKRender.init(cv);
  cv.addEventListener('pointerdown', (e) => tapAt(e.clientX, e.clientY));
  cv.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || phase !== 'wall' || !humanTurn()) return;
    const c = BKRender.cornerAt(e.clientX, e.clientY);
    if (!preview || preview.cx !== c[0] || preview.cy !== c[1]) setPreview(c);
  });
  $('newBtn').onclick = newGame;
  $('undoBtn').onclick = undo;
  $('rotBtn').onclick = () => {
    const n = orient === 'v' ? 'h' : 'v'; if (s.left[s.turn][n] === 0) { flash = 'No walls of that colour left'; status(); flash = ''; return; }
    orient = n; if (preview) setPreview([preview.cx, preview.cy]); else status();
  };
  $('placeBtn').onclick = placeWall;
  $('skipBtn').onclick = () => { if (phase === 'wall' && humanTurn()) endTurn(); };
  $('clearBtn').onclick = () => { saved.score = { 1: 0, 2: 0 }; save(); status(); };
  $('modeSel').onchange = (e) => { saved.mode = e.target.value; save(); newGame(); };
  $('helpBtn').onclick = () => { $('help').hidden = false; };
  $('helpClose').onclick = () => { $('help').hidden = true; };
  $('help').addEventListener('pointerdown', (e) => { if (e.target === $('help')) $('help').hidden = true; });
  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'SELECT') return;
    if (e.key === 'r') $('rotBtn').click(); else if (e.key === 's') $('skipBtn').click();
    else if (e.key === 'u' || e.key === 'Backspace') undo(); else if (e.key === 'n') newGame();
    else if (e.key === 'Escape') $('help').hidden = true;
  });

  // ---- theme + layout ----
  function applyTheme() { document.documentElement.classList.toggle('dark', S.isDark()); BKRender.draw(); }
  S.onChange((ch) => { if ('theme' in ch) applyTheme(); });
  const wrap = $('boardWrap');
  const fit = () => BKRender.resize(wrap);
  window.addEventListener('resize', fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(wrap);
  const gear = S.mountGear($('gearSlot'));
  if (!gear) $('gearSlot').remove();

  applyTheme(); restore(); fit();
  // for tests
  window.BKGame = {
    select: (i) => { sel = i; refresh(); }, move: (i, x, y) => { if (!humanTurn() || phase !== 'move') return false; const q = R.sq(x, y); if (R.pawnMoves(s, i).indexOf(q) < 0) return false; movePawn(i, q); return true; },
    wall: (cx, cy, o) => { if (phase !== 'wall') return false; orient = o; setPreview([cx, cy]); return placeWall(); },
    skip: () => { if (phase === 'wall') endTurn(); }, undo, newGame,
    state: () => ({ pawns: s.pawns.slice(), walls: s.walls.length, left: s.left, turn: s.turn, phase, winner: s.winner, hist: hist.length, mode: saved.mode }),
    raw: () => s,
  };
})();
