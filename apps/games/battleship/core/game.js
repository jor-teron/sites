/*
 * Battleship — game controller (SHIP-1). Wires rules, AI, renderer, sound, settings and the page.
 * Flow: place ships (tap a ship in the tray, tap a square; Rotate; Random; Ready) → take turns firing
 * one shot each → first to sink the whole enemy fleet wins.
 * vs CPU: you are Player 1 and fire first; the computer hides its fleet at random.
 * 2 players: one device. Between turns (and between placing) a full-screen cover hides both grids
 * until the next player taps "I'm ready"; reloading mid-game also comes back behind the cover.
 * Keeps shots and accuracy per side. Saves wins, mode and the game in progress (BS_CONFIG.storeKey).
 */
(() => {
  const R = BSRules, AI = BSAI, CFG = BS_CONFIG, S = BS_SETTINGS, N = R.N;
  const $ = (id) => document.getElementById(id);
  const other = (p) => 3 - p;

  function load() {
    try { const s = JSON.parse(localStorage.getItem(CFG.storeKey)); if (s && s.score && s.score.cpu && s.score.pvp) return s; } catch (_) {}
    return { score: { cpu: { 1: 0, 2: 0 }, pvp: { 1: 0, 2: 0 } }, mode: CFG.difficultyToLevel[S.get('difficulty')] || 'medium', game: null };
  }
  const saved = load();
  const save = () => { try { localStorage.setItem(CFG.storeKey, JSON.stringify(saved)); } catch (_) {} };

  let g, sel = 0, orient = 'h', hover = -1, flash = '', cpuTimer = 0;
  const isCpu = () => saved.mode !== '2p';
  const tally = () => saved.score[isCpu() ? 'cpu' : 'pvp'];
  const who = (p) => (isCpu() ? (p === 1 ? 'You' : 'Computer') : CFG.names[p]);
  const viewer = () => (isCpu() ? 1 : g.phase === 'place' ? g.placer : g.phase === 'over' ? g.winner : g.turn);
  const canFire = () => g.phase === 'battle' && !g.cover && !g.shotDone && !(isCpu() && g.turn === 2);

  function fresh() {
    const b = { 1: R.newBoard(), 2: R.newBoard() };
    if (isCpu()) R.randomFleet(b[2]);
    return { b, phase: 'place', placer: 1, turn: 1, winner: 0, stats: { 1: { s: 0, h: 0 }, 2: { s: 0, h: 0 } },
      note: { 1: '', 2: '' }, last: { 1: -1, 2: -1 }, shotDone: false, cover: null };
  }
  function persist() {
    saved.game = Object.assign({}, g, { b: { 1: R.serialize(g.b[1]), 2: R.serialize(g.b[2]) } });
    save();
  }
  function newGame() {
    clearTimeout(cpuTimer);
    g = fresh(); sel = 0; orient = 'h'; hover = -1; flash = '';
    persist(); refresh();
  }
  function restore() {
    const o = saved.game;
    try {
      if (o && o.b && o.stats && ['place', 'battle', 'over'].indexOf(o.phase) >= 0) {
        g = Object.assign(fresh(), o, { b: { 1: R.deserialize(o.b[1]), 2: R.deserialize(o.b[2]) } });
        if (isCpu() && !R.allPlaced(g.b[2])) R.randomFleet(g.b[2]);
        sel = g.phase === 'place' ? nextUnplaced(-1) : -1; flash = '';
        if (!isCpu() && g.phase !== 'over') {
          if (g.shotDone) { g.shotDone = false; g.turn = other(g.turn); }
          if (!g.cover) g.cover = { p: g.phase === 'place' ? g.placer : g.turn, place: g.phase === 'place' };   // a reload never shows a fleet
        }
        refresh(); maybeCpu(); return;
      }
    } catch (_) { /* bad save: start fresh */ }
    newGame();
  }

  // ---- drawing ----
  const big = BSRender.view($('big'), $('bigWrap')), mini = BSRender.view($('mini'), $('miniWrap'));
  function ghost() {
    if (g.phase !== 'place' || sel < 0 || hover < 0) return null;
    const b = g.b[g.placer], sz = b.ships[sel].size;
    let x = hover % N, y = Math.floor(hover / N);
    if (orient === 'h') x = Math.min(x, N - sz); else y = Math.min(y, N - sz);
    return { cells: R.cellsOf(sz, x, y, orient), ok: R.fits(b, sel, x, y, orient) };
  }
  function refresh() {
    const v = viewer(), placing = g.phase === 'place';
    $('app').classList.toggle('placing', placing);
    if (placing) {
      big.set({ board: g.b[g.placer], showShips: true, sel, ghost: ghost(), last: -1, dim: false });
      $('bigCap').textContent = isCpu() ? 'Your fleet' : CFG.names[g.placer] + "'s fleet";
    } else {
      const over = g.phase === 'over';
      big.set({ board: g.b[other(v)], showShips: over, sel: -1, ghost: null, last: g.last[v], dim: !over && !canFire() });
      mini.set({ board: g.b[v], showShips: true, sel: -1, ghost: null, last: g.last[other(v)], dim: false });
      $('bigCap').textContent = over ? who(other(v)) + "'s fleet (all shown)" : (isCpu() ? "Computer's waters – tap to fire" : CFG.names[other(v)] + "'s waters – tap to fire");
      $('miniCap').textContent = (isCpu() ? 'Your' : CFG.names[v] + "'s") + ' fleet';
    }
    tray(); status(); cover();
  }
  function tray() {
    const el = $('tray');
    if (g.phase !== 'place') { el.textContent = ''; return; }
    const b = g.b[g.placer];
    el.textContent = '';
    b.ships.forEach((sh, i) => {
      const bt = document.createElement('button');
      bt.className = (i === sel ? 'on ' : '') + (sh.x >= 0 ? 'done' : '');
      bt.textContent = sh.name + ' ' + sh.size;
      const bar = document.createElement('i'); bar.style.width = sh.size * 7 + 'px'; bt.appendChild(bar);
      bt.addEventListener('click', () => { sel = i; if (sh.x >= 0) orient = sh.o; flash = ''; refresh(); });
      el.appendChild(bt);
    });
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
      const b = g.b[g.placer];
      if (sel >= 0) t = pre + 'tap a square for the ' + b.ships[sel].name + ' (' + b.ships[sel].size + ')';
      else t = R.allPlaced(b) ? pre + 'all ships placed – press Ready' : pre + 'pick a ship below';
    } else if (isCpu() && g.turn === 2) t = 'Computer is aiming…';
    else if (g.shotDone) t = 'Press Pass device and hand it to ' + CFG.names[other(g.turn)];
    else t = (isCpu() ? 'Your turn' : CFG.names[g.turn] + "'s turn") + ': tap a square on the big grid to fire';
    $('status').textContent = t.charAt(0).toUpperCase() + t.slice(1);
    $('note').textContent = g.phase === 'place' ? 'Ships can touch but not overlap. Tap a placed ship to move it.' : [g.note[1], g.note[2]].filter(Boolean).join(' · ');
    for (const p of [1, 2]) {
      const st = g.stats[p];
      $('lbl' + p).textContent = isCpu() ? who(p) : 'P' + p;
      $('st' + p).textContent = st.s + (st.s === 1 ? ' shot · ' : ' shots · ') + acc(st) + '% hit · ' + R.shipsLeft(g.b[p]) + ' afloat';
      $('wl' + p).textContent = isCpu() ? who(p) : 'P' + p;
      $('win' + p).textContent = tally()[p];
    }
    $('modeSel').value = saved.mode;
    const placing = g.phase === 'place';
    for (const id of ['rotBtn', 'randBtn', 'readyBtn']) $(id).hidden = !placing;
    $('readyBtn').disabled = !R.allPlaced(g.b[g.placer]);
    $('rotBtn').textContent = 'Rotate ↻ ' + (orient === 'h' ? 'across' : 'down');
    $('passBtn').hidden = isCpu() || g.phase !== 'battle';
    $('passBtn').disabled = !g.shotDone;
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

  // ---- placing ----
  function nextUnplaced(from) {
    const sh = g.b[g.placer].ships;
    for (let k = 1; k <= sh.length; k++) { const i = (from + k + sh.length) % sh.length; if (sh[i].x < 0) return i; }
    return -1;
  }
  function placeAt(c) {
    const b = g.b[g.placer], j = R.occupancy(b)[c];
    flash = '';
    if (j >= 0) { if (j === sel) rotate(); else { sel = j; orient = b.ships[j].o; } refresh(); return; }
    if (sel < 0) { flash = 'Pick a ship below, or tap a placed ship to move it'; refresh(); return; }
    if (R.placeNear(b, sel, c % N, Math.floor(c / N), orient)) { BSSound.place(); sel = nextUnplaced(sel); persist(); }
    else { BSSound.bad(); flash = "The " + b.ships[sel].name + " doesn't fit there"; }
    refresh();
  }
  function rotate() {
    if (g.phase !== 'place') return;
    const b = g.b[g.placer], no = orient === 'h' ? 'v' : 'h';
    flash = '';
    if (sel >= 0 && b.ships[sel].x >= 0) {
      const sh = b.ships[sel];
      if (!R.placeNear(b, sel, sh.x, sh.y, no)) { BSSound.bad(); flash = 'No room to turn the ' + sh.name + ' there'; refresh(); return; }
      BSSound.place(); persist();
    }
    orient = no; refresh();
  }
  function randomize() {
    if (g.phase !== 'place') return;
    R.randomFleet(g.b[g.placer]); sel = -1; flash = ''; BSSound.place(); persist(); refresh();
  }
  function ready() {
    if (g.phase !== 'place' || !R.allPlaced(g.b[g.placer])) return;
    flash = '';
    if (isCpu()) { g.phase = 'battle'; g.turn = 1; }
    else if (g.placer === 1) { g.placer = 2; g.cover = { p: 2, place: true }; sel = 0; orient = 'h'; }
    else { g.phase = 'battle'; g.turn = 1; g.cover = { p: 1 }; }
    persist(); refresh();
  }

  // ---- firing ----
  function shoot(p, c) {
    const tb = g.b[other(p)], r = R.fire(tb, c);
    if (r.res === 'repeat') return false;
    const st = g.stats[p]; st.s++; if (r.res !== 'miss') st.h++;
    g.last[p] = c; flash = '';
    const name = r.ship >= 0 ? tb.ships[r.ship].name : '';
    const youHit = isCpu() && p === 2;
    g.note[p] = who(p) + ' fired at ' + R.label(c) + ': ' + (r.res === 'miss' ? 'miss' : r.res === 'hit' ? 'hit!' :
      'sank ' + (youHit ? 'your ' : isCpu() ? 'the ' : CFG.names[other(p)] + "'s ") + name + '!');
    if (r.res === 'miss') BSSound.miss();
    else if (r.res === 'hit') { BSSound.hit(); S.vibrate(youHit ? 40 : 20); }
    else { BSSound.sunk(); S.vibrate([60, 40, 60]); }
    if (r.win) { finish(p); return true; }
    if (isCpu()) { g.turn = other(p); persist(); refresh(); maybeCpu(); }
    else { g.shotDone = true; persist(); refresh(); }
    return true;
  }
  function fireAt(c) {
    if (!canFire()) return false;
    if (!shoot(g.turn, c)) { BSSound.bad(); flash = 'Already fired at ' + R.label(c) + ' – pick another square'; refresh(); return false; }
    return true;
  }
  function maybeCpu() {
    clearTimeout(cpuTimer);
    if (!isCpu() || g.phase !== 'battle' || g.turn !== 2) return;
    cpuTimer = setTimeout(() => { if (g.phase === 'battle' && g.turn === 2) shoot(2, AI.choose(g.b[1], saved.mode)); }, CFG.cpuDelayMs);
  }
  function pass() {
    if (!g.shotDone) return;
    g.shotDone = false; g.turn = other(g.turn); g.cover = { p: g.turn }; persist(); refresh();
  }
  function finish(p) {
    g.phase = 'over'; g.winner = p; g.cover = null; g.shotDone = false; tally()[p]++;
    const lose = isCpu() && p === 2;
    if (lose) { BSSound.lose(); S.vibrate(300); } else { BSSound.win(); S.vibrate([80, 40, 80, 40, 160]); }
    persist(); refresh();
  }

  // ---- input ----
  const bigCv = $('big');
  bigCv.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const c = big.cellAt(e.clientX, e.clientY); if (c < 0) return;
    if (g.phase === 'place') placeAt(c); else fireAt(c);
  });
  bigCv.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || g.phase !== 'place') return;
    const c = big.cellAt(e.clientX, e.clientY); if (c !== hover) { hover = c; refresh(); }
  });
  bigCv.addEventListener('pointerleave', () => { if (hover >= 0) { hover = -1; refresh(); } });
  $('rotBtn').addEventListener('click', rotate);
  $('randBtn').addEventListener('click', randomize);
  $('readyBtn').addEventListener('click', ready);
  $('passBtn').addEventListener('click', pass);
  $('coverBtn').addEventListener('click', () => { g.cover = null; persist(); refresh(); });
  $('newBtn').addEventListener('click', newGame);
  $('modeSel').addEventListener('change', (e) => { saved.mode = e.target.value; newGame(); });
  $('helpBtn').addEventListener('click', () => { $('help').hidden = false; });
  $('helpClose').addEventListener('click', () => { $('help').hidden = true; });
  $('help').addEventListener('click', (e) => { if (e.target.id === 'help') $('help').hidden = true; });
  $('clearBtn').addEventListener('click', () => { const t = tally(); t[1] = t[2] = 0; save(); status(); });
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'SELECT') return;
    if (e.key === 'r') rotate(); else if (e.key === 'n') newGame();
    else if (e.key === 'Escape') $('help').hidden = true;
  });

  // ---- theme + layout ----
  const fit = () => { big.resize(); mini.resize(); };
  function applyTheme() { document.documentElement.classList.toggle('dark', S.isDark()); big.draw(); mini.draw(); }
  S.onChange((ch) => { if ('theme' in ch) applyTheme(); });
  window.addEventListener('resize', fit);
  if (window.ResizeObserver) { const ro = new ResizeObserver(fit); ro.observe($('bigWrap')); ro.observe($('miniWrap')); }
  const gear = S.mountGear($('gearSlot'));
  if (!gear) $('gearSlot').remove();

  applyTheme(); restore(); fit();
  // for tests
  window.BSGame = {
    place: (i, x, y, o) => { if (g.phase !== 'place') return false; const ok = R.place(g.b[g.placer], i, x, y, o); if (ok) { sel = nextUnplaced(i); persist(); refresh(); } return ok; },
    random: randomize, ready, rotate, pass, newGame,
    fire: (x, y) => fireAt(R.idx(x, y)),
    reveal: () => { g.cover = null; refresh(); },
    state: () => ({ phase: g.phase, placer: g.placer, turn: g.turn, winner: g.winner, mode: saved.mode, cover: !!g.cover, shotDone: g.shotDone,
      stats: JSON.parse(JSON.stringify(g.stats)), afloat: { 1: R.shipsLeft(g.b[1]), 2: R.shipsLeft(g.b[2]) }, placed: g.b[g.placer].ships.filter((s) => s.x >= 0).length, sel, orient, wins: Object.assign({}, tally()) }),
    raw: () => g,
  };
})();
