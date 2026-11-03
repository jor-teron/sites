/*
 * Orbito — game controller (ORB-1). Wires rules, AI, renderer, animation, sound, settings and the page.
 * Your turn by taps: (optional) tap a rival marble, then a green dot next to it to push it there;
 * then tap an empty hole to place your own marble. The board then turns (animated) and is checked.
 * vs CPU you are Black (you start) and the computer is White.
 * Undo: during your turn it first takes back the rival marble you moved; otherwise 2 players = one turn,
 * vs CPU = the computer's turn and yours together; after the end it also takes the result off the tally.
 * Saves wins, mode and the game in progress (as a list of turns) in localStorage (ORB_CONFIG.storeKey).
 */
(() => {
  const R = OrbRules, CFG = ORB_CONFIG, S = OB_SETTINGS, A = OBAnim, SND = OBSound, RD = OBRender;
  const $ = (id) => document.getElementById(id);
  const NAMES = CFG.names, CPU = 2;

  // ---- persistent state ----
  function load() {
    try { const s = JSON.parse(localStorage.getItem(CFG.storeKey)); if (s && s.score) { s.score.d = s.score.d || 0; return s; } } catch (_) {}
    return { score: { 1: 0, 2: 0, d: 0 }, mode: CFG.difficultyToLevel[S.get('difficulty')] || 'medium', game: null };
  }
  const saved = load();
  if (['2p', 'easy', 'medium', 'hard'].indexOf(saved.mode) < 0) saved.mode = 'medium';
  const save = () => { try { localStorage.setItem(CFG.storeKey, JSON.stringify(saved)); } catch (_) {} };

  // ---- game state ----
  let pos, history, turns, sel = -1, mv = null, cpuTimer = 0, gen = 0, cpuBusy = false, flash = '';
  const isCpu = () => saved.mode !== '2p';
  const busy = () => A.busy() || cpuBusy;
  const humanTurn = () => !pos.over && !busy() && !(isCpu() && pos.toPlay === CPU);
  /** The board as the player sees it: with the rival marble already pushed this turn. */
  function shown() { const b = pos.b.slice(); if (mv) { b[mv[1]] = b[mv[0]]; b[mv[0]] = 0; } return b; }

  function stop() { gen++; clearTimeout(cpuTimer); cpuBusy = false; A.finish(); RD.setAnim(null); }
  function newGame() {
    stop();
    pos = R.create(); history = []; turns = []; sel = -1; mv = null; flash = '';
    saved.game = { turns: [] }; save();
    refresh(); maybeCpu();
  }
  function restore() {
    const g = saved.game;
    if (!g || !Array.isArray(g.turns)) return newGame();
    const list = g.turns; newGame();
    for (const t of list) { const before = R.clone(pos); if (!R.play(pos, t)) break; history.push(before); turns.push(t); }
    saved.game = { turns: turns.slice() }; save();
    refresh(); maybeCpu();
  }

  function refresh() {
    const targets = sel >= 0 ? R.moveTargets(shown(), sel) : [];
    const last = turns.length && !mv ? R.ROT[turns[turns.length - 1].place] : -1;
    RD.set({ b: shown(), sel, targets, last: pos.over ? -1 : last, line: pos.over ? pos.line : null, moved: mv ? mv[1] : -1 });
    status();
  }
  const who = (p) => (isCpu() ? (p === CPU ? 'Computer' : 'You') : NAMES[p]);
  function status() {
    let t;
    if (pos.over) {
      const extra = pos.extra ? ' (after ' + pos.extra + ' more turn' + (pos.extra > 1 ? 's' : '') + ' of the full board)' : '';
      if (pos.draw) t = pos.line ? 'Draw: both made 4 in a row' : 'Draw: no 4 in a row after 5 more turns';
      else t = (isCpu() ? (pos.winner === CPU ? 'Computer wins' : 'You win!') : NAMES[pos.winner] + ' wins!') + extra;
    } else if (A.busy() && !cpuBusy) t = 'The board turns…';
    else if (isCpu() && pos.toPlay === CPU) t = 'Computer is thinking…';
    else if (flash) t = flash;
    else {
      const me = NAMES[pos.toPlay].toLowerCase(), opp = NAMES[3 - pos.toPlay].toLowerCase();
      const lead = isCpu() ? 'Your turn (' + me + ')' : NAMES[pos.toPlay] + "'s turn";
      if (sel >= 0) t = lead + ': tap a green dot to push that ' + opp + ' marble there';
      else if (mv) t = lead + ': now place a ' + me + ' marble';
      else t = lead + ': push a ' + opp + ' marble (optional), then place a ' + me + ' one';
    }
    $('status').textContent = t;
    $('leftB').textContent = pos.left[1]; $('leftW').textContent = pos.left[2];
    $('lblB').textContent = isCpu() ? 'You' : 'Black'; $('lblW').textContent = isCpu() ? 'CPU' : 'White';
    $('winB').textContent = saved.score[1]; $('winW').textContent = saved.score[2]; $('winD').textContent = saved.score.d;
    $('modeSel').value = saved.mode;
    $('undoBtn').disabled = !(mv || sel >= 0 || turns.length);
  }

  function tally(sign) {
    if (!pos.over) return;
    const k = pos.draw ? 'd' : pos.winner; saved.score[k] = Math.max(0, saved.score[k] + sign);
  }

  /** Play a whole turn for the side to move; animates the board turning. Returns false if illegal. */
  function commit(t) {
    if (pos.over) return false;
    const before = R.clone(pos);
    const ev = R.play(pos, t);
    if (!ev) return false;
    history.push(before); turns.push({ mv: t.mv ? t.mv.slice() : null, place: t.place });
    sel = -1; mv = null; flash = '';
    tally(1); saved.game = { turns: turns.slice() }; save();            // saved before the animation starts
    SND.place(); S.vibrate(15);
    const my = ++gen;
    const boards = ev.boards;
    RD.set({ b: boards[0], sel: -1, targets: [], last: t.place, line: null, moved: -1 });
    let k = 0;
    const next = () => {
      if (my !== gen) return;
      if (k >= boards.length - 1) { RD.setAnim(null); done(ev); return; }
      const from = boards[k++];
      SND.turn();
      A.run(CFG.rotateMs, (u) => RD.setAnim({ kind: 'turn', from, t: u }), () => { if (my !== gen) return; RD.setAnim(null); RD.set({ b: boards[k], last: -1 }); next(); });
    };
    next(); status();
    return true;
  }
  function done(ev) {
    cpuBusy = false;
    refresh();
    if (ev.over) {
      if (ev.draw) SND.draw(); else if (isCpu() && ev.winner === CPU) SND.lose(); else SND.win();
      S.vibrate(isCpu() && ev.winner === CPU ? [60, 60, 60] : 120);
    }
    maybeCpu();
  }

  function maybeCpu() {
    clearTimeout(cpuTimer);
    if (!pos.over && isCpu() && pos.toPlay === CPU && !A.busy()) { cpuBusy = true; status(); cpuTimer = setTimeout(cpuTurn, CFG.cpuDelayMs); }
  }
  function cpuTurn() {
    if (pos.over || pos.toPlay !== CPU) { cpuBusy = false; return; }
    const t = OrbAI.choose(pos, saved.mode);
    if (!t) { cpuBusy = false; return; }
    const my = gen;
    if (!t.mv) { commit(t); return; }
    slide(t.mv, () => { cpuTimer = setTimeout(() => { if (my === gen) { mv = null; commit(t); } }, CFG.cpuStepMs); });
  }
  /** Show a rival marble pushed one square (pending until the place). */
  function slide(m, after) {
    const color = pos.b[m[0]]; mv = m.slice(); sel = -1; SND.slide();
    const my = gen;
    RD.set({ b: shown(), sel: -1, targets: [], moved: -1, last: -1 });
    A.run(CFG.slideMs, (u) => RD.setAnim({ kind: 'slide', a: m[0], b: m[1], color, t: u }), () => { if (my !== gen) return; RD.setAnim(null); refresh(); if (after) after(); });
  }

  /** Human tap on square c. */
  function tap(c) {
    if (c < 0 || !humanTurn()) return false;
    const b = shown(), me = pos.toPlay, opp = 3 - me;
    flash = '';
    if (sel >= 0) {
      if (R.moveTargets(b, sel).indexOf(c) >= 0) { slide([sel, c]); return true; }
      if (c === sel || b[c] === 0) { sel = -1; refresh(); return false; }   // cancel the pick
    }
    if (b[c] === 0) return commit({ mv, place: c });
    if (b[c] === opp) {
      if (mv) { flash = 'You can push only one ' + NAMES[opp].toLowerCase() + ' marble a turn (Undo to change it)'; SND.deny(); refresh(); return false; }
      if (!R.moveTargets(b, c).length) { flash = 'That marble has no empty hole next to it'; SND.deny(); sel = -1; refresh(); return false; }
      sel = c; refresh(); return true;
    }
    flash = "That's your own marble: tap an empty hole to place, or a " + NAMES[opp].toLowerCase() + ' one to push it'; SND.deny(); sel = -1; refresh();
    return false;
  }

  function popTurn() { tally(-1); pos = history.pop(); turns.pop(); }
  function undo() {
    if (mv || sel >= 0) { if (!(isCpu() && pos.toPlay === CPU)) { stop(); sel = -1; mv = null; refresh(); return; } }
    if (!turns.length) return;
    stop(); sel = -1; mv = null; flash = '';
    popTurn();
    if (isCpu() && pos.toPlay === CPU && turns.length) popTurn();         // the computer's turn + yours
    saved.game = { turns: turns.slice() }; save();
    refresh(); maybeCpu();
  }

  // ---- input ----
  const cv = $('board');
  RD.init(cv);
  cv.addEventListener('pointerdown', (e) => tap(RD.cellAt(e.clientX, e.clientY)));
  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'SELECT') return;
    if (e.key === 'u' || e.key === 'Backspace') undo();
    else if (e.key === 'n') newGame();
    else if (e.key === 'Escape') { if (!$('help').hidden) $('help').hidden = true; else if (sel >= 0) { sel = -1; refresh(); } }
  });
  $('newBtn').onclick = () => newGame();
  $('undoBtn').onclick = undo;
  $('clearBtn').onclick = () => { saved.score = { 1: 0, 2: 0, d: 0 }; save(); status(); };
  $('modeSel').onchange = (e) => { saved.mode = e.target.value; save(); newGame(); };
  $('helpBtn').onclick = () => { $('help').hidden = false; };
  $('helpClose').onclick = () => { $('help').hidden = true; };
  $('help').addEventListener('pointerdown', (e) => { if (e.target === $('help')) $('help').hidden = true; });

  // ---- theme + layout ----
  function applyTheme() { document.documentElement.classList.toggle('dark', S.isDark()); RD.draw(); }
  S.onChange((ch) => { if ('theme' in ch) applyTheme(); });
  if (window.matchMedia) { const mq = matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', applyTheme); }
  const wrap = $('boardWrap');
  const fit = () => RD.resize(wrap);
  window.addEventListener('resize', fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(wrap);

  const gear = S.mountGear($('gearSlot'));
  if (!gear) $('gearSlot').remove();

  applyTheme(); restore(); fit();
  // for tests
  window.OBGame = {
    tapSq: tap, tap: (x, y) => tap(y * 4 + x), undo, newGame, busy, commit,
    finishAnim: () => A.finish(),
    setMode: (m) => { saved.mode = m; save(); newGame(); },
    state: () => ({ board: Array.from(pos.b), shown: shown(), toPlay: pos.toPlay, left: { 1: pos.left[1], 2: pos.left[2] }, over: pos.over, winner: pos.winner, draw: pos.draw,
      extra: pos.extra, turns: turns.length, sel, mv, mode: saved.mode, score: Object.assign({}, saved.score), status: $('status').textContent }),
  };
})();
