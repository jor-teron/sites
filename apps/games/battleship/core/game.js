/*
 * Battleship — game controller (SHIP-2c). Wires rules, AI, renderer, sound, settings and the page.
 * Flow: place ships (drag or tap; Rotate; Random; Ready) → take turns firing → first to sink the
 * whole enemy fleet wins. Classic: one shot each turn. Salvo: one shot per ship still afloat at
 * the start of the volley. Fleet is classic 5-4-3-3-2 or a smaller skirmish 4-3-2. An optional
 * house rule forbids ships from touching, even at a corner.
 * Dragging lifts a ship off the board and shows a ghost on mouse and touch. A tap near the edge
 * no longer slides the ship — if it would hang off, the drop is refused.
 * vs CPU: you are Player 1 and fire first; the computer hides its fleet at random.
 * 2 players: one device. Between turns a full-screen cover hides both grids.
 * Cannon arcs, splash, explosions, fire, a radar sweep and a win card come from ui/fx.js.
 * Saves wins, mode, rules, career stats and the game in progress (BS_CONFIG.storeKey).
 * New game and a rules change ask first if a match is under way. Arrow keys move a cursor on
 * the big grid; Enter or Space fires or places. The status line is aria-live.
 */
(() => {
  const R = BSRules, AI = BSAI, CFG = BS_CONFIG, S = BS_SETTINGS, ST = BSStats, N = R.N;
  const $ = (id) => document.getElementById(id);
  const other = (p) => 3 - p;

  function load() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(CFG.storeKey)); } catch (_) {}
    return ST.loadState(raw, CFG.difficultyToLevel, S.get('difficulty'));
  }
  const saved = load();
  const save = () => { try { localStorage.setItem(CFG.storeKey, JSON.stringify(saved)); } catch (_) {} };

  let g, sel = 0, orient = 'h', hover = -1, flash = '', cpuTimer = 0, drag = null, fxLock = false, fxGen = 0, sinking = { 1: [], 2: [] };
  let cursor = 0, kbOn = false, pending = null;
  const isCpu = () => saved.mode !== '2p';
  const tally = () => saved.score[isCpu() ? 'cpu' : 'pvp'];
  const who = (p) => (isCpu() ? (p === 1 ? 'You' : 'Computer') : CFG.names[p]);
  const viewer = () => (isCpu() ? 1 : g.phase === 'place' ? g.placer : g.phase === 'over' ? g.winner : g.turn);
  const canFire = () => g.phase === 'battle' && !g.cover && !g.shotDone && !fxLock && !(isCpu() && g.turn === 2);
  const playModeOf = () => g.playMode || saved.playMode || 'classic';
  const volleySize = (p) => (playModeOf() === 'salvo' ? R.salvoShots(g.b[p]) : 1);
  const startVolley = (p) => { g.volley = volleySize(p); g.volleyLeft = g.volley; };
  const dirty = () => {
    if (!g || g.phase === 'over') return false;
    if (g.phase === 'battle') return true;
    return g.b[1].ships.some((s) => s.x >= 0) || g.b[2].ships.some((s) => s.x >= 0);
  };

  function fresh() {
    const fleet = saved.fleet || 'classic', noTouch = !!saved.noTouch, playMode = saved.playMode || 'classic';
    const b = { 1: R.newBoard(fleet, noTouch), 2: R.newBoard(fleet, noTouch) };
    if (isCpu()) R.randomFleet(b[2]);
    return { b, phase: 'place', placer: 1, turn: 1, winner: 0, stats: { 1: { s: 0, h: 0 }, 2: { s: 0, h: 0 } },
      note: { 1: '', 2: '' }, last: { 1: -1, 2: -1 }, shotDone: false, cover: null,
      playMode, fleet, noTouch, volley: 1, volleyLeft: 1 };
  }
  function persist() {
    saved.game = Object.assign({}, g, { b: { 1: R.serialize(g.b[1]), 2: R.serialize(g.b[2]) } });
    save();
  }
  function applyNewGame() {
    clearTimeout(cpuTimer);
    if (drag) cancelDrag(false);
    fxGen++; fxLock = false; sinking = { 1: [], 2: [] };
    if (window.BSFx) BSFx.drop();
    const end = $('endCard'); if (end) end.hidden = true;
    hideConfirm();
    g = fresh(); sel = 0; orient = 'h'; hover = -1; flash = ''; cursor = 0;
    persist(); refresh(); fit();
  }
  function newGame() { applyNewGame(); }
  function requestNewGame() {
    if (!dirty()) { applyNewGame(); return; }
    askConfirm('Start a new game? The current match will be lost.', () => applyNewGame());
  }
  function restore() {
    const o = saved.game;
    try {
      if (o && o.b && o.stats && ['place', 'battle', 'over'].indexOf(o.phase) >= 0) {
        const fleet = o.fleet || saved.fleet || 'classic';
        g = Object.assign(fresh(), o, { b: { 1: R.deserialize(o.b[1], fleet), 2: R.deserialize(o.b[2], fleet) } });
        if (g.playMode !== 'salvo') g.playMode = 'classic';
        if (g.fleet !== 'skirmish') g.fleet = R.fleetIdOf(g.b[1].ships) || fleet;
        g.noTouch = !!(g.b[1] && g.b[1].noTouch);
        if (g.volleyLeft == null || g.volley == null) startVolley(g.turn);
        if (isCpu() && !R.allPlaced(g.b[2])) R.randomFleet(g.b[2]);
        sel = g.phase === 'place' ? nextUnplaced(-1) : -1; flash = '';
        if (!isCpu() && g.phase !== 'over') {
          if (g.shotDone) { g.shotDone = false; g.turn = other(g.turn); startVolley(g.turn); }
          if (!g.cover) g.cover = { p: g.phase === 'place' ? g.placer : g.turn, place: g.phase === 'place' };
        }
        refresh(); maybeCpu(); return;
      }
    } catch (_) { /* bad save: start fresh */ }
    applyNewGame();
  }

  // ---- drawing ----
  const big = BSRender.view($('big'), $('bigWrap')), mini = BSRender.view($('mini'), $('miniWrap'));

  /** Bow cell for a ship given a pointer cell and a grab offset. No sliding. */
  function bowAt(c, grabX, grabY) {
    return { x: (c % N) - grabX, y: Math.floor(c / N) - grabY };
  }
  function ghost() {
    if (g.phase !== 'place' || sel < 0 || hover < 0) return null;
    const b = g.b[g.placer], sh = b.ships[sel];
    const grabX = drag ? drag.grabX : 0, grabY = drag ? drag.grabY : 0;
    const bow = bowAt(hover, grabX, grabY);
    const ship = { name: sh.name, size: sh.size, x: bow.x, y: bow.y, o: orient };
    const ok = R.fits(b, sel, bow.x, bow.y, orient);
    return { ship, ok, cells: ok || (bow.x >= 0 && bow.y >= 0) ? R.cellsOf(sh.size, Math.max(0, bow.x), Math.max(0, bow.y), orient) : [] };
  }
  function refresh() {
    const v = viewer(), placing = g.phase === 'place';
    $('app').classList.toggle('placing', placing);
    const cur = kbOn && !g.cover && (placing || canFire() || fxLock) ? cursor : -1;
    if (placing) {
      big.set({ id: 'big', board: g.b[g.placer], showShips: true, sel, ghost: ghost(), last: -1, dim: false, sinking: [], pulse: false, cursor: cur });
      $('bigCap').textContent = isCpu() ? 'Your fleet' : CFG.names[g.placer] + "'s fleet";
    } else {
      const over = g.phase === 'over';
      big.set({ id: 'big', board: g.b[other(v)], showShips: over, sel: -1, ghost: null, last: g.last[v], dim: !over && !canFire() && !fxLock, sinking: sinking[other(v)], pulse: window.BSFx && !BSFx.off(), cursor: over ? -1 : cur });
      mini.set({ id: 'mini', board: g.b[v], showShips: true, sel: -1, ghost: null, last: g.last[other(v)], dim: false, sinking: sinking[v], pulse: window.BSFx && !BSFx.off(), cursor: -1 });
      $('bigCap').textContent = over ? who(other(v)) + "'s fleet" : (isCpu() ? 'Enemy waters' : CFG.names[other(v)] + "'s waters");
      $('miniCap').textContent = (isCpu() ? 'Your' : CFG.names[v] + "'s") + ' fleet';
    }
    tray(); fleets(); status(); cover(); ambient(); liveGrid();
  }
  function liveGrid() {
    const el = $('big'); if (!el) return;
    const lab = R.label(cursor);
    el.setAttribute('aria-label', g.phase === 'place' ? 'Your fleet grid, cursor ' + lab : 'Enemy waters, cursor ' + lab);
  }
  function tray() {
    const el = $('tray');
    if (g.phase !== 'place') { el.textContent = ''; return; }
    const b = g.b[g.placer];
    el.textContent = '';
    b.ships.forEach((sh, i) => {
      const bt = document.createElement('button');
      const held = drag && drag.i === i;
      bt.className = (i === sel ? 'on ' : '') + (sh.x >= 0 && !held ? 'done' : '') + (held ? 'held' : '');
      const cv = document.createElement('canvas');
      cv.width = 72; cv.height = 18; cv.setAttribute('aria-hidden', 'true');
      BSRender.thumb(cv, sh.name, sh.size, 'h', false);
      bt.appendChild(cv);
      bt.appendChild(document.createTextNode(sh.name + ' ' + sh.size));
      bt.addEventListener('click', (e) => {
        if (drag) return;
        sel = i; if (sh.x >= 0) orient = sh.o; flash = ''; refresh();
        e.stopPropagation();
      });
      el.appendChild(bt);
    });
  }
  function fleetList(el, board, hide) {
    el.textContent = '';
    if (hide) return;
    board.ships.forEach((sh, j) => {
      const li = document.createElement('li');
      const sunk = R.isSunk(board, j);
      li.className = sunk ? 'sunk' : 'afloat';
      const cv = document.createElement('canvas');
      cv.width = 40; cv.height = 12; cv.setAttribute('aria-hidden', 'true');
      BSRender.thumb(cv, sh.name, sh.size, 'h', sunk);
      li.appendChild(cv);
      li.appendChild(document.createTextNode(sunk ? sh.name + ' sunk' : sh.name));
      el.appendChild(li);
    });
  }
  function fleets() {
    const v = viewer(), placing = g.phase === 'place';
    fleetList($('fleetBig'), placing ? g.b[g.placer] : g.b[other(v)], placing);
    fleetList($('fleetMini'), placing ? g.b[g.placer] : g.b[v], placing);
  }
  function wounded(board) {
    const out = [];
    board.ships.forEach((sh, j) => {
      if (R.isSunk(board, j)) return;
      R.cells(sh).forEach((c) => { if (board.shots[c] === 2) out.push(c); });
    });
    return out;
  }
  function ambient() {
    if (!window.BSFx) return;
    const v = viewer(), placing = g.phase === 'place', over = g.phase === 'over';
    if (placing || g.cover) { BSFx.setAmbient('big', { radarOn: false, fireCells: [], last: -1 }); BSFx.setAmbient('mini', { radarOn: false, fireCells: [], last: -1 }); return; }
    BSFx.setAmbient('big', { radarOn: !over, fireCells: wounded(g.b[other(v)]), last: g.last[v] });
    BSFx.setAmbient('mini', { radarOn: false, fireCells: wounded(g.b[v]), last: g.last[other(v)] });
  }
  const acc = (st) => (st.s ? Math.round((100 * st.h) / st.s) : 0);
  function status() {
    const v = viewer(), pre = isCpu() ? '' : CFG.names[v] + ': ';
    let t;
    if (g.phase === 'over') {
      const st = g.stats[g.winner];
      t = (isCpu() ? (g.winner === 1 ? 'You win!' : 'The computer wins!') : CFG.names[g.winner] + ' wins!') + ' ' + st.s + ' shots, ' + acc(st) + '% hits';
    } else if (flash) t = flash;
    else if (g.phase === 'place') {
      const b = g.b[g.placer], down = b.ships.filter((s) => s.x >= 0).length;
      if (drag) t = pre + 'drop the ' + b.ships[sel].name + ' on a square';
      else if (sel >= 0) t = pre + 'drag or tap a square for the ' + b.ships[sel].name + ' (' + b.ships[sel].size + ')';
      else t = R.allPlaced(b) ? pre + 'all ships placed – press Ready' : pre + 'pick a ship, then drag it onto the grid';
      const rule = (g.noTouch || saved.noTouch) ? 'Ships may not touch, even at a corner.' : 'Ships can touch but not overlap.';
      if (!flash && !drag) $('note').textContent = down + ' of ' + b.ships.length + ' placed. ' + rule;
    } else if (isCpu() && g.turn === 2) t = 'Computer is aiming…';
    else if (g.shotDone) t = 'Press Pass device and hand it to ' + CFG.names[other(g.turn)];
    else {
      t = (isCpu() ? 'Your turn' : CFG.names[g.turn] + "'s turn") + ': tap a square on the big grid to fire';
      if (playModeOf() === 'salvo' && g.volley) t += ' – shot ' + (g.volley - (g.volleyLeft || 1) + 1) + ' of ' + g.volley;
    }
    $('status').textContent = t.charAt(0).toUpperCase() + t.slice(1);
    if (g.phase !== 'place') $('note').textContent = [g.note[1], g.note[2]].filter(Boolean).join(' · ');
    const placing = g.phase === 'place';
    for (const p of [1, 2]) {
      const st = g.stats[p];
      $('lbl' + p).textContent = isCpu() ? who(p) : 'P' + p;
      if (placing) {
        if (p === (isCpu() ? 1 : g.placer)) $('st' + p).textContent = g.b[p].ships.filter((s) => s.x >= 0).length + ' of ' + g.b[p].ships.length + ' placed';
        else $('st' + p).textContent = isCpu() ? 'waiting' : 'not placed yet';
      } else {
        $('st' + p).textContent = st.s + (st.s === 1 ? ' shot · ' : ' shots · ') + acc(st) + '% hit';
      }
      $('wl' + p).textContent = isCpu() ? who(p) : 'P' + p;
      $('win' + p).textContent = tally()[p];
    }
    syncSelects();
    for (const id of ['rotBtn', 'randBtn', 'readyBtn']) $(id).hidden = !placing;
    $('readyBtn').disabled = !R.allPlaced(g.b[g.placer]);
    $('rotBtn').textContent = 'Rotate ↻ ' + (orient === 'h' ? 'across' : 'down');
    $('passBtn').hidden = isCpu() || g.phase !== 'battle';
    $('passBtn').disabled = !g.shotDone;
  }
  function syncSelects() {
    if ($('modeSel')) $('modeSel').value = saved.mode;
    if ($('playSel')) $('playSel').value = saved.playMode || 'classic';
    if ($('fleetSel')) $('fleetSel').value = saved.fleet || 'classic';
    if ($('touchChk')) $('touchChk').checked = !!saved.noTouch;
  }
  function cover() {
    const c = g.cover;
    $('cover').hidden = !c;
    if (!c) return;
    $('coverTitle').textContent = CFG.names[c.p] + (c.place ? ': place your ships' : "'s turn");
    $('coverMsg').textContent = 'Pass the device to ' + CFG.names[c.p] + '. ' + CFG.names[other(c.p)] + ', no peeking!' +
      (!c.place && g.note[other(c.p)] ? ' Last shot: ' + g.note[other(c.p)] + '.' : '');
    $('coverBtn').textContent = "I'm " + CFG.names[c.p] + ' – show my grids';
  }

  // ---- confirm + stats ----
  function hideConfirm() { const el = $('confirmDlg'); if (el) el.hidden = true; pending = null; }
  function askConfirm(msg, yes) {
    pending = yes;
    $('confirmMsg').textContent = msg;
    $('confirmDlg').hidden = false;
  }
  function changeOption(key, value) {
    if (saved[key] === value) return;
    const apply = () => { saved[key] = value; save(); applyNewGame(); };
    if (!dirty()) apply();
    else askConfirm('Change the rules and start a new game? The current match will be lost.', apply);
    syncSelects();
  }
  function fmtRow(row) {
    if (!row || !row.games) return '—';
    const avg = ST.avgShots(row);
    const accP = Math.round(ST.accuracy(row) * 100);
    const winP = Math.round((100 * row.wins) / row.games);
    return row.games + ' games, ' + row.wins + ' wins (' + winP + '%), avg shots ' + (row.wins ? avg.toFixed(1) : '—') + ', ' + accP + '% hits, streak ' + row.streak + ' (best ' + row.best + ')';
  }
  function showStats() {
    const el = $('statsBody'); if (!el) return;
    el.textContent = '';
    const add = (label, text) => {
      const p = document.createElement('p');
      const b = document.createElement('b'); b.textContent = label; p.appendChild(b);
      p.appendChild(document.createTextNode(' ' + text));
      el.appendChild(p);
    };
    add('Overall', fmtRow(saved.career.all));
    const chips = 'You ' + saved.score.cpu[1] + '–' + saved.score.cpu[2] + ' vs CPU,  P1 ' + saved.score.pvp[1] + '–' + saved.score.pvp[2] + ' in 2-player (includes games from before detailed stats).';
    const note = document.createElement('p'); note.className = 'stats-note'; note.textContent = chips; el.appendChild(note);
    const rows = ST.rowsForView(saved.career);
    if (rows.length) {
      const table = document.createElement('table');
      table.className = 'stats-table';
      const head = document.createElement('tr');
      ['Mode', 'Level', 'Games', 'Wins', 'Avg shots', 'Accuracy', 'Streak'].forEach((h) => { const th = document.createElement('th'); th.textContent = h; head.appendChild(th); });
      table.appendChild(head);
      const levelName = { easy: 'Easy', medium: 'Medium', hard: 'Hard', '2p': '2 players' };
      rows.forEach((r) => {
        const tr = document.createElement('tr');
        const avg = r.row.wins ? ST.avgShots(r.row).toFixed(1) : '—';
        const accP = Math.round(ST.accuracy(r.row) * 100) + '%';
        [r.playMode === 'salvo' ? 'Salvo' : 'Classic', levelName[r.level], r.row.games, r.row.wins, avg, accP, r.row.streak + ' / ' + r.row.best]
          .forEach((v) => { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); });
        table.appendChild(tr);
      });
      el.appendChild(table);
    } else {
      const p = document.createElement('p'); p.textContent = 'Play a game to start a detailed record, broken down by Classic or Salvo and by level.'; el.appendChild(p);
    }
    $('statsDlg').hidden = false;
  }

  // ---- placing (exact bow, no silent slide) ----
  function nextUnplaced(from) {
    const sh = g.b[g.placer].ships;
    for (let k = 1; k <= sh.length; k++) { const i = (from + k + sh.length) % sh.length; if (sh[i].x < 0) return i; }
    return -1;
  }
  function dropAt(c) {
    const b = g.b[g.placer];
    if (sel < 0 || c < 0) return false;
    const grabX = drag ? drag.grabX : 0, grabY = drag ? drag.grabY : 0;
    const bow = bowAt(c, grabX, grabY);
    flash = '';
    if (R.place(b, sel, bow.x, bow.y, orient)) {
      BSSound.place(); sel = nextUnplaced(sel); persist(); return true;
    }
    BSSound.bad();
    flash = "The " + b.ships[sel].name + " doesn't fit there";
    return false;
  }
  function startDrag(i, c, pointerId, onShip) {
    const b = g.b[g.placer], sh = b.ships[i];
    const from = sh.x >= 0 ? { x: sh.x, y: sh.y, o: sh.o } : null;
    const grabX = onShip && from ? (c % N) - sh.x : 0;
    const grabY = onShip && from ? Math.floor(c / N) - sh.y : 0;
    if (from) R.unplace(b, i);
    sel = i; orient = from ? from.o : orient; hover = c;
    drag = { i, from, grabX, grabY, pointerId, startC: c, moved: false };
    try { $('big').setPointerCapture(pointerId); } catch (_) {}
    flash = ''; refresh();
  }
  function cancelDrag(restore) {
    if (!drag) return;
    const b = g.b[g.placer];
    if (restore && drag.from) R.place(b, drag.i, drag.from.x, drag.from.y, drag.from.o);
    drag = null; hover = -1;
  }
  function rotate() {
    if (g.phase !== 'place') return;
    const b = g.b[g.placer], no = orient === 'h' ? 'v' : 'h';
    flash = '';
    if (drag) {
      const tmp = drag.grabX; drag.grabX = drag.grabY; drag.grabY = tmp;
      orient = no; refresh(); return;
    }
    if (sel >= 0 && b.ships[sel].x >= 0) {
      const sh = b.ships[sel];
      if (!R.place(b, sel, sh.x, sh.y, no)) { BSSound.bad(); flash = 'No room to turn the ' + sh.name + ' there'; refresh(); return; }
      BSSound.place(); persist();
    }
    orient = no; refresh();
  }
  function randomize() {
    if (g.phase !== 'place') return;
    cancelDrag(false);
    R.randomFleet(g.b[g.placer]); sel = -1; flash = ''; BSSound.place(); persist(); refresh();
  }
  function ready() {
    if (g.phase !== 'place' || !R.allPlaced(g.b[g.placer])) return;
    flash = '';
    if (isCpu()) { g.phase = 'battle'; g.turn = 1; startVolley(1); }
    else if (g.placer === 1) { g.placer = 2; g.cover = { p: 2, place: true }; sel = 0; orient = 'h'; }
    else { g.phase = 'battle'; g.turn = 1; g.cover = { p: 1 }; startVolley(1); }
    persist(); refresh(); fit();
  }

  // ---- firing ----
  function noteFor(p, c, r) {
    const tb = g.b[other(p)], name = r.ship >= 0 ? tb.ships[r.ship].name : '';
    const youHit = isCpu() && p === 2;
    return who(p) + ' fired at ' + R.label(c) + ': ' + (r.res === 'miss' ? 'miss' : r.res === 'hit' ? 'hit!' :
      'sank ' + (youHit ? 'your ' : isCpu() ? 'the ' : CFG.names[other(p)] + "'s ") + name + '!');
  }
  function applyShot(p, c) {
    const tb = g.b[other(p)], r = R.fire(tb, c);
    if (r.res === 'repeat') return r;
    const st = g.stats[p]; st.s++; if (r.res !== 'miss') st.h++;
    g.last[p] = c; flash = ''; g.note[p] = noteFor(p, c, r);
    const youHit = isCpu() && p === 2;
    if (r.res === 'hit') S.vibrate(youHit ? 40 : 20);
    else if (r.res === 'sunk') S.vibrate([60, 40, 60]);
    return r;
  }
  function endTurn(p) {
    if (isCpu()) {
      if (p === 1) { g.turn = 2; startVolley(2); persist(); refresh(); maybeCpu(); }
      else { g.turn = 1; startVolley(1); persist(); refresh(); }
    } else { g.shotDone = true; persist(); refresh(); }
  }
  async function fireSeq(p, c, viewId) {
    const tb = g.b[other(p)], peek = R.peek(tb, c);
    if (peek.res === 'repeat') return false;
    const my = ++fxGen;
    fxLock = true; refresh();
    const view = viewId === 'mini' ? mini : big;
    const size = view.size();
    const from = viewId === 'mini' ? { x: size / 2, y: -20 } : { x: size / 2, y: size + 16 };
    let applied = null;
    const run = window.BSFx ? BSFx.playShot({
      view: viewId, c, hit: peek.res !== 'miss', sunk: peek.res === 'sunk',
      ship: peek.ship >= 0 ? Object.assign({}, tb.ships[peek.ship]) : null,
      dark: S.isDark(), from, lift: size * 0.28,
      onImpact: () => {
        applied = applyShot(p, c);
        if (applied.res === 'sunk') sinking[other(p)] = [applied.ship];
        refresh();
      }
    }) : Promise.resolve().then(() => { applied = applyShot(p, c); refresh(); });
    await run;
    if (my !== fxGen) return true;
    sinking[other(p)] = [];
    fxLock = false;
    if (applied && applied.win) { finish(p); return true; }
    g.volleyLeft = Math.max(0, (g.volleyLeft || 1) - 1);
    if (g.volleyLeft > 0) {
      persist(); refresh();
      if (isCpu() && p === 2) maybeCpu();
      return true;
    }
    endTurn(p);
    return true;
  }
  function fireAt(c) {
    if (!canFire()) return false;
    const peek = R.peek(g.b[other(g.turn)], c);
    if (peek.res === 'repeat') { BSSound.bad(); flash = 'Already fired at ' + R.label(c) + ' – pick another square'; refresh(); return false; }
    fireSeq(g.turn, c, 'big');
    return true;
  }
  function maybeCpu() {
    clearTimeout(cpuTimer);
    if (!isCpu() || g.phase !== 'battle' || g.turn !== 2 || fxLock) return;
    cpuTimer = setTimeout(() => {
      if (g.phase === 'battle' && g.turn === 2 && !fxLock) fireSeq(2, AI.choose(g.b[1], saved.mode), 'mini');
    }, CFG.cpuDelayMs);
  }
  function pass() {
    if (!g.shotDone || fxLock) return;
    g.shotDone = false; g.turn = other(g.turn); startVolley(g.turn); g.cover = { p: g.turn }; persist(); refresh(); fit();
  }
  function finish(p) {
    g.phase = 'over'; g.winner = p; g.cover = null; g.shotDone = false; tally()[p]++;
    ST.record(saved.career, playModeOf(), saved.mode, { win: p === 1, shots: g.stats[1].s, hits: g.stats[1].h });
    const lose = isCpu() && p === 2;
    if (lose) { BSSound.lose(); S.vibrate(300); } else { BSSound.win(); S.vibrate([80, 40, 80, 40, 160]); }
    persist(); refresh(); fit(); showEnd(p);
  }
  function showEnd(p) {
    const el = $('endCard'); if (!el) return;
    const st = g.stats[p], lose = isCpu() && p === 2;
    $('endTitle').textContent = isCpu() ? (lose ? 'Defeat' : 'Victory') : CFG.names[p] + ' wins';
    $('endMsg').textContent = (isCpu() ? (lose ? 'The computer sank your fleet.' : 'You sank the computer\'s fleet.') : CFG.names[p] + ' sank the other fleet.') +
      ' ' + st.s + ' shots, ' + acc(st) + '% hits.';
    el.hidden = false;
  }

  // ---- input ----
  const bigCv = $('big');
  bigCv.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const c = big.cellAt(e.clientX, e.clientY); if (c < 0) return;
    cursor = c;
    if (g.phase === 'place') {
      const b = g.b[g.placer], j = R.occupancy(b)[c];
      if (j >= 0) startDrag(j, c, e.pointerId, true);
      else if (sel >= 0) startDrag(sel, c, e.pointerId, false);
      else { flash = 'Pick a ship, then drag it onto the grid'; refresh(); }
    } else fireAt(c);
  });
  bigCv.addEventListener('pointermove', (e) => {
    if (g.phase !== 'place') return;
    if (!drag && e.pointerType !== 'mouse') return;
    const c = big.cellAt(e.clientX, e.clientY);
    if (drag && c >= 0 && c !== drag.startC) drag.moved = true;
    if (c !== hover) { hover = c; if (c >= 0) cursor = c; refresh(); }
  });
  function endPointer(e) {
    if (g.phase !== 'place' || !drag || e.pointerId !== drag.pointerId) {
      if (!drag && hover >= 0 && e.type === 'pointerleave') { hover = -1; refresh(); }
      return;
    }
    const c = big.cellAt(e.clientX, e.clientY);
    const from = drag.from;
    if (c >= 0 && dropAt(c)) { drag = null; hover = -1; refresh(); fit(); return; }
    cancelDrag(!!from);
    refresh();
  }
  bigCv.addEventListener('pointerup', endPointer);
  bigCv.addEventListener('pointercancel', endPointer);
  bigCv.addEventListener('pointerleave', (e) => { if (!drag && hover >= 0) { hover = -1; refresh(); } });
  $('rotBtn').addEventListener('click', rotate);
  $('randBtn').addEventListener('click', randomize);
  $('readyBtn').addEventListener('click', ready);
  $('passBtn').addEventListener('click', pass);
  $('coverBtn').addEventListener('click', () => { g.cover = null; persist(); refresh(); });
  $('newBtn').addEventListener('click', requestNewGame);
  $('modeSel').addEventListener('change', (e) => changeOption('mode', e.target.value));
  if ($('playSel')) $('playSel').addEventListener('change', (e) => changeOption('playMode', e.target.value));
  if ($('fleetSel')) $('fleetSel').addEventListener('change', (e) => changeOption('fleet', e.target.value));
  if ($('touchChk')) $('touchChk').addEventListener('change', (e) => changeOption('noTouch', !!e.target.checked));
  $('helpBtn').addEventListener('click', () => { $('help').hidden = false; });
  $('helpClose').addEventListener('click', () => { $('help').hidden = true; });
  $('help').addEventListener('click', (e) => { if (e.target.id === 'help') $('help').hidden = true; });
  if ($('statsBtn')) $('statsBtn').addEventListener('click', showStats);
  if ($('statsClose')) $('statsClose').addEventListener('click', () => { $('statsDlg').hidden = true; });
  if ($('statsDlg')) $('statsDlg').addEventListener('click', (e) => { if (e.target.id === 'statsDlg') $('statsDlg').hidden = true; });
  if ($('confirmOk')) $('confirmOk').addEventListener('click', () => { const fn = pending; hideConfirm(); if (fn) fn(); syncSelects(); });
  if ($('confirmCancel')) $('confirmCancel').addEventListener('click', () => { hideConfirm(); syncSelects(); refresh(); });
  if ($('confirmDlg')) $('confirmDlg').addEventListener('click', (e) => { if (e.target.id === 'confirmDlg') { hideConfirm(); syncSelects(); refresh(); } });
  $('clearBtn').addEventListener('click', () => {
    askConfirm('Reset the win chips and the stats record?', () => {
      const t = tally(); t[1] = t[2] = 0;
      saved.score.cpu[1] = saved.score.cpu[2] = saved.score.pvp[1] = saved.score.pvp[2] = 0;
      saved.career = { all: ST.emptyRow(), by: {} };
      save(); status();
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
    const helpOpen = $('help') && !$('help').hidden;
    const statsOpen = $('statsDlg') && !$('statsDlg').hidden;
    const confOpen = $('confirmDlg') && !$('confirmDlg').hidden;
    if (e.key === 'Escape') {
      if (drag) { cancelDrag(true); refresh(); }
      if (helpOpen) $('help').hidden = true;
      if (statsOpen) $('statsDlg').hidden = true;
      if (confOpen) { hideConfirm(); syncSelects(); refresh(); }
      return;
    }
    if (helpOpen || statsOpen || confOpen || g.cover) return;
    if (e.key === 'r' || e.key === 'R') { rotate(); return; }
    if (e.key === 'n' || e.key === 'N') { requestNewGame(); return; }
    const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1], A: [-1, 0], D: [1, 0], W: [0, -1], S: [0, 1] };
    if (dirs[e.key]) {
      e.preventDefault();
      kbOn = true;
      const x = Math.max(0, Math.min(N - 1, (cursor % N) + dirs[e.key][0]));
      const y = Math.max(0, Math.min(N - 1, Math.floor(cursor / N) + dirs[e.key][1]));
      cursor = R.idx(x, y);
      if (g.phase === 'place') hover = cursor;
      refresh();
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      if (g.phase === 'place') {
        e.preventDefault();
        kbOn = true;
        if (sel < 0) { flash = 'Pick a ship, then place it on the grid'; refresh(); return; }
        if (dropAt(cursor)) refresh();
        else refresh();
      } else if (canFire()) {
        e.preventDefault();
        kbOn = true;
        fireAt(cursor);
      }
    }
  });

  // ---- theme + layout ----
  function fit() {
    const stage = $('stage'), cluster = $('cluster'), tray = $('tray');
    if (!stage) return;
    const placing = g && g.phase === 'place';
    const landscape = window.matchMedia('(orientation: landscape)').matches;
    const trayW = placing && (landscape || stage.clientWidth > stage.clientHeight) ? (tray.offsetWidth || 140) + 10 : 0;
    const trayH = placing && trayW === 0 ? (tray.offsetHeight || 64) + 8 : 0;
    const fleetH = placing ? 0 : (landscape || stage.clientWidth > stage.clientHeight ? 36 : 40);
    const gap = 8;
    const W = stage.clientWidth, H = stage.clientHeight;
    if (placing) {
      const box = Math.max(120, Math.floor(Math.min(W - trayW, H - trayH - 18)));
      big.resize(box);
    } else {
      if (landscape || W > H) {
        const cap = 16;
        const boxB = Math.max(120, Math.floor(Math.min((W - gap) * 0.56, H - fleetH - cap)));
        const boxM = Math.max(100, Math.floor(Math.min(W - gap - boxB, H - fleetH - cap)));
        big.resize(boxB); mini.resize(boxM);
      } else {
        const cap = 18;
        const inner = H - fleetH * 2 - gap - cap * 2 - 6;
        const boxB = Math.max(120, Math.floor(Math.min(W, inner * 0.58)));
        const boxM = Math.max(100, Math.floor(Math.min(W * 0.78, inner - boxB)));
        big.resize(boxB); mini.resize(boxM);
      }
    }
    const fb = $('fleetBig'), fm = $('fleetMini');
    if (fb) fb.style.maxWidth = big.size() + 'px';
    if (fm) fm.style.maxWidth = mini.size() + 'px';
  }
  function applyTheme() { document.documentElement.classList.toggle('dark', S.isDark()); big.draw(); mini.draw(); if (g) { tray(); fleets(); } }
  S.onChange((ch) => { if ('theme' in ch) applyTheme(); });
  window.addEventListener('resize', () => { fit(); });
  if (window.ResizeObserver) { const ro = new ResizeObserver(() => fit()); ro.observe($('stage')); }
  const gear = S.mountGear($('gearSlot'));
  if (!gear) $('gearSlot').remove();
  if (window.BSFx) BSFx.bindSettings();
  if ($('endAgain')) $('endAgain').addEventListener('click', () => applyNewGame());
  if ($('endCard')) $('endCard').addEventListener('click', (e) => { if (e.target.id === 'endCard') $('endCard').hidden = true; });

  applyTheme(); restore(); fit();
  // for tests
  window.BSGame = {
    place: (i, x, y, o) => { if (g.phase !== 'place') return false; const ok = R.place(g.b[g.placer], i, x, y, o); if (ok) { sel = nextUnplaced(i); persist(); refresh(); } return ok; },
    random: randomize, ready, rotate, pass, newGame: requestNewGame, newGameNow: applyNewGame,
    fire: (x, y) => fireAt(R.idx(x, y)),
    reveal: () => { g.cover = null; refresh(); },
    setRules: (opts) => { if (opts.playMode) saved.playMode = opts.playMode; if (opts.fleet) saved.fleet = opts.fleet; if ('noTouch' in opts) saved.noTouch = !!opts.noTouch; if (opts.mode) saved.mode = opts.mode; save(); applyNewGame(); },
    cursor: (c) => { if (c != null) { cursor = c; kbOn = true; refresh(); } return cursor; },
    state: () => ({ phase: g.phase, placer: g.placer, turn: g.turn, winner: g.winner, mode: saved.mode, playMode: playModeOf(), fleet: g.fleet, noTouch: !!g.noTouch, cover: !!g.cover, shotDone: g.shotDone, volley: g.volley, volleyLeft: g.volleyLeft,
      stats: JSON.parse(JSON.stringify(g.stats)), afloat: { 1: R.shipsLeft(g.b[1]), 2: R.shipsLeft(g.b[2]) }, placed: g.b[g.placer].ships.filter((s) => s.x >= 0).length, sel, orient, wins: Object.assign({}, tally()), career: JSON.parse(JSON.stringify(saved.career)) }),
    raw: () => g,
    waitFx: () => new Promise((r) => { const tick = () => { if (!fxLock && !(window.BSFx && BSFx.busy())) r(); else requestAnimationFrame(tick); }; tick(); }),
    waitTurn: () => new Promise((r) => { const tick = () => { if (g.phase !== 'battle' || (g.turn === 1 && !fxLock && !(window.BSFx && BSFx.busy()))) r(); else requestAnimationFrame(tick); }; tick(); }),
  };
})();
