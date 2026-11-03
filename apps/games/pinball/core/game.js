/*
 * Star Pinball — game controller (PIN-1a; targets, missions, bonus, ball save, panel, resume PIN-1b; nudge, tilt, sound, effects PIN-1c).
 * Wires physics, missions, renderer, input, settings and the page.
 * States: 'ready' (ball on the plunger) → 'play' → 'drain' → next ball … after 3 balls 'over'.
 * Loop: requestAnimationFrame, drawing at the shared fpsLimit; each drawn frame runs the physics for
 * the real time since the last one in fixed 1/1440 s sub-steps (24 at 60 fps, 48 at 30 fps).
 * The loop stops while paused or after the game ends, so it costs nothing then.
 * Pauses when the tab is hidden (and on window blur when the shared autoPause is on).
 * Controls: Z / ← left flipper, / / → right flipper, Space / ↓ plunger (hold, release), Shift nudge, P / Esc pause,
 * N new game. Touch: hold the left or right half of the screen; hold the bottom-right to pull the
 * plunger while the ball waits in the launch lane. A flipper press also moves the lit star lanes
 * one step left / right (lane change).
 * PIN-1b rules: all 3 star lanes lit → bonus multiplier +1 (up to ×5). Bonus points build up during a
 * ball and are paid × the multiplier when it drains. Ball save: a drain in the first 6 s after a new
 * ball leaves the launch lane gives the ball back (once per ball). Missions + ranks: core/missions.js,
 * started from the hole. The message panel shows rank, score, multiplier, the mission + progress
 * and short messages.
 * PIN-1c: nudge (Left / Right Shift, or an upward swipe on a touch screen) gives the ball a small push;
 * 3 nudges inside 4 s give a tilt warning, 5 a tilt: the flippers stop for the rest of that ball and its
 * bonus is lost. Sounds (ui/sound.js, shared sfx + masterVolume), vibration (bumper, mission, tilt, drain;
 * shared vibration switch), flashes, camera shake on big hits and a light show on missions (all off for
 * Low graphics or the device's reduced-motion setting; shake also follows the shared screenShake).
 * The pause card shows the game so far with Resume / How to play / New game; How to play lists the
 * controls, the missions (from core/missions.js) and the ranks.
 * Storage: high score in 'pinball.best'; the game in progress in 'pinball.save' (score, ball, rank,
 * mission + progress, bonus + multiplier, lit lanes, drop targets), saved at each new ball, on
 * mission changes and when pausing / leaving; reopening the page resumes it with the ball on the
 * plunger. Removed at game over and by New game.
 */
(() => {
  const C = PB_CONFIG, T = PB_TABLE, S = PB_SETTINGS, PH = PBPhysics, RD = PBRender, MS = PBMissions, SND = PBSound, SC = C.score, BN = C.bonus;
  const $ = (id) => document.getElementById(id);

  let world, state = 'ready', ball = 1, score = 0, paused = false, raf = 0, last = 0, acc = 0, drainTimer = 0, msgTimer = 0;
  let lit = {}, flash = {}, steps = 0, frames = 0;
  let mult = 1, bonus = 0, ms = MS.fresh(), saveUntil = 0, saveUsed = false, saves = 0, msg = '', lastBonus = 0;
  let prevIn = { left: false, right: false };
  let nudges = [], lastNudge = -1, warned = false, tilted = false;   // PIN-1c tilt state (this ball)
  const fx = { shakeAt: 0, shakeAmp: 0, showUntil: 0, shakes: 0, shows: 0, flashes: 0 };
  let best = 0; try { best = Number(localStorage.getItem(C.bestKey)) || 0; } catch (_) {}
  const keys = { left: false, right: false, plunger: false };
  const touches = new Map();                                   // pointerId → 'left' | 'right' | 'plunger'
  const input = () => {
    const o = { left: keys.left, right: keys.right, plunger: keys.plunger };
    for (const z of touches.values()) o[z] = true;
    if (tilted) o.left = o.right = false;                      // tilt: the flippers are dead for this ball
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
    saveUntil = 0; saveUsed = false; lastBonus = 0; resetTilt();
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

  // ---- effects (PIN-1c): skipped for Low graphics / reduced motion ----
  const nowMs = () => performance.now();
  function flashOn(id) { if (!S.fxOn()) return; flash[id] = nowMs(); fx.flashes++; }
  function shake(amp) { if (!S.shakeOn()) return; fx.shakeAt = nowMs(); fx.shakeAmp = Math.max(amp, nowMs() - fx.shakeAt < 200 ? fx.shakeAmp : 0); fx.shakes++; }
  function lightShow(ms) { if (!S.fxOn()) return; fx.showUntil = nowMs() + ms; fx.shows++; }

  // ---- nudge + tilt (PIN-1c) ----
  function resetTilt() { nudges = []; warned = false; tilted = false; lastNudge = -1; }
  /** dir: -1 = push the ball left, 1 = right, 0 = straight up (swipe). */
  function nudge(dir) {
    if (paused || state !== 'play' || tilted) return false;
    const t = world.t;
    if (t - lastNudge < C.nudge.gap) return false;
    lastNudge = t;
    PH.nudge(world, dir * C.nudge.side, -C.nudge.up);
    SND.play('nudge'); shake(3);
    nudges = nudges.filter((x) => t - x < C.tilt.window); nudges.push(t);
    if (nudges.length >= C.tilt.tiltAt) {
      tilted = true; saveUntil = 0; keys.left = keys.right = false;
      say('TILT! Flippers off - bonus lost for this ball'); SND.play('tilt'); S.vibrate(250); shake(8);
    } else if (nudges.length >= C.tilt.warnAt && !warned) {
      warned = true; say('Tilt warning! Easy on the nudges'); SND.play('warn'); S.vibrate([40, 60, 40]);
    }
    return true;
  }

  function mission(type) {
    const res = MS.event(ms, type);
    for (const r of res) { if (r.points) add(r.points, BN.mission); }
    if (res.some((r) => r.kind === 'rank')) { SND.play('mission'); setTimeout(() => SND.play('rank'), 400); S.vibrate([60, 40, 60, 40, 120]); lightShow(2200); shake(5); }
    else if (res.some((r) => r.kind === 'complete')) { SND.play('mission'); S.vibrate([60, 40, 60]); lightShow(1500); shake(4); }
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
        case 'bumper': {
          add(SC.bumper, BN.bumper); flashOn(e.id); SND.play('bumper'); S.vibrate(15);
          if (Math.hypot(world.ball.vx, world.ball.vy) > 1800) shake(3);           // a big hit
          mission('bumper'); break;
        }
        case 'sling': add(SC.sling, BN.sling); flashOn('sling' + (T.walls[e.id].a[0] < 280 ? 0 : 1)); SND.play('sling'); mission('sling'); break;
        case 'sensor':
          if (e.kind === 'top') { add(SC.topLane); lit[e.id] = true; if (lit.L1 && lit.L2 && lit.L3) lanesDone(); }
          else if (e.kind === 'in') add(SC.inlane); else if (e.kind === 'out') add(SC.outlane);
          break;
        case 'drop': add(SC.drop, BN.drop); flashOn(e.id); SND.play('drop'); break;
        case 'dropsClear': add(SC.dropsClear); say('Asteroid field cleared! +' + SC.dropsClear.toLocaleString('en')); shake(4); lightShow(700); mission('dropsClear'); break;
        case 'spin': add(SC.spin, BN.spin); SND.play('spin'); mission('spin'); break;
        case 'ramp': add(SC.rampMade, BN.ramp); say('Ramp! +' + SC.rampMade.toLocaleString('en')); SND.play('ramp'); flashOn('ramp'); shake(3); mission('ramp'); break;
        case 'hole': add(SC.hole, BN.hole); SND.play('hole'); flashOn('hole'); mission('hole'); break;
        case 'kick': SND.play('kick'); shake(2); break;
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
    if (state === 'play' && world.t < saveUntil && !saveUsed && !tilted) {      // ball save
      saveUsed = true; saveUntil = 0; saves++; state = 'drain'; say('Ball saved!'); SND.play('save');
      drainTimer = setTimeout(() => { PH.newBall(world); resetTilt(); state = 'ready'; hud(); saveGame(); }, C.drainDelayMs);
      return;
    }
    state = 'drain'; SND.play('drain');
    lastBonus = tilted ? 0 : bonus * mult;
    if (tilted) say('Tilt - no bonus this ball');
    else if (lastBonus) { score += lastBonus; say(`Bonus ${bonus.toLocaleString('en')} × ${mult} = ${lastBonus.toLocaleString('en')}`); }
    bonus = 0; mult = 1; saveUntil = 0; saveUsed = false; resetTilt();
    const lastBall = ball >= C.balls;
    if (!lastBall) { ball++; saveGame(); } else clearSave();
    hud();
    drainTimer = setTimeout(() => {
      if (lastBall) return gameOver();
      PH.newBall(world); state = 'ready'; hud(); saveGame();
    }, C.drainDelayMs);
  }
  function gameOver() {
    state = 'over'; clearSave(); SND.play('over');
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
      if (inp.left && !prevIn.left) { laneChange(-1); SND.play('flipper'); }
      if (inp.right && !prevIn.right) { laneChange(1); SND.play('flipper'); }
    }
    prevIn = { left: !!inp.left, right: !!inp.right };
    let n = 0;
    while (acc >= C.step) { acc -= C.step; onEvents(world.step(inp)); n++; steps++; }
    return n;
  }
  function draw() {
    RD.draw(world, { lit, flash, now: performance.now(), ready: state === 'ready' && inLane(),
      mission: ms.cur && ms.cur.id, holeLit: !ms.cur, saveOn: state === 'play' && world.t < saveUntil, tilted,
      fx: { on: S.fxOn(), shakeAt: fx.shakeAt, shakeAmp: fx.shakeAmp, show: performance.now() < fx.showUntil } });
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
    if (paused) pauseInfo();
    if (paused) { keys.left = keys.right = keys.plunger = false; touches.clear(); cancelAnimationFrame(raf); raf = 0; draw(); saveGame(); }
    else if (!raf && state !== 'over') { last = 0; raf = requestAnimationFrame(frame); }
    if (!silent) hud();
  }

  /** Pause card: the game so far. */
  function pauseInfo() {
    const st = MS.status(ms);
    $('pauseInfo').textContent = `Score ${score.toLocaleString('en')} · Ball ${Math.min(ball, C.balls)} / ${C.balls} · ${MS.rankName(ms)}`;
    $('pauseMission').textContent = ms.cur ? `Mission: ${st.name} - ${st.hint} (${st.progress})` : 'No mission running - shoot the hole to start one';
  }
  /** How to play: missions and ranks from core/missions.js, so the list always matches the game. */
  function fillHelp() {
    const ul = $('helpMissions'); ul.textContent = '';
    for (const m of MS.LIST) { const li = document.createElement('li'); li.innerHTML = '<b></b> '; li.firstChild.textContent = m.name + ':'; li.append(m.what(m.base)); ul.append(li); }
    $('helpRanks').textContent = MS.RANKS.join(' → ');
  }

  // ---- input ----
  const KEYMAP = { KeyZ: 'left', ArrowLeft: 'left', Slash: 'right', ArrowRight: 'right', Space: 'plunger', ArrowDown: 'plunger' };
  document.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT')) return;
    SND.unlock();
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { e.preventDefault(); if (!e.repeat) nudge(e.code === 'ShiftLeft' ? -1 : 1); return; }
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
  const swipes = new Map();                                    // pointerId → { x, y, t } for the swipe-up nudge
  wrap.addEventListener('pointerdown', (e) => {
    e.preventDefault(); SND.unlock();
    if (paused) { setPaused(false); return; }
    touches.set(e.pointerId, zone(e.clientX, e.clientY));
    swipes.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp || performance.now() });
    try { wrap.setPointerCapture(e.pointerId); } catch (_) {}
  });
  wrap.addEventListener('pointermove', (e) => {
    const s = swipes.get(e.pointerId); if (!s) return;
    const dt = (e.timeStamp || performance.now()) - s.t;
    if (dt > 350) { swipes.delete(e.pointerId); return; }
    if (s.y - e.clientY > 50 && Math.abs(e.clientX - s.x) < s.y - e.clientY) {   // a quick flick upwards
      swipes.delete(e.pointerId);
      if (touches.get(e.pointerId) !== 'plunger') touches.delete(e.pointerId);   // a swipe is a nudge, not a held flipper
      nudge(0);
    }
  });
  const lift = (e) => { touches.delete(e.pointerId); swipes.delete(e.pointerId); };
  wrap.addEventListener('pointerup', lift); wrap.addEventListener('pointercancel', lift); wrap.addEventListener('lostpointercapture', lift);
  wrap.addEventListener('contextmenu', (e) => e.preventDefault());
  $('pause').addEventListener('pointerdown', (e) => { if (e.target === $('pause')) { e.preventDefault(); setPaused(false); } });
  $('resumeBtn').onclick = () => setPaused(false);
  $('pHelpBtn').onclick = () => { $('help').hidden = false; };
  $('pNewBtn').onclick = () => newGame();
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

  fillHelp(); applyTheme(); fit(); newGame(true);
  // for tests
  window.PBGame = {
    get world() { return world; },
    state: () => ({ state, ball, score, best, paused, lit: Object.assign({}, lit), steps, frames, loop: !!raf, inLane: inLane(),
      mult, bonus, lastBonus, tilted, warned, nudges: nudges.length, fx: Object.assign({ on: S.fxOn(), shake: S.shakeOn() }, fx), rank: MS.rankName(ms), ms: JSON.parse(JSON.stringify(ms)), msg, saves, saveOn: state === 'play' && world.t < saveUntil, t: world.t,
      b: world.ball && { x: world.ball.x, y: world.ball.y, vx: world.ball.vx, vy: world.ball.vy, live: world.ball.live, mode: world.ball.mode } }),
    run: (sec, inp) => { const save = Object.assign({}, keys); if (inp) Object.assign(keys, inp); const n = simulate(sec); Object.assign(keys, save); return n; },
    newGame, pause: () => setPaused(true), resume: () => setPaused(false), drainNow: () => drained(), zone, save: saveGame,
    events: (list) => onEvents(list), nudge,
  };
})();
