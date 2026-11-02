/*
 * Game of Life — controller (LIFE-1). Wires the simulation, renderer, settings and DOM.
 * Loop: requestAnimationFrame, drawing at most 30fps (or lower shared fpsLimit); generations
 * advance on real elapsed time at the slider's rate (several steps per frame if needed).
 * Input: Draw mode = tap / drag paints (first cell decides paint or erase); Pan mode = drag pans.
 * Two fingers always pinch-zoom + pan; mouse wheel zooms. With a pattern picked, a tap places it.
 * Saves speed + grid in localStorage (LIFE_CONFIG.storeKey).
 */
(() => {
  const CFG = LIFE_CONFIG, S = LIFE_SETTINGS, R = LifeRender;
  const $ = (id) => document.getElementById(id);
  const world = LifeCore.create(CFG.cols, CFG.rows);

  // ---- saved state ----
  let saved = { speed: CFG.speed.def, grid: '' };
  try { saved = Object.assign(saved, JSON.parse(localStorage.getItem(CFG.storeKey)) || {}); } catch (_) {}
  let saveTimer = 0;
  const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => {
    try { localStorage.setItem(CFG.storeKey, JSON.stringify({ speed, grid: world.dump() })); } catch (_) {}
  }, 400); };

  let running = false, speed = saved.speed, dirty = true, stepAcc = 0;
  if (!world.load(saved.grid)) world.stamp(LifePatterns.get('glider'), 10, 10);

  // ---- UI ----
  function ui() {
    $('playBtn').textContent = running ? 'Pause' : 'Play';
    $('gen').textContent = world.gen;
    $('pop').textContent = world.count();
    $('speedVal').textContent = speed + '/s';
    $('modeBtn').textContent = mode === 'draw' ? '✏️ Draw' : '✋ Pan';
  }
  const changed = () => { dirty = true; ui(); save(); };
  function setRunning(v) { running = v; stepAcc = 0; ui(); }
  function step() { world.step(); changed(); }

  $('playBtn').onclick = () => setRunning(!running);
  $('stepBtn').onclick = () => { setRunning(false); step(); };
  $('clearBtn').onclick = () => { setRunning(false); world.clear(); changed(); };
  $('randBtn').onclick = () => { world.random(CFG.randomFill); changed(); };
  const sp = $('speed'); sp.min = CFG.speed.min; sp.max = CFG.speed.max; sp.value = speed;
  sp.oninput = () => { speed = +sp.value; ui(); save(); };

  // pattern picker: "Place at centre" stamps now; otherwise the next tap places it
  const pat = $('patSel');
  for (const [id, name] of Object.entries(LifePatterns.NAMES)) pat.add(new Option(name, id));
  let pending = null;
  pat.onchange = () => { pending = pat.value || null; $('hint').textContent = pending ? 'Tap the grid to place it' : ''; };
  $('centreBtn').onclick = () => {
    const id = pat.value || 'glider';
    world.stamp(LifePatterns.get(id), CFG.cols >> 1, CFG.rows >> 1);
    pending = null; pat.value = ''; $('hint').textContent = ''; changed();
  };

  let mode = 'draw';
  $('modeBtn').onclick = () => { mode = mode === 'draw' ? 'pan' : 'draw'; ui(); };

  // ---- pointer input (draw / pan / pinch) ----
  const cv = $('grid'); R.init(cv);
  const pts = new Map(); let paintVal = 1, lastCell = null, pinch = null, panLast = null;
  const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  function paint(px, py) {
    const c = R.cellAt(world, px, py); if (!c) return;
    if (lastCell && lastCell[0] === c[0] && lastCell[1] === c[1]) return;
    lastCell = c; world.set(c[0], c[1], paintVal); changed();
  }
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, local(e));
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }; lastCell = null; return; }
    const [px, py] = local(e);
    if (pending) { const c = R.cellAt(world, px, py); if (c) { world.stamp(LifePatterns.get(pending), c[0], c[1]); changed(); } return; }
    if (mode === 'pan' || e.button === 1 || e.button === 2) { panLast = [px, py]; return; }
    const c = R.cellAt(world, px, py); if (!c) return;
    paintVal = world.get(c[0], c[1]) ? 0 : 1; lastCell = null; paint(px, py);
  });
  cv.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, local(e));
    if (pinch && pts.size >= 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      R.pan(world, m[0] - pinch.m[0], m[1] - pinch.m[1]); R.zoomAt(world, d / (pinch.d || d), m[0], m[1]);
      pinch = { d, m }; dirty = true; return;
    }
    const [px, py] = local(e);
    if (panLast) { R.pan(world, px - panLast[0], py - panLast[1]); panLast = [px, py]; dirty = true; }
    else if (lastCell && !pending) paint(px, py);
  });
  const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) { panLast = null; lastCell = null; if (pending) { pending = null; pat.value = ''; $('hint').textContent = ''; } } };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('wheel', (e) => { e.preventDefault(); const [px, py] = local(e); R.zoomAt(world, e.deltaY < 0 ? 1.15 : 1 / 1.15, px, py); dirty = true; }, { passive: false });
  cv.addEventListener('dblclick', () => { R.resetView(world); dirty = true; });
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ') { e.preventDefault(); setRunning(!running); } else if (e.key === 's') $('stepBtn').click();
  });

  // ---- loop: 30fps cap, generations on real time ----
  let last = performance.now(), acc = 0;
  const frameMs = () => 1000 / Math.min(CFG.maxFps, Number(S.get('fpsLimit')) || 30);
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(250, now - last); last = now; acc += dt;
    if (acc < frameMs() - 1) return;
    const el = acc; acc = 0;
    if (running) {
      stepAcc += el * speed / 1000;
      let n = Math.min(Math.floor(stepAcc), 10);        // never more than 10 steps per frame
      stepAcc -= Math.floor(stepAcc);
      if (n) { while (n--) world.step(); dirty = true; ui(); save(); }
    }
    if (dirty) { R.draw(world); dirty = false; }
  }

  // ---- theme, layout, gear, autoPause ----
  const applyTheme = () => { document.documentElement.classList.toggle('dark', S.isDark()); dirty = true; };
  S.onChange((ch) => { if ('theme' in ch) applyTheme(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && S.get('autoPause')) setRunning(false); });
  const wrap = $('gridWrap'), fit = () => { R.resize(wrap, world); dirty = true; };
  window.addEventListener('resize', fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(wrap);
  if (!S.mountGear($('gearSlot'))) $('gearSlot').remove();

  applyTheme(); fit(); ui(); requestAnimationFrame(loop);
  window.LifeGame = { world, step, setRunning, stamp: (id, x, y) => { world.stamp(LifePatterns.get(id), x, y); changed(); } }; // for tests
})();
