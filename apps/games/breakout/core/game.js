/* BRK-1 — browser controller: fixed 60 Hz simulation, independent draw cap,
 * keyboard/pointer input, pause cards, periodic saves. Debug hooks only ?test=1. */
'use strict';
(() => {
  const $ = id => document.getElementById(id), S = BRK.settings, C = BRK.C;
  const renderer = new BRK.Renderer($('board'), $('boardWrap'));
  const restored = BRK.store.load();
  let model = restored || new BRK.Model(), best = BRK.store.best();
  let paused = false, help = false, returnToPause = false, keys = new Set();
  let last = performance.now(), accumulator = 0, lastDraw = 0, saveClock = 0, pointer = null;
  let message = 'Ready to launch', messageUntil = 0;
  const names = { wide: 'Wider paddle', multi: 'Multi-ball', slow: 'Slow ball', laser: 'Laser', life: 'Extra life' };
  function save() {
    if (model.score > best) { best = model.score; BRK.store.write('best', best); }
    BRK.store.save(model);
  }
  function ui() {
    for (const k of ['score', 'level', 'lives']) $(k).textContent = model[k].toLocaleString();
    $('best').textContent = best.toLocaleString();
    $('launchBtn').disabled = model.mode !== 'ready' || paused;
    $('pauseBtn').disabled = model.mode === 'over';
    $('status').textContent = performance.now() < messageUntil ? message :
      model.mode === 'ready' ? 'Ready to launch' : model.mode === 'over' ? 'Game over' : 'Clear every coloured brick';
    $('powers').textContent = Object.keys(model.buffs).filter(k => model.buffs[k] > 0)
      .map(k => names[k] + ' ' + Math.ceil(model.buffs[k]) + 's').join(' · ');
    const muted = !S.get('sfx');
    $('muteBtn').textContent = muted ? 'Unmute' : 'Mute';
    $('muteBtn').setAttribute('aria-pressed', String(muted));
    document.querySelector('.keys').hidden = !S.get('showHints');
  }
  function setPaused(value, loaded = false) {
    if (model.mode === 'over') return;
    paused = value;
    keys.clear(); pointer = null; accumulator = 0;
    $('pause').hidden = !value;
    $('pauseTitle').textContent = loaded ? 'Welcome back' : 'Paused';
    $('pauseInfo').textContent = `Level ${model.level} · Score ${model.score.toLocaleString()} · ${model.lives} lives`;
    if (value) { save(); $('resumeBtn').focus(); }
    else { last = performance.now(); $('pauseBtn').focus(); }
    ui();
  }
  function showHelp() {
    returnToPause = paused;
    if (model.mode !== 'over') setPaused(true);
    $('pause').hidden = true; $('help').hidden = false; help = true;
    $('helpClose').focus();
  }
  function closeHelp() {
    help = false; $('help').hidden = true;
    if (model.mode !== 'over') setPaused(returnToPause);
    else $('againBtn').focus();
  }
  function fresh() {
    model = new BRK.Model(); paused = false; help = false;
    keys.clear(); pointer = null; accumulator = 0; renderer.particles = [];
    for (const id of ['pause', 'help', 'over']) $(id).hidden = true;
    message = 'Ready to launch'; messageUntil = 0;
    save(); ui(); renderer.draw(model); $('launchBtn').focus();
  }
  function over() {
    $('over').hidden = false;
    $('overInfo').textContent = `Level ${model.level} · Score ${model.score.toLocaleString()} · Best ${best.toLocaleString()}`;
    $('againBtn').focus();
  }
  function events() {
    // Cap simultaneous audio nodes on a dense multi-ball hit.
    const sounds = new Set();
    for (const e of model.events.splice(0)) {
      sounds.add(e.type);
      if (e.type === 'break') renderer.burst(e);
      if (e.type === 'power' || e.type === 'level' || e.type === 'lost') {
        message = e.type === 'power' ? names[e.power] + ' collected' :
          e.type === 'level' ? `Level ${e.level} — ready to launch` : 'Ball lost — launch again';
        messageUntil = performance.now() + 2600;
      }
      if (e.type === 'over') { save(); over(); }
      if (e.type === 'level' || e.type === 'lost') save();
    }
    for (const sound of sounds) BRK.sound.play(sound);
    if (model.score > best) { best = model.score; BRK.store.write('best', best); }
  }
  function launch() { BRK.sound.unlock(); if (!paused && !help) { model.launch(); events(); ui(); } }
  $('launchBtn').onclick = launch;
  $('pauseBtn').onclick = () => setPaused(!paused);
  $('resumeBtn').onclick = () => { BRK.sound.unlock(); setPaused(false); };
  for (const id of ['newBtn', 'pauseNewBtn', 'againBtn']) $(id).onclick = fresh;
  for (const id of ['helpBtn', 'pauseHelpBtn']) $(id).onclick = showHelp;
  $('helpClose').onclick = closeHelp;
  // Local fallback if the shared library was unavailable: never prevents play.
  let localMute = false;
  const originalGet = S.get;
  S.get = k => k === 'sfx' && !window.GameSettings ? !localMute : originalGet(k);
  $('muteBtn').onclick = () => {
    BRK.sound.unlock();
    if (window.GameSettings) window.GameSettings.set('sfx', !S.get('sfx'));
    else localMute = !localMute;
    ui();
  };
  const gear = S.gear($('gearSlot'));
  if (gear) gear.addEventListener('click', () => { if (model.mode !== 'over') setPaused(true); save(); });
  S.onChange(ui);
  addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if (['arrowleft', 'arrowright', 'a', 'd', ' ', 'p', 'escape'].includes(key)) {
      // Keep Space/Enter native activation on buttons and links.
      if (key === ' ' && /^(BUTTON|A)$/.test(document.activeElement.tagName)) return;
      e.preventDefault();
      BRK.sound.unlock();
      if (key === 'p' || key === 'escape') {
        if (!e.repeat) { if (help) closeHelp(); else setPaused(!paused); }
      } else if (!paused && !help) {
        keys.add(key);
        if (key === ' ' && !e.repeat) launch();
      }
    }
    // Trap tab focus in the visible modal card.
    if (key === 'tab') {
      const modal = [...document.querySelectorAll('.overlay')].reverse().find(el => !el.hidden);
      if (!modal) return;
      const buttons = [...modal.querySelectorAll('button,a')];
      const first = buttons[0], end = buttons[buttons.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); end.focus(); }
      else if (!e.shiftKey && document.activeElement === end) { e.preventDefault(); first.focus(); }
    }
  });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  const canvas = $('board');
  canvas.addEventListener('pointerdown', e => {
    if (paused || help || model.mode === 'over' || (pointer !== null && pointer !== e.pointerId)) return;
    e.preventDefault(); BRK.sound.unlock(); pointer = e.pointerId;
    canvas.setPointerCapture(e.pointerId); model.movePaddle(renderer.point(e.clientX));
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  canvas.addEventListener('pointermove', e => {
    if (paused || help || model.mode === 'over') return;
    if (e.pointerType === 'mouse' || pointer === e.pointerId) {
      e.preventDefault(); model.movePaddle(renderer.point(e.clientX));
    }
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(name, e => {
    if (pointer === e.pointerId) pointer = null;
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { setPaused(true); save(); } });
  addEventListener('blur', () => { keys.clear(); pointer = null; if (S.get('autoPause')) setPaused(true); });
  addEventListener('pagehide', save);
  new ResizeObserver(() => { renderer.fit(); renderer.draw(model); }).observe($('boardWrap'));
  addEventListener('resize', () => { renderer.fit(); renderer.draw(model); });
  function frame(now) {
    const dt = Math.min(.1, Math.max(0, (now - last) / 1000)); last = now;
    if (!paused && !help && model.mode !== 'over') {
      accumulator += dt;
      while (accumulator >= C.step) {
        const direction = Number(keys.has('arrowright') || keys.has('d')) - Number(keys.has('arrowleft') || keys.has('a'));
        model.movePaddle(model.paddle.x + direction * 470 * C.step);
        model.tick(C.step); renderer.update(C.step); accumulator -= C.step;
      }
      events();
      if ((saveClock += dt) >= 1) { save(); saveClock = 0; }
    }
    const cap = S.get('fpsLimit') || 60;
    if (now - lastDraw >= 1000 / cap - .5) { renderer.draw(model); ui(); lastDraw = now; }
    requestAnimationFrame(frame);
  }
  ui(); renderer.draw(model);
  if (restored && model.mode !== 'over') setPaused(true, true);
  if (model.mode === 'over') over();
  requestAnimationFrame(frame);
  if (new URLSearchParams(location.search).get('test') === '1') {
    window.breakoutTest = { get model() { return model; }, get paused() { return paused; },
      setModel(m) { model = m; }, pause: setPaused, save, fresh, renderer, events,
      step(n = 1) { for (let i = 0; i < n; i++) model.tick(C.step); events(); ui(); renderer.draw(model); } };
  }
})();
