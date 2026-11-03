/*
 * Ludo — game controller (LUDO-1a; computer seats LUDO-1b). Wires rules, renderer, settings and the page.
 * A turn: tap the die to roll; glowing tokens can move (a dot shows where each lands) — tap one.
 * With only one possible move and Auto-move on, it moves by itself after a short pause.
 * No move / a third 6: the message stays up for a moment, then the next player rolls.
 * Setup (New game): pick which colours play (2 players sit opposite: Red + Yellow or Green + Blue).
 * Saves wins per colour, options and the game in progress in localStorage (LD_CONFIG.storeKey).
 * Computer seats (1b): in setup each playing colour is a Person or Computer Easy / Medium / Hard; seatAct()
 * rolls for a computer seat after LD_CONFIG.cpuRollMs and moves (LDAI.choose) after cpuMoveMs.
 * LUDO-1c: the die tumbles and tokens slide square by square (ui/anim.js, skipped for reduced motion or
 * Low graphics); the computer waits for each animation. Sounds (ui/sound.js) + vibration use the shared
 * settings. House rules are ticked in New game and kept in the game state (state.rules).
 */
(() => {
  const R = LDRules, CFG = LD_CONFIG, S = LD_SETTINGS;
  const $ = (id) => document.getElementById(id);
  const NAME = CFG.names;
  const ORD = ['1st', '2nd', '3rd', '4th'];

  function load() {
    try { const s = JSON.parse(localStorage.getItem(CFG.storeKey)); if (s && s.wins) return s; } catch (_) {}
    return { wins: { red: 0, green: 0, yellow: 0, blue: 0 }, auto: true, players: CFG.colors.slice(), seats: {}, house: {}, game: null };
  }
  const saved = load();
  if (!saved.seats) saved.seats = {};
  if (!saved.house) saved.house = {};
  const houseVal = (key) => (key in saved.house ? saved.house[key] : CFG.rules[key]);
  const save = () => { try { localStorage.setItem(CFG.storeKey, JSON.stringify(saved)); } catch (_) {} };

  let s = null, flash = '', lockUntil = 0, timer = 0, rng = () => 1 + Math.floor(Math.random() * 6);
  const locked = () => Date.now() < lockUntil;
  const persist = () => { saved.game = s; save(); };
  const human = (c) => !s.seats[c] || s.seats[c] === CFG.seats.human;
  const seatOf = (c) => CFG.seats[saved.seats[c]] || CFG.seats.human;
  const lvlName = (l) => l.charAt(0).toUpperCase() + l.slice(1);
  const who = (c) => NAME[c] + (human(c) ? '' : ' (' + lvlName(s.seats[c]) + ')');

  // ---- setup ----
  let pick = saved.players.slice();
  function setupProblem() {
    if (pick.length < 2) return 'Pick at least 2 colours';
    if (pick.length === 2 && CFG.opposite[pick[0]] !== pick[1]) return '2 players sit opposite: Red + Yellow or Green + Blue';
    return '';
  }
  function showSetup() {
    LDAnim.finish();
    pick = (s ? s.players : saved.players).slice();
    clearTimeout(timer); lockUntil = 0;    // computer seats wait while the panel is open
    $('setup').hidden = false; $('setupCancel').hidden = !s; drawSetup();
  }
  function drawSetup() {
    pick = CFG.colors.filter((c) => pick.indexOf(c) >= 0);
    document.querySelectorAll('#colorPick .cp').forEach((b) => b.setAttribute('aria-pressed', pick.indexOf(b.dataset.c) >= 0 ? 'true' : 'false'));
    document.querySelectorAll('#colorPick .seat').forEach((b) => {
      const on = pick.indexOf(b.dataset.s) >= 0, t = seatOf(b.dataset.s);
      b.disabled = !on; b.textContent = CFG.seatNames[t]; b.dataset.t = t;
      b.setAttribute('aria-label', NAME[b.dataset.s] + ' seat: ' + CFG.seatNames[t] + ' (tap to change)');
    });
    const p = setupProblem();
    $('setupMsg').textContent = p || pick.length + ' players: ' + pick.map((c) => NAME[c] + (seatOf(c) === 'human' ? '' : ' (' + lvlName(seatOf(c)) + ')')).join(', ') + '. ' + NAME[pick[0]] + ' starts.';
    $('setupStart').disabled = !!p;
    for (const [id, key, val] of CFG.houseRules) $(id).checked = houseVal(key) === val;
  }
  function startGame() {
    if (setupProblem()) return;
    LDAnim.finish(); clearTimeout(timer);
    const seats = {}, rules = {}; pick.forEach((c) => { seats[c] = seatOf(c); });
    for (const [, key] of CFG.houseRules) rules[key] = houseVal(key);
    saved.players = pick.slice(); s = R.create(pick, seats, rules); flash = ''; lockUntil = 0; view = {};
    $('setup').hidden = true; persist(); refresh(); seatAct();
  }

  // ---- turn steps ----
  // Every roll / move: rules first (state saved at once), then the short animation, then what comes next.
  let rolling = false, view = {};
  const busy = () => locked() || LDAnim.busy();
  function onEvent(ev) {                    // sound for the start of a step (the end sounds are in afterMove)
    if (ev && (ev.type === 'roll' || ev.type === 'nomove' || ev.type === 'three6')) LDSound.roll();
    return ev;
  }
  function rollDie(v) {
    if (!s || s.phase !== 'roll' || busy()) return null;
    const c = s.turn, ev = onEvent(R.roll(s, v || rng()));
    if (!ev) return null;
    shown = ev.die; flash = ''; persist();
    rolling = true; refresh();
    LDAnim.die(ev.die, (f) => LDRender.drawDie($('die'), f, c, false), () => { rolling = false; afterRoll(ev); });
    return ev;
  }
  function afterRoll(ev) {
    const c = ev.color;
    if (ev.type === 'three6') { flash = NAME[c] + ' rolled a third 6 in a row – turn lost'; LDSound.pass(); holdThenNext(); }
    else if (ev.type === 'nomove') { flash = NAME[c] + ' rolled ' + ev.die + ' – no move' + (ev.again ? ', roll again' : ', turn passes'); holdThenNext(); }
    refresh();
    if (ev.type === 'roll') { maybeAuto(); seatAct(); }
  }
  function holdThenNext() { lockUntil = Date.now() + CFG.passDelayMs; clearTimeout(timer); timer = setTimeout(() => { flash = ''; refresh(); seatAct(); }, CFG.passDelayMs); }
  function maybeAuto() {
    const moves = R.legalMoves(s);
    if (!saved.auto || !human(s.turn) || new Set(moves.map((m) => m.from)).size !== 1) return;
    clearTimeout(timer); timer = setTimeout(() => { if (s.phase === 'move') moveToken(moves[0].k); }, CFG.autoDelayMs);
  }
  /** Grid points a token passes through, one per square (yard → start square counts as one step). */
  function pathPts(c, k, from, to) {
    if (from < 0) return [LDBoard.cellOf(c, -1, k), LDBoard.cellOf(c, 0, k)];
    const out = []; for (let q = from; q <= to; q++) out.push(LDBoard.cellOf(c, q, k)); return out;
  }
  function moveToken(k) {
    if (!s || s.phase !== 'move' || LDAnim.busy()) return null;
    const c = s.turn, m = R.legalMoves(s).find((x) => x.k === k);
    if (!m) return null;
    const hold = m.capture.map((o) => ({ color: o.color, k: o.k, p: s.tokens[o.color][o.k] }));
    const ev = onEvent(R.move(s, k));
    if (!ev) return null;
    clearTimeout(timer);
    const bits = []; let place = -1;
    if (ev.capture.length) bits.push(NAME[c] + ' sent ' + ev.capture.map((o) => NAME[o.color]).join(' and ') + ' back to the yard');
    if (ev.home) bits.push(NAME[c] + ' token reached home');
    if (ev.finished) {
      place = s.finished.indexOf(c);
      bits.push(NAME[c] + ' finished ' + ORD[place] + (place === 0 ? ' – wins!' : ''));
      if (place === 0) saved.wins[c] = (saved.wins[c] || 0) + 1;
    }
    if (ev.again) bits.push(bits.length ? 'roll again' : NAME[c] + ' rolled a 6 – roll again');
    persist();                               // saved before the slide: a reload mid-slide shows the finished move
    const pts = pathPts(c, k, ev.from, ev.to), n = pts.length - 1;
    let lastI = 0;
    flash = ''; view = { anim: { color: c, k, x: pts[0][0], y: pts[0][1] }, hold }; refresh();
    LDAnim.path(pts, (x, y, i) => {
      if (i !== lastI) { lastI = i; if (i < n) LDSound.step(); }
      view.anim = { color: c, k, x, y };
      LDRender.setState({ s, moves: [], anim: view.anim, hold });
    }, () => {
      view = {}; flash = bits.join(' – ');
      if (place === 0) { LDSound.win(); S.vibrate([80, 40, 160]); }
      else if (place > 0) { LDSound.finish(); S.vibrate(60); }
      else if (ev.capture.length) { LDSound.capture(); S.vibrate(40); }
      else if (ev.home) { LDSound.home(); S.vibrate(25); }
      else LDSound.move();
      refresh(); seatAct();
    });
    return ev;
  }
  /** Computer seat on turn: pause, roll, pause, move. afterRoll / afterMove / holdThenNext call back here. */
  function seatAct() {
    if (!s || s.phase === 'over' || human(s.turn) || !$('setup').hidden) return;
    clearTimeout(timer);
    if (s.phase === 'move') { timer = setTimeout(cpuMove, CFG.cpuMoveMs); return; }
    timer = setTimeout(() => {
      if (!s || s.phase !== 'roll' || human(s.turn) || !$('setup').hidden) return;
      if (busy()) { seatAct(); return; }
      rollDie();
    }, Math.max(CFG.cpuRollMs, lockUntil - Date.now()));
  }
  function cpuMove() {
    if (!s || s.phase !== 'move' || human(s.turn) || !$('setup').hidden) return;
    if (LDAnim.busy()) { seatAct(); return; }
    const k = LDAI.choose(s, s.seats[s.turn]);
    if (k >= 0) moveToken(k);
  }

  // ---- drawing ----
  function refresh() {
    if (!s) return;
    const moves = R.legalMoves(s);
    LDRender.setState({ s, moves: busy() || !human(s.turn) ? [] : moves, anim: view.anim, hold: view.hold });
    const c = s.turn;
    let t;
    if (s.phase === 'over') t = 'Game over: ' + s.finished.map((q, i) => ORD[i] + ' ' + NAME[q]).join(', ');
    else if (rolling) t = who(c) + ' rolls…';
    else if (view.anim) t = who(view.anim.color) + ' moves…';
    else if (flash && (locked() || s.phase === 'roll')) t = flash + (locked() ? '' : human(c) ? ' · ' + NAME[c] + ': tap the die' : ' · ' + who(c) + ' to roll');
    else if (!human(c)) t = s.phase === 'roll' ? who(c) + ' is rolling…' : who(c) + ' rolled ' + s.die + ', moving…';
    else if (s.phase === 'roll') t = NAME[c] + "'s turn: tap the die to roll";
    else t = NAME[c] + ' rolled ' + s.die + ': tap a glowing token';
    if (s.phase !== 'over' && s.finished.length && !flash) t = NAME[s.finished[0]] + ' won · ' + t;
    $('status').textContent = t;
    $('chips').textContent = '';
    for (const q of s.players) {
      const el = document.createElement('div');
      el.className = 'chip' + (q === c && s.phase !== 'over' ? ' on' : '');
      el.style.setProperty('--c', CFG.hex[q]);
      const home = s.tokens[q].filter((p) => p === CFG.goal).length, place = s.finished.indexOf(q);
      el.innerHTML = '<i class="dot"></i><b></b><span></span>';
      el.querySelector('b').textContent = who(q);
      el.querySelector('span').textContent = (place >= 0 ? ORD[place] : home + '/4 home') + ' · ' + (saved.wins[q] || 0) + ((saved.wins[q] || 0) === 1 ? ' win' : ' wins');
      el.dataset.c = q;
      $('chips').appendChild(el);
    }
    const canRoll = s.phase === 'roll' && !busy() && human(c);
    $('dieBtn').disabled = !canRoll;
    $('dieBtn').setAttribute('aria-label', canRoll ? 'Roll the die' : 'Die: ' + (s.die || '–'));
    if (!rolling) LDRender.drawDie($('die'), s.phase === 'move' ? s.die : lastDie(), c, canRoll);
    $('autoBtn').textContent = 'Auto-move: ' + (saved.auto ? 'on' : 'off');
  }
  let shown = 0;
  const lastDie = () => (s.phase === 'roll' && !locked() ? 0 : shown);

  // ---- input ----
  const cv = $('board'); LDRender.init(cv);
  cv.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!s || s.phase !== 'move' || busy() || !human(s.turn)) return;
    const t = LDRender.tokenAt(e.clientX, e.clientY);
    if (t) moveToken(t.k);
  });
  $('dieBtn').addEventListener('click', () => { const ev = rollDie(); if (ev) shown = ev.die; refresh(); });
  $('autoBtn').addEventListener('click', () => { saved.auto = !saved.auto; save(); refresh(); if (s && s.phase === 'move') maybeAuto(); });
  $('newBtn').addEventListener('click', showSetup);
  function rulesLine() {
    const ru = R.rulesOf(s), on = CFG.houseRules.filter(([, key, val]) => ru[key] === val && val !== CFG.rules[key]).map((h) => h[3]);
    if (!ru.exactHome) on.unshift('Any roll big enough takes a token home (no exact roll needed)');
    return on.length ? 'House rules this game: ' + on.join('; ') + '.' : 'This game uses the classic rules (no house rules).';
  }
  $('helpBtn').addEventListener('click', () => { $('helpRules').textContent = rulesLine(); $('help').hidden = false; });
  for (const [id, key, val] of CFG.houseRules) $(id).addEventListener('change', () => { saved.house[key] = $(id).checked ? val : !val; save(); drawSetup(); });
  $('helpClose').addEventListener('click', () => { $('help').hidden = true; });
  $('help').addEventListener('click', (e) => { if (e.target.id === 'help') $('help').hidden = true; });
  $('clearBtn').addEventListener('click', () => { for (const c of CFG.colors) saved.wins[c] = 0; save(); refresh(); });
  document.querySelectorAll('#colorPick .cp').forEach((b) => b.addEventListener('click', () => {
    const c = b.dataset.c, i = pick.indexOf(c); if (i >= 0) pick.splice(i, 1); else pick.push(c); drawSetup();
  }));
  // seat button: Person → the shared Difficulty level → the next levels → Person
  document.querySelectorAll('#colorPick .seat').forEach((b) => b.addEventListener('click', () => {
    const c = b.dataset.s, L = CFG.levels, first = CFG.difficultyToLevel[S.get('difficulty')] || 'medium';
    const order = ['human'].concat(L.slice(L.indexOf(first)), L.slice(0, L.indexOf(first)));
    saved.seats[c] = order[(order.indexOf(seatOf(c)) + 1) % order.length]; save(); drawSetup();
  }));
  $('setupStart').addEventListener('click', startGame);
  $('setupCancel').addEventListener('click', () => { $('setup').hidden = true; flash = ''; refresh(); maybeAuto(); seatAct(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') { if ($('setup').hidden && $('help').hidden) { e.preventDefault(); $('dieBtn').click(); } }
    else if (e.key >= '1' && e.key <= '4' && s && s.phase === 'move' && human(s.turn) && !busy()) moveToken(+e.key - 1);
    else if (e.key === 'Escape') $('help').hidden = true;
  });

  // ---- theme + layout ----
  const wrap = $('boardWrap');
  const fit = () => LDRender.resize(wrap);
  function applyTheme() { document.documentElement.classList.toggle('dark', S.isDark()); LDRender.draw(); }
  S.onChange((ch) => { if ('theme' in ch) applyTheme(); });
  window.addEventListener('resize', fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(wrap);
  const gear = S.mountGear($('gearSlot'));
  if (!gear) $('gearSlot').remove();

  applyTheme();
  if (saved.game && R.valid(saved.game)) { s = saved.game; shown = s.die || 0; refresh(); maybeAuto(); seatAct(); }
  else { s = R.create(saved.players.length >= 2 ? saved.players : CFG.colors); refresh(); showSetup(); $('setupCancel').hidden = true; }
  fit();

  // for tests (and 1b / 1c)
  window.LDGame = {
    roll: (v) => { const ev = rollDie(v); if (ev) shown = ev.die; refresh(); return ev; },
    move: (k) => moveToken(k), start: (cols, seats) => { if (seats) Object.assign(saved.seats, seats); pick = cols.slice(); startGame(); return !$('setup').hidden ? false : true; },
    setup: showSetup, seat: (c, t) => { saved.seats[c] = t; save(); drawSetup(); }, unlock: () => { lockUntil = 0; clearTimeout(timer); flash = ''; refresh(); },
    setState: (x) => { s = x; persist(); refresh(); }, state: () => R.clone(s), raw: () => s,
    tokenPx: (c, k) => LDRender.tokenPx(c, k), locked, busy: () => LDAnim.busy(), rulesLine: () => rulesLine(),
    house: (o) => { Object.assign(saved.house, o); save(); drawSetup(); },
  };
})();
