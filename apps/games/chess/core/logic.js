/* Chess controller. Menu, human moves, computer replies, undo, hints, and the side panel. */
(function (root) {
  const Chess = root.Chess = root.Chess || {};
  const R = function () { return Chess.rules; };
  const GLYPH = { 1: '♙', 2: '♘', 3: '♗', 4: '♖', 5: '♕', '-1': '♟', '-2': '♞', '-3': '♝', '-4': '♜', '-5': '♛' };
  let st, hist, sans, humanWhite, level, draftWhite, draftLevel;
  let playing = false, ended = null, busy = false, token = 0, hintToken = 0;
  let selected = -1, hint = null, drag = null, pending = null;
  let cursor = 12, showCursor = false, lastError = null, animOn = true, skipAnim = false;

  function $(id) { return document.getElementById(id); }
  function prefs() {
    try { return JSON.parse(localStorage.getItem('chess-prefs') || 'null'); } catch (e) { return null; }
  }
  function savePrefs() {
    try { localStorage.setItem('chess-prefs', JSON.stringify({ human: humanWhite ? 'white' : 'black', level: level, anim: animOn })); }
    catch (e) { /* private mode */ }
  }
  function humanTurn() { return st.wtm === humanWhite; }
  function own(sq) { const p = st.b[sq]; return !!p && (humanWhite ? p > 0 : p < 0); }
  function hasHumanMove() { return hist.some(function (m) { return (m.p > 0) === humanWhite; }); }

  function view() {
    const chk = playing && R().inCheck(st);
    const targets = [];
    if (selected >= 0 && playing && !busy && !ended && humanTurn()) {
      R().legalMoves(st).forEach(function (m) {
        if (m.f === selected && targets.indexOf(m.t) < 0) targets.push(m.t);
      });
    }
    return {
      board: st.b, flip: humanWhite === false && (playing || ended),
      last: hist.length ? hist[hist.length - 1] : null,
      selected: selected, targets: targets,
      checkSq: chk ? R().kingSq(st, st.wtm) : -1,
      hint: hint, drag: drag, cursor: showCursor ? cursor : -1,
      anim: Chess.anim.frame(),
    };
  }
  function draw() { Chess.render.draw(view()); }

  function setStatus(text, check, thinking) {
    const el = $('status');
    el.textContent = text;
    el.classList.toggle('check', !!check);
    el.classList.toggle('thinking', !!thinking);
  }
  function statusLine() {
    if (!playing) return setStatus('Choose a side to start');
    if (ended) return setStatus(describe(ended).title);
    const chk = R().inCheck(st);
    if (busy) return setStatus(chk ? 'Check — computer is thinking…' : 'Computer is thinking…', chk, true);
    if (!humanTurn()) return setStatus('Computer to move', chk, false);
    setStatus(chk ? 'Check — your move' : 'Your move', chk, false);
  }
  function describe(res) {
    if (!res) return { title: '', detail: '' };
    if (res.type === 'mate') {
      const you = (res.winner === 'white') === humanWhite;
      return { title: you ? 'Checkmate — you win' : 'Checkmate — computer wins', detail: you ? 'Nice. The king has nowhere to go.' : 'The king is trapped. Undo if you want another look.' };
    }
    if (res.type === 'stalemate') return { title: 'Stalemate — draw', detail: 'No legal move, and the king is not in check.' };
    if (res.type === 'rep') return { title: 'Draw — threefold repetition', detail: 'The same position appeared three times.' };
    if (res.type === '50') return { title: 'Draw — fifty-move rule', detail: 'Fifty moves without a pawn move or a capture.' };
    return { title: 'Draw — insufficient material', detail: 'Neither side has enough pieces to force checkmate.' };
  }
  function glyphs(list) {
    return list.slice().sort(function (a, b) { return Math.abs(b) - Math.abs(a); }).map(function (p) { return GLYPH[p] || ''; }).join('') || '–';
  }
  let panelKey = '';
  function sidePanel() {
    const mine = [], opp = [];
    hist.forEach(function (m) {
      if (!m.c) return;
      if ((m.p > 0) === humanWhite) mine.push(m.c); else opp.push(m.c);
    });
    const key = (humanWhite ? 'w' : 'b') + glyphs(mine) + '/' + glyphs(opp) + '|' + sans.join(' ');
    if (key === panelKey) return;
    panelKey = key;
    $('cap-you').textContent = glyphs(mine);
    $('cap-ai').textContent = glyphs(opp);
    const el = $('moves');
    if (!sans.length) { el.innerHTML = '<p class="empty">Moves will show up here.</p>'; return; }
    let html = '';
    for (let i = 0; i < sans.length; i += 2) {
      const a = i === sans.length - 1 ? ' class="now"' : '';
      const b = i + 1 === sans.length - 1 ? ' class="now"' : '';
      html += '<div class="ply"><i>' + (i / 2 + 1) + '.</i><b' + a + '>' + sans[i] + '</b><b' + b + '>' + (sans[i + 1] || '') + '</b></div>';
    }
    el.innerHTML = html;
    el.scrollTop = el.scrollHeight;
  }
  function buttons() {
    $('btn-undo').disabled = !playing || !hasHumanMove();
    const hintBtn = $('btn-hint');
    hintBtn.hidden = !(playing && level === 'beginner');
    hintBtn.disabled = busy || !!ended || !humanTurn();
  }
  function layout() {
    Chess.render.resize();
    if (pending) Chess.render.placePromo($('promo'), pending[0].t);
    draw();
  }
  function refresh() {
    statusLine(); sidePanel(); buttons(); layout();
  }
  function syncDraft() {
    document.querySelectorAll('#color-choices button').forEach(function (b) {
      b.classList.toggle('on', (b.dataset.color === 'white') === draftWhite);
    });
    document.querySelectorAll('#level-choices button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.level === draftLevel);
    });
    $('ov-help').textContent = Chess.config.help[draftLevel] || '';
  }
  function showSetup(mode) {
    const over = mode === 'over', mid = mode === 'mid';
    $('overlay').hidden = false;
    $('ov-setup').hidden = false;
    const text = over ? describe(ended) : null;
    $('ov-title').textContent = over ? text.title : (mid ? 'New game' : 'Chess');
    $('ov-msg').textContent = over ? text.detail : (mid ? 'Start over, or go back to the board.' : 'Play the computer. Two levels, for learning the game.');
    $('btn-start').textContent = over || mid ? 'Play again' : 'Start';
    if (!over && !mid) $('btn-start').textContent = 'Start';
    $('btn-back').hidden = !mid;
    $('btn-undo-over').hidden = !over;
    draftWhite = humanWhite; draftLevel = level; syncDraft();
  }
  function hideOverlay() { $('overlay').hidden = true; }
  function closePromo() { pending = null; $('promo').hidden = true; }
  function openPromo(moves) {
    pending = moves;
    const el = $('promo');
    el.hidden = false;
    Chess.render.placePromo(el, moves[0].t);
    const sign = moves[0].p > 0 ? 1 : -1;
    el.querySelectorAll('button').forEach(function (b) {
      Chess.render.paintButton(b.querySelector('canvas'), sign * (+b.dataset.promo));
    });
  }

  function apply(m) {
    const text = R().san(st, m, R().legalMoves(st));
    R().make(st, m);
    hist.push(m); sans.push(text);
    if (animOn && !skipAnim) Chess.anim.start(m); else Chess.anim.finish();
    skipAnim = false;
    selected = -1; hint = null; drag = null; closePromo();
    ended = R().result(st);
    refresh();
    if (ended) showSetup('over');
    else if (playing && !humanTurn()) think();
  }
  async function think() {
    const my = ++token;
    busy = true; selected = -1; hint = null;
    refresh();
    let m = null;
    try { m = await Chess.ai.think(st, level, function () { return token !== my; }); }
    catch (e) { lastError = e; m = null; }
    if (token !== my) return;
    if (m && Chess.anim.active()) { await Chess.anim.done(); if (token !== my) return; }
    busy = false;
    if (!m) { refresh(); return; }
    apply(m);
  }
  function syncAnim() {
    const b = $('btn-anim');
    b.textContent = 'Animation: ' + (animOn ? 'On' : 'Off');
    b.classList.toggle('on', animOn);
    b.setAttribute('aria-pressed', animOn ? 'true' : 'false');
  }
  function toggleAnim() {
    animOn = !animOn;
    if (!animOn) Chess.anim.finish();
    syncAnim(); savePrefs();
  }
  function begin(fen) {
    Chess.anim.finish();
    token++; hintToken++; busy = false;
    st = R().parseFen(fen || R().START);
    hist = []; sans = []; selected = -1; hint = null; drag = null; closePromo();
    ended = R().result(st); playing = true; showCursor = false;
    cursor = humanWhite ? 12 : 52;
    savePrefs();
    if (ended) { refresh(); showSetup('over'); return; }
    hideOverlay(); refresh();
    if (!humanTurn()) think();
  }
  function tryMove(from, to, promo) {
    if (!playing || busy || ended || !humanTurn()) return false;
    hintToken++;
    const moves = R().legalMoves(st).filter(function (m) { return m.f === from && m.t === to; });
    if (!moves.length) return false;
    if (moves.length > 1) {
      if (!promo) { openPromo(moves); refresh(); return 'promo'; }
      const m = moves.find(function (x) { return x.pr === promo; });
      if (!m) return false;
      apply(m); return true;
    }
    apply(moves[0]); return true;
  }
  function tap(sq) {
    Chess.anim.finish(); skipAnim = false;
    if (pending) { closePromo(); refresh(); return; }
    if (!playing || busy || ended || !humanTurn()) return;
    showCursor = false;
    if (sq === selected) { selected = -1; hint = null; refresh(); return; }
    if (selected >= 0 && sq >= 0) {
      const hit = R().legalMoves(st).some(function (m) { return m.f === selected && m.t === sq; });
      if (hit) { tryMove(selected, sq, 0); return; }
    }
    selected = sq >= 0 && own(sq) ? sq : -1;
    hint = null; refresh();
  }
  function dragStart(sq) {
    Chess.anim.finish();
    if (pending || !playing || busy || ended || !humanTurn() || !own(sq)) return;
    selected = sq; hint = null; showCursor = false;
    drag = { piece: st.b[sq], x: 0, y: 0 };
    refresh();
  }
  function dragMove(x, y) {
    if (!drag) return;
    const rect = $('board').getBoundingClientRect();
    drag.x = x - rect.left; drag.y = y - rect.top; draw();
  }
  function drop(sq) {
    if (!drag) return;
    const from = selected;
    drag = null;
    if (pending) { closePromo(); refresh(); return; }
    skipAnim = true;
    if (from >= 0 && sq >= 0 && sq !== from && tryMove(from, sq, 0)) return;
    skipAnim = false;
    refresh();
  }
  function undo() {
    Chess.anim.finish();
    token++; hintToken++; busy = false; closePromo(); drag = null;
    if (!hasHumanMove()) { refresh(); return; }
    while (hist.length) {
      const m = hist.pop(); sans.pop();
      const mine = (m.p > 0) === humanWhite;
      R().unmake(st, m);
      if (mine) break;
    }
    ended = null; selected = -1; hint = null; playing = true;
    hideOverlay(); refresh();
  }
  function onKey(e) {
    Chess.anim.finish();
    const k = e.key;
    if ((k === 'z' || k === 'Z') && (e.metaKey || e.ctrlKey)) { undo(); return; }
    if (k === 'Escape') {
      if (pending) { closePromo(); refresh(); return; }
      if (!$('overlay').hidden && playing && !ended) { hideOverlay(); refresh(); return; }
      selected = -1; hint = null; refresh(); return;
    }
    if (pending) {
      const map = { q: 5, r: 4, b: 3, n: 2, '1': 5, '2': 4, '3': 3, '4': 2 };
      const t = map[k.toLowerCase()];
      if (t) onPromo(t);
      return;
    }
    if (k === 'u' || k === 'U') { undo(); return; }
    if (k === 'h' || k === 'H') { doHint(); return; }
    if (k === 'n' || k === 'N') { showSetup(playing && !ended ? 'mid' : (ended ? 'over' : 'fresh')); return; }
    if (!playing || busy || ended || !$('overlay').hidden) return;
    const dir = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (dir[k]) {
      const s = Chess.render.screenOf(cursor);
      const col = Math.max(0, Math.min(7, s.col + dir[k][0]));
      const row = Math.max(0, Math.min(7, s.row + dir[k][1]));
      const file = humanWhite ? col : 7 - col;
      const rank = humanWhite ? 7 - row : row;
      cursor = rank * 8 + file;
      showCursor = true; refresh(); return;
    }
    if (k === 'Enter' || k === ' ') { showCursor = true; tap(cursor); }
  }
  function onPromo(type) {
    if (!pending) return;
    const sign = pending[0].p > 0 ? 1 : -1;
    tryMove(pending[0].f, pending[0].t, sign * type);
  }
  async function doHint() {
    if (level !== 'beginner' || !playing || busy || ended || !humanTurn() || !$('overlay').hidden) return;
    const my = ++hintToken;
    setStatus('Looking for a hint…', false, true);
    const m = await Chess.ai.think(st, 'hint', function () { return hintToken !== my; });
    if (!m || hintToken !== my || busy || ended) { refresh(); return; }
    hint = m; selected = m.f; refresh();
  }
  function boot() {
    const saved = prefs();
    humanWhite = !saved || saved.human !== 'black';
    level = saved && saved.level === 'medium' ? 'medium' : 'beginner';
    animOn = !saved || saved.anim !== false;
    draftWhite = humanWhite; draftLevel = level;
    st = R().parseFen(R().START); hist = []; sans = [];
    Chess.render.bind($('board'));
    Chess.anim.onFrame(draw);
    syncAnim();
    Chess.input.attach({
      tap: tap, dragStart: dragStart, drag: dragMove, drop: drop, key: onKey,
      undo: undo, hint: doHint, promo: onPromo, toggleAnim: toggleAnim,
      menu: function () {
        Chess.anim.finish();
        token++; hintToken++; busy = false; closePromo(); drag = null;
        showSetup(playing && !ended ? 'mid' : (ended ? 'over' : 'fresh'));
        refresh();
      },
      start: function () { humanWhite = draftWhite; level = draftLevel; begin(R().START); },
      back: function () { if (playing && !ended) { hideOverlay(); if (!humanTurn()) think(); else refresh(); } },
      draft: function (d) {
        if (d.human) draftWhite = d.human !== 'black';
        if (d.level) draftLevel = d.level;
        syncDraft();
      },
    });
    window.addEventListener('resize', layout);
    if (window.ResizeObserver) new ResizeObserver(function () { layout(); }).observe($('board-wrap'));
    syncDraft(); showSetup('fresh'); refresh();
    requestAnimationFrame(layout);
  }

  Chess.game = {
    start: function (opts) {
      opts = opts || {};
      if (opts.human) humanWhite = opts.human !== 'black';
      if (opts.level) level = opts.level;
      draftWhite = humanWhite; draftLevel = level; syncDraft();
      begin(opts.fen || R().START);
    },
    playUci: function (uci) {
      const f = R().sqIndex(uci.slice(0, 2)), t = R().sqIndex(uci.slice(2, 4));
      let pr = 0;
      if (uci[4]) pr = (st.wtm ? 1 : -1) * ({ q: 5, r: 4, b: 3, n: 2 }[uci[4].toLowerCase()] || 0);
      return tryMove(f, t, pr);
    },
    undo: undo, hint: doHint,
    idle: function () {
      return new Promise(function (resolve) {
        (function poll() { if (!busy) resolve(); else setTimeout(poll, 16); })();
      });
    },
    fen: function () { return R().toFen(st); },
    outcome: function () { return ended; },
    moves: function () { return sans.slice(); },
    state: function () { return st; },
    humanTurn: humanTurn,
    tap: tap,
    animating: function () { return Chess.anim.active(); },
    animOn: function () { return animOn; },
    lastError: function () { return lastError; },
  };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
