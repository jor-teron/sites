/*
 * Ludo — game controller (LUDO-1a). Wires rules, renderer, settings and the page.
 * A turn: tap the die to roll; glowing tokens can move (a dot shows where each lands) — tap one.
 * With only one possible move and Auto-move on, it moves by itself after a short pause.
 * No move / a third 6: the message stays up for a moment, then the next player rolls.
 * Setup (New game): pick which colours play (2 players sit opposite: Red + Yellow or Green + Blue).
 * Saves wins per colour, options and the game in progress in localStorage (LD_CONFIG.storeKey).
 * Plug-in points: seatAct() is where 1b's computer seats roll and move; onEvent() is where 1c adds
 * sound and animation (every roll / move returns an event object from LDRules).
 */
(() => {
  const R = LDRules, CFG = LD_CONFIG, S = LD_SETTINGS;
  const $ = (id) => document.getElementById(id);
  const NAME = CFG.names;
  const ORD = ['1st', '2nd', '3rd', '4th'];

  function load() {
    try { const s = JSON.parse(localStorage.getItem(CFG.storeKey)); if (s && s.wins) return s; } catch (_) {}
    return { wins: { red: 0, green: 0, yellow: 0, blue: 0 }, auto: true, players: CFG.colors.slice(), game: null };
  }
  const saved = load();
  const save = () => { try { localStorage.setItem(CFG.storeKey, JSON.stringify(saved)); } catch (_) {} };

  let s = null, flash = '', lockUntil = 0, timer = 0, rng = () => 1 + Math.floor(Math.random() * 6);
  const locked = () => Date.now() < lockUntil;
  const persist = () => { saved.game = s; save(); };
  const human = (c) => s.seats[c] === CFG.seats.human;

  // ---- setup ----
  let pick = saved.players.slice();
  function setupProblem() {
    if (pick.length < 2) return 'Pick at least 2 colours';
    if (pick.length === 2 && CFG.opposite[pick[0]] !== pick[1]) return '2 players sit opposite: Red + Yellow or Green + Blue';
    return '';
  }
  function showSetup() {
    pick = (s ? s.players : saved.players).slice();
    $('setup').hidden = false; $('setupCancel').hidden = !s; drawSetup();
  }
  function drawSetup() {
    pick = CFG.colors.filter((c) => pick.indexOf(c) >= 0);
    document.querySelectorAll('#colorPick button').forEach((b) => b.setAttribute('aria-pressed', pick.indexOf(b.dataset.c) >= 0 ? 'true' : 'false'));
    const p = setupProblem();
    $('setupMsg').textContent = p || pick.length + ' players: ' + pick.map((c) => NAME[c]).join(', ') + '. ' + NAME[pick[0]] + ' starts.';
    $('setupStart').disabled = !!p;
  }
  function startGame() {
    if (setupProblem()) return;
    clearTimeout(timer);
    saved.players = pick.slice(); s = R.create(pick); flash = ''; lockUntil = 0;
    $('setup').hidden = true; persist(); refresh(); seatAct();
  }

  // ---- turn steps ----
  function onEvent(ev) { /* 1c: sound + animation hook (ev from LDRules.roll / LDRules.move) */ return ev; }
  function rollDie(v) {
    if (!s || s.phase !== 'roll' || locked()) return null;
    const c = s.turn, ev = onEvent(R.roll(s, v || rng()));
    if (!ev) return null;
    if (ev.type === 'three6') { flash = NAME[c] + ' rolled a third 6 in a row – turn lost'; holdThenNext(); }
    else if (ev.type === 'nomove') { flash = NAME[c] + ' rolled ' + ev.die + ' – no move' + (ev.again ? ', roll again' : ', turn passes'); holdThenNext(); }
    else { flash = ''; persist(); refresh(); maybeAuto(); return ev; }
    persist(); refresh(); return ev;
  }
  function holdThenNext() { lockUntil = Date.now() + CFG.passDelayMs; clearTimeout(timer); timer = setTimeout(() => { flash = ''; refresh(); seatAct(); }, CFG.passDelayMs); }
  function maybeAuto() {
    const moves = R.legalMoves(s);
    if (!saved.auto || !human(s.turn) || new Set(moves.map((m) => m.from)).size !== 1) return;
    clearTimeout(timer); timer = setTimeout(() => { if (s.phase === 'move') moveToken(moves[0].k); }, CFG.autoDelayMs);
  }
  function moveToken(k) {
    if (!s || s.phase !== 'move') return null;
    const c = s.turn, ev = onEvent(R.move(s, k));
    if (!ev) return null;
    clearTimeout(timer);
    const bits = [];
    if (ev.capture.length) bits.push(NAME[c] + ' sent ' + ev.capture.map((o) => NAME[o.color]).join(' and ') + ' back to the yard');
    if (ev.home) bits.push(NAME[c] + ' token reached home');
    if (ev.finished) {
      const place = s.finished.indexOf(c);
      bits.push(NAME[c] + ' finished ' + ORD[place] + (place === 0 ? ' – wins!' : ''));
      if (place === 0) saved.wins[c] = (saved.wins[c] || 0) + 1;
      S.vibrate(place === 0 ? [80, 40, 160] : 60);
    }
    if (ev.again) bits.push(bits.length ? 'roll again' : NAME[c] + ' rolled a 6 – roll again');
    flash = bits.join(' – ');
    persist(); refresh(); seatAct();
    return ev;
  }
  function seatAct() { /* 1b: when s.seats[s.turn] is a computer seat, it rolls and moves from here */ }

  // ---- drawing ----
  function refresh() {
    if (!s) return;
    const moves = R.legalMoves(s);
    LDRender.setState({ s, moves: locked() ? [] : moves });
    const c = s.turn;
    let t;
    if (s.phase === 'over') t = 'Game over: ' + s.finished.map((q, i) => ORD[i] + ' ' + NAME[q]).join(', ');
    else if (flash && (locked() || s.phase === 'roll')) t = flash + (locked() ? '' : ' · ' + NAME[c] + ': tap the die');
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
      el.querySelector('b').textContent = NAME[q];
      el.querySelector('span').textContent = (place >= 0 ? ORD[place] : home + '/4 home') + ' · ' + (saved.wins[q] || 0) + ' wins';
      el.dataset.c = q;
      $('chips').appendChild(el);
    }
    const canRoll = s.phase === 'roll' && !locked() && human(c);
    $('dieBtn').disabled = !canRoll;
    $('dieBtn').setAttribute('aria-label', canRoll ? 'Roll the die' : 'Die: ' + (s.die || '–'));
    LDRender.drawDie($('die'), s.phase === 'move' ? s.die : lastDie(), c, canRoll);
    $('autoBtn').textContent = 'Auto-move: ' + (saved.auto ? 'on' : 'off');
  }
  let shown = 0;
  const lastDie = () => (s.phase === 'roll' && !locked() ? 0 : shown);

  // ---- input ----
  const cv = $('board'); LDRender.init(cv);
  cv.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!s || s.phase !== 'move' || locked() || !human(s.turn)) return;
    const t = LDRender.tokenAt(e.clientX, e.clientY);
    if (t) moveToken(t.k);
  });
  $('dieBtn').addEventListener('click', () => { const ev = rollDie(); if (ev) shown = ev.die; refresh(); });
  $('autoBtn').addEventListener('click', () => { saved.auto = !saved.auto; save(); refresh(); if (s && s.phase === 'move') maybeAuto(); });
  $('newBtn').addEventListener('click', showSetup);
  $('helpBtn').addEventListener('click', () => { $('help').hidden = false; });
  $('helpClose').addEventListener('click', () => { $('help').hidden = true; });
  $('help').addEventListener('click', (e) => { if (e.target.id === 'help') $('help').hidden = true; });
  $('clearBtn').addEventListener('click', () => { for (const c of CFG.colors) saved.wins[c] = 0; save(); refresh(); });
  document.querySelectorAll('#colorPick button').forEach((b) => b.addEventListener('click', () => {
    const c = b.dataset.c, i = pick.indexOf(c); if (i >= 0) pick.splice(i, 1); else pick.push(c); drawSetup();
  }));
  $('setupStart').addEventListener('click', startGame);
  $('setupCancel').addEventListener('click', () => { $('setup').hidden = true; });
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') { if ($('setup').hidden && $('help').hidden) { e.preventDefault(); $('dieBtn').click(); } }
    else if (e.key >= '1' && e.key <= '4' && s && s.phase === 'move') moveToken(+e.key - 1);
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
    move: (k) => moveToken(k), start: (cols) => { pick = cols.slice(); startGame(); return !$('setup').hidden ? false : true; },
    setup: showSetup, unlock: () => { lockUntil = 0; clearTimeout(timer); flash = ''; refresh(); },
    setState: (x) => { s = x; persist(); refresh(); }, state: () => R.clone(s), raw: () => s,
    tokenPx: (c, k) => LDRender.tokenPx(c, k), locked,
  };
})();
