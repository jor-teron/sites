/*
 * Star Pinball — game controller (PIN-1a). Wires physics, renderer, input, settings and the page.
 * States: 'ready' (ball on the plunger) → 'play' → drain → next ball … after 3 balls 'over'.
 * Loop: requestAnimationFrame, drawing at the shared fpsLimit; each drawn frame runs the physics for
 * the real time since the last one in fixed 1/1440 s sub-steps (24 at 60 fps, 48 at 30 fps).
 * The loop stops while paused or after the game ends, so it costs nothing then.
 * Pauses when the tab is hidden (and on window blur when the shared autoPause is on).
 * Controls: Z / ← left flipper, / / → right flipper, Space / ↓ plunger (hold, release), P / Esc pause,
 * N new game. Touch: hold the left or right half of the screen; hold the bottom-right to pull the
 * plunger while the ball waits in the launch lane.
 * High score: localStorage PB_CONFIG.bestKey ('pinball.best').
 */
(() => {
  const C = PB_CONFIG, T = PB_TABLE, S = PB_SETTINGS, PH = PBPhysics, RD = PBRender, SC = C.score;
  const $ = (id) => document.getElementById(id);

  let world, state = 'ready', ball = 1, score = 0, paused = false, raf = 0, last = 0, acc = 0, drainTimer = 0;
  let lit = {}, flash = {}, steps = 0, frames = 0;
  let best = 0; try { best = Number(localStorage.getItem(C.bestKey)) || 0; } catch (_) {}
  const keys = { left: false, right: false, plunger: false };
  const touches = new Map();                                   // pointerId → 'left' | 'right' | 'plunger'
  const input = () => {
    const o = { left: keys.left, right: keys.right, plunger: keys.plunger };
    for (const z of touches.values()) o[z] = true;
    return o;
  };
  const inLane = () => world.ball && world.ball.live && world.ball.x > T.playMaxX;

  function newGame() {
    clearTimeout(drainTimer);
    world = PH.create(); PH.newBall(world);
    state = 'ready'; ball = 1; score = 0; lit = {}; flash = {}; acc = 0;
    $('over').hidden = true;
    hud(); setPaused(false, true);
  }
  function hud() {
    $('score').textContent = score.toLocaleString('en');
    $('ball').textContent = state === 'over' ? '–' : ball + ' / ' + C.balls;
    $('best').textContent = best.toLocaleString('en');
  }
  const add = (n) => { score += n; hud(); };

  function onEvents(ev) {
    for (const e of ev) {
      if (e.type === 'bumper') { add(SC.bumper); flash[e.id] = performance.now(); }
      else if (e.type === 'sling') { add(SC.sling); flash['sling' + (T.walls[e.id].a[0] < 280 ? 0 : 1)] = performance.now(); }
      else if (e.type === 'sensor') {
        if (e.kind === 'top') {
          add(SC.topLane); lit[e.id] = true;
          if (lit.L1 && lit.L2 && lit.L3) { add(SC.allLanes); lit = {}; }
        } else if (e.kind === 'in') add(SC.inlane); else if (e.kind === 'out') add(SC.outlane);
      } else if (e.type === 'drain' || e.type === 'escape') drained();
    }
    if (state === 'ready' && world.ball.live && !inLane()) state = 'play';
  }
  function drained() {
    if (state === 'drain' || state === 'over') return;
    state = 'drain'; S.vibrate(80);
    drainTimer = setTimeout(() => {
      if (ball >= C.balls) return gameOver();
      ball++; PH.newBall(world); state = 'ready'; hud();
    }, C.drainDelayMs);
  }
  function gameOver() {
    state = 'over';
    const rec = score > best;
    if (rec) { best = score; try { localStorage.setItem(C.bestKey, String(best)); } catch (_) {} }
    $('overText').textContent = (rec && score ? 'New high score! ' : 'Game over. ') + 'Score ' + score.toLocaleString('en');
    $('over').hidden = false; hud(); draw();
  }

  /** Advance the physics by `sec` of real time in fixed sub-steps. */
  function simulate(sec) {
    acc += Math.min(sec, C.maxStepsPerFrame * C.step);
    const inp = input();
    let n = 0;
    while (acc >= C.step) { acc -= C.step; onEvents(world.step(inp)); n++; steps++; }
    return n;
  }
  function draw() { RD.draw(world, { lit, flash, now: performance.now(), ready: state === 'ready' && inLane() }); }
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
    if (paused) { keys.left = keys.right = keys.plunger = false; touches.clear(); cancelAnimationFrame(raf); raf = 0; draw(); }
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

  applyTheme(); fit(); newGame();
  // for tests
  window.PBGame = {
    get world() { return world; },
    state: () => ({ state, ball, score, best, paused, lit: Object.assign({}, lit), steps, frames, loop: !!raf, inLane: inLane(),
      b: world.ball && { x: world.ball.x, y: world.ball.y, vx: world.ball.vx, vy: world.ball.vy, live: world.ball.live } }),
    run: (sec, inp) => { const save = Object.assign({}, keys); if (inp) Object.assign(keys, inp); const n = simulate(sec); Object.assign(keys, save); return n; },
    newGame, pause: () => setPaused(true), resume: () => setPaused(false), drainNow: () => drained(), zone,
  };
})();
