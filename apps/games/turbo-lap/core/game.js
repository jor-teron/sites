/* Turbo Lap — game state machine: title -> countdown -> race -> finished (+ pause overlay). */
window.TL = window.TL || {};
(() => {
  const CFG = TL.CFG, U = TL.util, road = TL.road, input = TL.input;
  const $ = id => document.getElementById(id);

  const G = TL.game = {
    state: 'title', paused: false, t: 0, raceTime: 0, countdown: 0,
    player: null, ais: [], racers: [], finishOrder: [], result: null, finishT: 0, goT: 0,
    circuit: 0, laps: CFG.laps, demoActive: false, tookOver: false, pickerFrom: 'title'
  };

  function track() { return road.track; }

  G.init = function () {
    TL.themes.mode = TL.storage.theme();
    TL.carSet.setCar(TL.storage.car(), false); TL.carSet.setSwatch(TL.storage.carColor(), false);       // saved garage pick (bad values fall back)
    G.setCircuit(TL.storage.circuit(), false);
    input.on('start', onStart);
    input.on('padA', onStart);
    input.on('pause', onPause);
    input.on('title', () => { if (!modal(G.panel) && (G.paused || G.state === 'finished')) G.toTitle(); });
    input.on('padB', () => { if (G.panel === 'cars') G.closeCars(); else if (G.panel === 'themes') G.closeThemes(); else if (G.panel === 'picker') G.closePicker(); else if (G.paused || (G.state === 'finished' && G.finishT > CFG.finishOverlayDelay)) G.toTitle(); });
    input.on('prevCircuit', () => { if (G.state === 'title' && G.panel === 'title') G.stepCircuit(-1); });
    input.on('nextCircuit', () => { if (G.state === 'title' && G.panel === 'title') G.stepCircuit(1); });
    input.on('circuits', () => { if (G.panel === 'picker') G.closePicker(); else if (G.panel === 'title' || G.panel === 'finish') G.openPicker(); });
    input.on('themes', () => { if (G.panel === 'themes') G.closeThemes(); else G.openThemes(); });
    input.on('cars', () => { if (G.panel === 'cars') G.closeCars(); else G.openCars(); });
    input.on('control', takeOver);
    input.on('fps', toggleFps);
    input.on('blur', () => { if (G.state === 'race' || G.state === 'countdown') setPaused(true); });
    bindButtons();
    if (window.TURBO_LAP_TEST) installTestHook();
    G.toTitle();
  };

  // Pick a circuit (0..99): builds its road and grid. save=false keeps the stored pick untouched (first load).
  G.setCircuit = function (n, save) {
    n = TL.circuits.clampN(n);
    const t = TL.circuits.get(n);
    G.circuit = n; G.laps = t.laps;
    road.build(t);
    TL.themes.apply(n);                                   // Auto: the theme for this circuit; a fixed pick stays
    if (save !== false) TL.storage.setCircuit(n);
    G.setupGrid();
    refreshTitle();
  };
  G.stepCircuit = function (d) {
    const n = TL.circuits.clampN(G.circuit + d);
    if (n !== G.circuit) G.setCircuit(n);
  };
  G.pickCircuit = function (n) { G.setCircuit(n); G.toTitle(); };
  G.openPicker = function () {
    if (G.panel !== 'title' && G.panel !== 'finish') return;
    G.pickerFrom = G.panel; showPanel('picker');
    if (TL.picker) TL.picker.open();
  };
  G.closePicker = function () {
    if (G.panel !== 'picker') return;
    showPanel(G.pickerFrom || 'title');
    if (G.pickerFrom === 'finish') fillFinish();
  };

  // Themes panel (ui/themes.js): from the title, pause or finish card, or on the road (pauses a running race while it is open).
  G.openThemes = function () {
    if (G.panel === 'themes' || G.panel === 'picker' || G.panel === 'cars') return;
    if (G.panel == null && (G.state === 'race' || G.state === 'countdown')) setPaused(true);      // the race waits (its pause card shows again on close)
    G.themesFrom = G.panel;                                                                         // null: back to the road (finish delay)
    showPanel('themes');
    if (TL.themePicker) TL.themePicker.open();
  };
  G.closeThemes = function () {
    if (G.panel !== 'themes') return;
    showPanel(G.themesFrom);
    if (G.themesFrom === 'finish') fillFinish();
    const b = $('themeBtn'); if (b) b.blur();
  };
  // pick a look ('auto' or a theme id) for the whole game and close the panel
  G.pickTheme = function (mode) { TL.themes.setMode(mode, G.circuit); refreshTitle(); G.closeThemes(); };

  // Car garage (ui/cars.js, TLQ1a): the same way as the themes panel (title / pause / finish card, or on the road: pauses a running race).
  G.openCars = function () {
    if (modal(G.panel)) return;
    if (G.panel == null && (G.state === 'race' || G.state === 'countdown')) setPaused(true);
    G.carsFrom = G.panel;
    showPanel('cars');
    if (TL.carPicker) TL.carPicker.open();
  };
  G.closeCars = function () {
    if (G.panel !== 'cars') return;
    showPanel(G.carsFrom);
    if (G.carsFrom === 'finish') fillFinish();
  };
  // a car pick: applies and saves, closes the panel. (Looks only: the player record keeps the same physics.)
  G.pickCar = function (id) { TL.carSet.setCar(id); refreshTitle(); G.closeCars(); };
  G.pickCarColor = function (id) { TL.carSet.setSwatch(id); if (G.player) G.player.color = TL.carSet.color(); };

  // Grid: two cars per row, player alone at the back.
  G.setupGrid = function () {
    const segL = CFG.segmentLength, gap = CFG.gridSpacing * segL;
    G.ais = TL.opponents ? TL.opponents.create(track().opponents.map((o, i) => ({
      ...o, p: -(1 + Math.floor(i / 2)) * gap - (i % 2) * segL, x: i % 2 ? 0.45 : -0.45
    }))) : [];
    const rows = Math.ceil(G.ais.length / 2);
    G.player = TL.cars.createPlayer(-(1 + rows) * gap);
    if (TL.carSet) TL.carSet.dress(G.ais, G.circuit);               // each rival gets its own model and paint, from the circuit number (no Math.random)
    G.racers = [G.player, ...G.ais];
    G.racers.forEach(r => { r.finished = false; r.finishTime = null; r.lapTimes = []; r.lapStart = 0; r.lap = 0; });
    G.finishOrder = []; G.raceTime = 0; G.result = null; G.finishT = 0;
    updatePositions();
  };

  G.toTitle = function () {
    G.state = 'title'; setPaused(false);
    G.setupGrid();
    showPanel('title');
    refreshTitle();
  };

  G.startRace = function () {
    G.setupGrid();
    G.state = 'countdown';
    G.demoActive = !!track().demo; G.tookOver = false;      // circuit 00: the car drives itself until you take over
    G.countdown = 3 * CFG.countdownStep;
    G.goT = 0;
    setPaused(false);
    showPanel(null);
  };

  // any control key, pad press or touch takes the wheel from the circuit 00 autopilot; the race is then yours
  function takeOver() {
    if (!G.demoActive || G.paused || (G.state !== 'countdown' && G.state !== 'race')) return;
    G.demoActive = false; G.tookOver = true;
  }

  function modal(p) { return p === 'picker' || p === 'themes' || p === 'cars'; }
  function onStart() {
    if (modal(G.panel)) return;
    if (G.paused) return setPaused(false);
    if (G.state === 'title') G.startRace();
    else if (G.state === 'finished' && G.finishT > CFG.finishOverlayDelay) G.startRace();
  }
  function onPause() {
    if (G.panel === 'themes' || G.panel === 'cars') return;
    if (G.state === 'race' || G.state === 'countdown') setPaused(!G.paused);
  }
  function setPaused(p) {
    G.paused = p;
    if (p) showPanel('pause'); else if (G.state === 'race' || G.state === 'countdown') showPanel(null);
  }
  function toggleFps() {
    const o = CFG.fpsOptions, f = o[(o.indexOf(TL.view.fps) + 1) % o.length];
    TL.setFps(f); refreshTitle();
  }

  // Lap bookkeeping shared by every racer.
  function checkLaps(r) {
    const L = road.trackLength;
    const lap = r.p < 0 ? 0 : Math.floor(r.p / L) + 1;          // 1-based lap the car is on
    if (lap > r.lap) {
      if (r.lap >= 1) { r.lapTimes.push(G.raceTime - r.lapStart); }
      r.lapStart = G.raceTime;
      r.lap = lap;
      if (lap > G.laps && !r.finished) {
        r.finished = true; r.finishTime = G.raceTime;
        G.finishOrder.push(r);
        r.finalPos = G.finishOrder.length;
      }
    }
  }

  function updatePositions() {
    const order = G.racers.slice().sort((a, b) => {
      if (a.finished && b.finished) return a.finalPos - b.finalPos;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.p - a.p;
    });
    order.forEach((r, i) => { r.pos = i + 1; });
    G.order = order;
  }

  function finishRace() {
    const pl = G.player;
    G.state = 'finished'; G.finishT = 0;
    const best = pl.lapTimes.length ? Math.min(...pl.lapTimes) : null;
    const demo = G.demoActive;                                   // autopilot drove the whole race: not the player's result
    const saved = demo ? { isNewTotal: false, isNewLap: false, records: TL.storage.records(track().id) }
      : TL.storage.saveResult(track().id, pl.finishTime, best, pl.finalPos);
    G.demoActive = false;
    G.result = { pos: pl.finalPos, total: pl.finishTime, bestLap: best, laps: pl.lapTimes.slice(), demo,
                 win: !demo && pl.finalPos <= CFG.circuits.podium, circuit: G.circuit, ...saved };
  }

  G.update = function (dt) {
    G.t += dt;
    if (G.paused) return;
    const pl = G.player, before = pl.p;
    if (G.state === 'title') {
      // attract mode: background drifts slowly
      TL.render.scroll(0.5, dt * 600);
      return;
    }
    if (G.state === 'countdown') {
      G.countdown -= dt;
      if (G.countdown <= 0) { G.state = 'race'; G.goT = 0.9; G.raceTime = 0; }
      return;
    }
    // Race over: every car (player and AI) brakes to a halt and then stays put.
    if (G.state === 'finished') { stopAll(dt); return; }
    // race: everything keeps moving
    G.goT = Math.max(0, G.goT - dt);
    G.raceTime += dt;
    const ctl = G.demoActive ? TL.driver.control(pl, { t: G.raceTime, cap: 0.93, vary: 0.1 }) : input.read();
    TL.cars.updatePlayer(pl, ctl, dt, !pl.finished);
    if (TL.opponents) TL.opponents.update(G.ais, G.racers, pl, dt);
    TL.cars.collide(G.racers, dt);
    G.racers.forEach(checkLaps);
    updatePositions();
    TL.render.scroll(road.findSegment(pl.p).curve, pl.p - before);
    if (G.state === 'race' && pl.finished) finishRace();
  };

  // End of race (state 'finished'): all cars brake smoothly to 0, using real elapsed time (dt).
  // Laps, standings and race time are frozen: no checkLaps / updatePositions / collide here,
  // so a car still rolling can't cross the line and change its lap or place.
  function stopAll(dt) {
    const decel = -CFG.braking * (CFG.finishBrake || 0.6);          // world units/s^2 (braking is negative)
    for (const r of G.racers) {
      r.speed = Math.max(0, r.speed - decel * dt);
      r.braking = r.speed > 0;                                        // brake lights while slowing, off once parked
      r.nitroOn = false;
      if (r.steerVis) r.steerVis *= Math.pow(0.9, dt * 60);           // wheels straighten (real-time smoothing)
      const before = r.p;
      r.p += r.speed * dt;
      if (r.isPlayer) TL.render.scroll(road.findSegment(r.p).curve, r.p - before);
    }
    // finish card appears after a short delay
    const was = G.finishT;
    G.finishT += dt;
    if (was <= CFG.finishOverlayDelay && G.finishT > CFG.finishOverlayDelay) { if (G.panel === 'themes') G.themesFrom = 'finish'; else if (G.panel === 'cars') G.carsFrom = 'finish'; else showPanel('finish'); fillFinish(); }
  }

  G.draw = function (ctx, W, H) {
    TL.render.frame(ctx, W, H, { player: G.player, racers: G.racers, t: G.t });
    if (TL.hud) TL.hud.draw(ctx, W, H, G);
  };

  // ---------- DOM overlay ----------
  function showPanel(name) {
    const ov = $('overlay');
    if (!ov) return;
    ov.classList.toggle('hidden', !name);
    ['title', 'pause', 'finish', 'picker', 'themes', 'cars'].forEach(n => { const el = $('panel-' + n); if (el) el.classList.toggle('hidden', n !== name); });
    G.panel = name;
    const fab = $('themeBtn'); if (fab) fab.classList.toggle('hidden', !!name);        // the floating button shows only on the road
  }
  function refreshTitle() {
    const b = $('fpsBtn'); if (b) b.textContent = 'FPS: ' + TL.view.fps;
    const tn = TL.theme ? 'Theme: ' + (TL.themes.mode === 'auto' ? 'Auto' : TL.theme.name) : '';
    ['themesBtn', 'themesBtn2', 'themesBtn3'].forEach(id => { const el = $(id); if (el) el.firstChild.nodeValue = tn + ' '; });
    const cn = TL.carSet.model().short;
    ['carBtn', 'carBtn2', 'carBtn3'].forEach(id => { const el = $(id); if (el) el.firstChild.nodeValue = 'Car: ' + cn + ' '; });
    const tc = $('titleCircuit'); if (tc) tc.textContent = circuitTitle();
    const tm = $('titleMap'); if (tm && TL.minimap) { tm.src = TL.minimap.url(G.circuit); tm.alt = 'Route of ' + circuitTitle(); }
    const tg = $('titleTag'); if (tg) tg.textContent = tagline();
    const pv = $('prevBtn'), nx = $('nextBtn');
    if (pv) pv.disabled = G.circuit <= 0; if (nx) nx.disabled = G.circuit >= CFG.circuits.count - 1;
    const dm = $('titleDemo'); if (dm) dm.classList.toggle('hidden', !track().demo);
    const r = TL.storage.records(track().id), el = $('titleBest');
    if (el) el.textContent = r.bestTotal != null
      ? 'Best race ' + U.fmtTime(r.bestTotal) + ' · Best lap ' + U.fmtTime(r.bestLap) + ' · Best finish P' + r.bestPos
      : 'No records yet — set one!';
  }
  const circuitTitle = () => TL.circuits.label(G.circuit) + ' · ' + track().name;
  const lapsText = () => G.laps + (G.laps === 1 ? ' lap' : ' laps');
  const tagline = () => lapsText() + ' · ' + G.racers.length + ' cars · you start last. Finish in the top ' + CFG.circuits.podium + ' to win!';
  function fillFinish() {
    const r = G.result; if (!r || !$('finPos')) return;
    const suf = ['', 'st', 'nd', 'rd', 'th', 'th'][r.pos] || 'th';
    $('finPos').textContent = r.pos + suf;
    $('finPos').className = 'pos p' + r.pos;
    const hd = $('finHead'), note = $('finNote');
    if (hd) {
      hd.textContent = r.demo ? 'Autopilot finished' : r.win ? 'You win! Top ' + CFG.circuits.podium + ' finish' : 'Race Finished';
      hd.className = r.demo ? '' : r.win ? 'win' : 'lose';
    }
    if (note) note.textContent = r.demo ? 'The autopilot drove this one, so it does not count. Take the wheel (any control key or touch) to set a time.'
      : r.win ? (r.pos === 1 ? 'First place!' : 'On the podium — P' + r.pos + ' of ' + G.racers.length + '.')
      : 'P' + r.pos + ' of ' + G.racers.length + ' — finish in the top ' + CFG.circuits.podium + ' to win.';
    const fc = $('finCircuit'); if (fc) fc.textContent = circuitTitle() + ' · ' + lapsText();
    const nb = $('nextCircuitBtn');
    if (nb) { nb.disabled = G.circuit >= CFG.circuits.count - 1; nb.firstChild.nodeValue = 'Circuit ' + TL.circuits.pad2(Math.min(G.circuit + 1, CFG.circuits.count - 1)) + ' ▶ '; }
    $('finTotal').textContent = U.fmtTime(r.total) + (r.isNewTotal ? '  ★ NEW BEST' : '');
    $('finLap').textContent = U.fmtTime(r.bestLap) + (r.isNewLap ? '  ★ NEW BEST' : '');
    $('finLaps').textContent = r.laps.map((t, i) => 'Lap ' + (i + 1) + ' ' + U.fmtTime(t)).join(' · ');
    $('finRecord').textContent = 'Records: race ' + U.fmtTime(r.records.bestTotal) + ' · lap ' + U.fmtTime(r.records.bestLap);
  }
  function bindButtons() {
    const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', e => { e.currentTarget.blur(); fn(); }); };
    on('startBtn', () => G.startRace());
    on('fpsBtn', toggleFps);
    on('resumeBtn', () => setPaused(false));
    on('restartBtn', () => G.startRace());
    on('pauseRestartBtn', () => G.startRace());
    on('titleBtn', () => G.toTitle());
    on('prevBtn', () => G.stepCircuit(-1));
    on('nextBtn', () => G.stepCircuit(1));
    on('circuitsBtn', () => G.openPicker());
    on('circuitsBtn2', () => G.openPicker());
    ['themesBtn', 'themesBtn2', 'themesBtn3', 'themeBtn'].forEach(id => on(id, () => G.openThemes()));
    ['carBtn', 'carBtn2', 'carBtn3'].forEach(id => on(id, () => G.openCars()));
    on('nextCircuitBtn', () => { if (G.circuit < CFG.circuits.count - 1) { G.setCircuit(G.circuit + 1); G.startRace(); } });
    on('pauseTitleBtn', () => G.toTitle());
  }

  // ---------- test hook (only when window.TURBO_LAP_TEST is set before load) ----------
  function installTestHook() {
    const opt = window.TURBO_LAP_TEST;
    if (opt.autopilot === false) return;
    input.autopilot = function () {
      const pl = G.player, segL = CFG.segmentLength;
      const pct = pl.speed / CFG.maxSpeed;
      const ahead = road.findSegment(pl.p + segL * 8);
      const here = road.findSegment(pl.p);
      const curve = Math.max(Math.abs(here.curve), Math.abs(ahead.curve)) * Math.sign(here.curve || ahead.curve);
      let target = -Math.sign(curve) * 0.3;                          // hug the inside a little
      for (const c of G.ais) {                                       // dodge a car just ahead
        const gap = U.mod(c.p - pl.p, road.trackLength);
        if (gap < segL * 10 && Math.abs(c.x - pl.x) < 0.45) { target = c.x > 0 ? c.x - 0.6 : c.x + 0.6; break; }
      }
      const need = pct * here.curve * CFG.centrifugal;               // steer needed to hold the line
      const steer = U.clamp(need + (target - pl.x) * 3, -1, 1);
      const tooFast = Math.abs(need) > 0.95 || Math.abs(pl.x) > 0.95;
      return { steer, gas: !tooFast || pct < 0.6, brake: false, nitro: !!opt.nitro && Math.abs(curve) < 1 && pl.nitro > 0.5 };
    };
  }
})();
