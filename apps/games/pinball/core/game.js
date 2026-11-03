/*
 * Star Pinball — game controller (PIN-1a; targets, missions, bonus, ball save, panel, resume PIN-1b).
 * Wires physics, missions, renderer, input, settings and the page.
 * States: 'ready' (ball on the plunger) → 'play' → 'drain' → next ball … after 3 balls 'over'.
 * Loop: requestAnimationFrame, drawing at the shared fpsLimit; each drawn frame runs the physics for
 * the real time since the last one in fixed 1/1440 s sub-steps (24 at 60 fps, 48 at 30 fps).
 * The loop stops while paused or after the game ends, so it costs nothing then.
 * Pauses when the tab is hidden (and on window blur when the shared autoPause is on).
 * Controls: Z / ← left flipper, / / → right flipper, Space / ↓ plunger (hold, release), P / Esc pause,
 * N new game. Touch: hold the left or right half of the screen; hold the bottom-right to pull the
 * plunger while the ball waits in the launch lane. A flipper press also moves the lit star lanes
 * one step left / right (lane change).
 * PIN-1b rules: all 3 star lanes lit → bonus multiplier +1 (up to ×5). Bonus points build up during a
 * ball and are paid × the multiplier when it drains. Ball save: a drain in the first 6 s after a new
 * ball leaves the launch lane gives the ball back (once per ball). Missions + ranks: core/missions.js,
 * started from the hole. The message panel shows rank, score, multiplier, the mission + progress
 * and short messages.
 * Storage: high score in 'pinball.best'; the game in progress in 'pinball.save' (score, ball, rank,
 * mission + progress, bonus + multiplier, lit lanes, drop targets), saved at each new ball, on
 * mission changes and when pausing / leaving; reopening the page resumes it with the ball on the
 * plunger. Removed at game over and by New game.
 */
(() => {
  const C = PB_CONFIG, T = PB_TABLE, S = PB_SETTINGS, PH = PBPhysics, RD = PBRender, MS = PBMissions, SC = C.score, BN = C.bonus;
  const $ = (id) => document.getElementById(id);

  let world, state = 'ready', ball = 1, score = 0, paused = false, raf = 0, last = 0, acc = 0, drainTimer = 0, msgTimer = 0;
  let lit = {}, flash = {}, steps = 0, frames = 0;
  let mult = 1, bonus = 0, ms = MS.fresh(), saveUntil = 0, saveUsed = false, saves = 0, msg = '', lastBonus = 0;
  let prevIn = { left: false, right: false };
  let best = 0; try { best = Number(localStorage.getItem(C.bestKey)) || 0; } catch (_) {}
  const keys = { left: false, right: false, plunger: false };
  const touches = new Map();                                   // pointerId → 'left' | 'right' | 'plunger'
  const input = () => {
    const o = { left: keys.left, right: keys.right, plunger: keys.plunger };
    for (const z of touches.values()) o[z] = true;
    return o;
  };
  const inLane = () => world.ball && world.ball.live && world.ball.mode === 'table' && world.ball.x > T.playMaxX;

  // ---- save / resume ----
  function saveGame() {
    if (state === 'over') return;
    const rec = { v: 1, score, ball, mult, bonus, lit, ms, saveUsed,
      drops: T.drops.filter((d) => !world.drops[d.id]).map((d) => d.id) };
    try { localStorage.setItem(C.saveKey, JSON.stringify(rec)); } catch (_) {}
  }
  const clearSave = () => { try { localStorage.removeItem(C.saveKey); } catch (_) {} };
  function loadSave() {
    let s = null; try { s = JSON.parse(localStorage.getItem(C.saveKey)); } catch (_) {}
    if (!s || s.v !== 1 || !(s.ball >= 1 && s.ball <= C.balls) || !(s.score >= 0)) return null;
    if (!s.score && s.ball === 1 && !(s.ms && (s.ms.idx || s.ms.rank))) return null;   // nothing played yet: just start
    return s;
  }

  function newGame(resume) {
    clearTimeout(drainTimer);
    world = PH.create(); PH.newBall(world);
    state = 'ready'; ball = 1; score = 0; lit = {}; flash = {}; acc = 0; mult = 1; bonus = 0; ms = MS.fresh();
    saveUntil = 0; saveUsed = false; lastBonus = 0;
    const s = resume ? loadSave() : null;
    if (s) {
      score = Math.floor(s.score); ball = s.ball; mult = Math.max(1, Math.min(C.multMax, s.mult | 0 || 1)); bonus = Math.max(0, s.bonus | 0);
      for (const id of ['L1', 'L2', 'L3']) if (s.lit && s.lit[id]) lit[id] = true;
      ms = MS.load(s.ms); saveUsed = !!s.saveUsed;
      for (const id of s.drops || []) if (id in world.drops) world.drops[id] = false;
      if (T.drops.every((d) => !world.drops[d.id])) world.dropsAt = world.t + C.drop.resetDelay;
    } else clearSave();
    $('over').hidden = true;
    hud(); setPaused(false, true);
    if (s) say(`Welcome back - ball ${ball} / ${C.balls}`); else say(MS.status(ms).hint);
    saveGame();
  }
  function hud() {
    $('score').textContent = score.toLocaleString('en');
    $('ball').textContent = state === 'over' ? '–' : ball + ' / ' + C.balls;
    $('best').textContent = best.toLocaleString('en');
    $('rank').textContent = MS.rankName(ms);
    $('mult').textContent = '×' + mult;
    const st = MS.status(ms);
    $('mission').textContent = st.name; $('progress').textContent = st.progress;
    $('progBar').style.width = Math.round(st.frac * 100) + '%';
    $('msg').textContent = msg; $('msg').hidden = !msg; $('missionLine').hidden = !!msg;
  }
  function say(text) {
    msg = text; clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { msg = ''; hud(); }, C.msgMs);
    hud();
  }
  const add = (n, b) => { score += n; bonus += b || 0; hud(); };

  function mission(type) {
    const res = MS.event(ms, type);
    for (const r of res) { if (r.points) add(r.points, BN.mission); }
    if (res.length) { say(res.map((r) => r.text).join(' · ')); if (res.some((r) => r.kind !== 'progress')) saveGame(); }
  }
  function lanesDone() {
    lit = {}; add(SC.allLanes, BN.lanes);
    if (mult < C.multMax) mult++;
    say('Star lanes lit! Bonus ×' + mult); mission('lanes');
  }
  /** Lane change: a flipper press moves the lit star lanes one step. */
  function laneChange(dir) {
    const ids = ['L1', 'L2', 'L3'], was = ids.map((id) => !!lit[id]);
    lit = {}; ids.forEach((id, i) => { if (was[(i - dir + 3) % 3]) lit[id] = true; });
  }

  function onEvents(ev) {
    for (const e of ev) {
      switch (e.type) {
        case 'bumper': add(SC.bumper, BN.bumper); flash[e.id] = performance.now(); mission('bumper'); break;
        case 'sling': add(SC.sling, BN.sling); flash['sling' + (T.walls[e.id].a[0] < 280 ? 0 : 1)] = performance.now(); mission('sling'); break;
        case 'sensor':
          if (e.kind === 'top') { add(SC.topLane); lit[e.id] = true; if (lit.L1 && lit.L2 && lit.L3) lanesDone(); }
          else if (e.kind === 'in') add(SC.inlane); else if (e.kind === 'out') add(SC.outlane);
          break;
        case 'drop': add(SC.drop, BN.drop); break;
        case 'dropsClear': add(SC.dropsClear); say('Asteroid field cleared! +' + SC.dropsClear.toLocaleString('en')); mission('dropsClear'); break;
        case 'spin': add(SC.spin, BN.spin); mission('spin'); break;
        case 'ramp': add(SC.rampMade, BN.ramp); say('Ramp! +' + SC.rampMade.toLocaleString('en')); mission('ramp'); break;
        case 'hole': add(SC.hole, BN.hole); mission('hole'); break;
        case 'drain': case 'escape': drained(); break;
      }
    }
    if (state === 'ready' && world.ball.live && !inLane()) {
      state = 'play';
      if (!saveUsed) saveUntil = world.t + C.ballSave;
    }
  }
  function drained() {
    if (state === 'drain' || state === 'over') return;
    S.vibrate(80);
    if (state === 'play' && world.t < saveUntil && !saveUsed) {      // ball save
      saveUsed = true; saveUntil = 0; saves++; state = 'drain'; say('Ball saved!');
      drainTimer = setTimeout(() => { PH.newBall(world); state = 'ready'; hud(); saveGame(); }, C.drainDelayMs);
      return;
    }
    state = 'drain';
    lastBonus = bonus * mult;
    if (lastBonus) { score += lastBonus; say(`Bonus ${bonus.toLocaleString('en')} × ${mult} = ${lastBonus.toLocaleString('en')}`); }
    bonus = 0; mult = 1; saveUntil = 0; saveUsed = false;
    const lastBall = ball >= C.balls;
    if (!lastBall) { ball++; saveGame(); } else clearSave();
    hud();
    drainTimer = setTimeout(() => {
      if (lastBall) return gameOver();
      PH.newBall(world); state = 'ready'; hud(); saveGame();
    }, C.drainDelayMs);
  }
  function gameOver() {
    state = 'over'; clearSave();
    const rec = score > best;
    if (rec) { best = score; try { localStorage.setItem(C.bestKey, String(best)); } catch (_) {} }
    $('overText').textContent = (rec && score ? 'New high score! ' : 'Game over. ') + 'Score ' + score.toLocaleString('en') + ' · Rank ' + MS.rankName(ms);
    $('over').hidden = false; hud(); draw();
  }

  /** Advance the physics by `sec` of real time in fixed sub-steps. */
  function simulate(sec) {
    acc += Math.min(sec, C.maxStepsPerFrame * C.step);
    const inp = input();
    if (state !== 'over') {                                    // lane change on a flipper press
      if (inp.left && !prevIn.left) laneChange(-1);
      if (inp.right && !prevIn.right) laneChange(1);
    }
    prevIn = { left: !!inp.left, right: !!inp.right };
    let n = 0;
    while (acc >= C.step) { acc -= C.step; onEvents(world.step(inp)); n++; steps++; }
    return n;
  }
  function draw() {
    RD.draw(world, { lit, flash, now: performance.now(), ready: state === 'ready' && inLane(),
      mission: ms.cur && ms.cur.id, holeLit: !ms.cur, saveOn: state === 'play' && world.t < saveUntil });
  }
  function frame(ts) {
    raf = 0;
    if (paused || state === 'over') return;
    const fms = 1000 / (Number(S.get('fpsLimit')) || 30);
    if (!last) last = ts;
    if (ts - last >= fms - 1) {
      simulate((ts - last) / 1000); last = ts; frames++; draw();
    }
    raf = requestAnimationFrame(frame);
  }
  function setPaused(p, silent) {
    paused = !!p && state !== 'over';
    $('pause').hidden = !paused; $('pauseBtn').textContent = paused ? 'Resume' : 'Pause';
    if (paused) { keys.left = keys.right = keys.plunger = false; touches.clear(); cancelAnimationFrame(raf); raf = 0; draw(); saveGame(); }
    else if (!raf && state !== 'over') { last = 0; raf = requestAnimationFrame(frame); }
    if (!silent) hud();
  }

  // ---- input ----
  const KEYMAP = { KeyZ: 'left', ArrowLeft: 'left', Slash: 'right', ArrowRight: 'right', Space: 'plunger', ArrowDown: 'plunger' };
  document.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT')) return;
    const k = KEYMAP[e.code] || (e.key === '/' ? 'right' : e.key === 'z' || e.key === 'Z' ? 'left' : '');
    if (k) {
      e.preventDefault();
      if (paused && !e.repeat && k !== 'plunger') setPaused(false);
      keys[k] = true; return;
    }
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { if (!$('help').hidden) $('help').hidden = true; else setPaused(!paused); }
    else if (e.key === 'n' || e.key === 'N' || (e.key === 'Enter' && state === 'over')) newGame();
  });
  document.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code] || (e.key === '/' ? 'right' : e.key === 'z' || e.key === 'Z' ? 'left' : '');
    if (k) keys[k] = false;
  });
  const wrap = $('boardWrap');
  function zone(x, y) {
    if (x > innerWidth * 0.6 && y > innerHeight * 0.72 && inLane()) return 'plunger';
    return x < innerWidth / 2 ? 'left' : 'right';
  }
  wrap.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (paused) { setPaused(false); return; }
    touches.set(e.pointerId, zone(e.clientX, e.clientY));
    try { wrap.setPointerCapture(e.pointerId); } catch (_) {}
  });
  const lift = (e) => touches.delete(e.pointerId);
  wrap.addEventListener('pointerup', lift); wrap.addEventListener('pointercancel', lift); wrap.addEventListener('lostpointercapture', lift);
  wrap.addEventListener('contextmenu', (e) => e.preventDefault());
  $('pause').addEventListener('pointerdown', (e) => { e.preventDefault(); setPaused(false); });
  $('pauseBtn').onclick = () => setPaused(!paused);
  $('newBtn').onclick = () => newGame();
  $('againBtn').onclick = () => newGame();
  $('helpBtn').onclick = () => { setPaused(true); $('help').hidden = false; };
  $('helpClose').onclick = () => { $('help').hidden = true; };
  $('help').addEventListener('pointerdown', (e) => { if (e.target === $('help')) $('help').hidden = true; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });
  window.addEventListener('blur', () => { if (S.get('autoPause') !== false) setPaused(true); });
  window.addEventListener('pagehide', () => saveGame());

  // ---- theme + layout ----
  function applyTheme() { document.documentElement.classList.toggle('dark', S.isDark()); if (world) draw(); }
  S.onChange((ch) => { if ('theme' in ch) applyTheme(); if ('lowGraphics' in ch) fit(); });
  if (window.matchMedia) { const mq = matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', applyTheme); }
  RD.init($('board'));
  const fit = () => { RD.resize(wrap); if (world) draw(); };
  window.addEventListener('resize', fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(wrap);
  const gear = S.mountGear($('gearSlot'));
  if (!gear) $('gearSlot').remove();

  applyTheme(); fit(); newGame(true);
  // for tests
  window.PBGame = {
    get world() { return world; },
    state: () => ({ state, ball, score, best, paused, lit: Object.assign({}, lit), steps, frames, loop: !!raf, inLane: inLane(),
      mult, bonus, lastBonus, rank: MS.rankName(ms), ms: JSON.parse(JSON.stringify(ms)), msg, saves, saveOn: state === 'play' && world.t < saveUntil, t: world.t,
      b: world.ball && { x: world.ball.x, y: world.ball.y, vx: world.ball.vx, vy: world.ball.vy, live: world.ball.live, mode: world.ball.mode } }),
    run: (sec, inp) => { const save = Object.assign({}, keys); if (inp) Object.assign(keys, inp); const n = simulate(sec); Object.assign(keys, save); return n; },
    newGame, pause: () => setPaused(true), resume: () => setPaused(false), drainNow: () => drained(), zone, save: saveGame,
    events: (list) => onEvents(list),
  };
})();
