(function () {
  'use strict';
  const D = window.DS, $ = id => document.getElementById(id), PRE = 'learn.driving-school.';
  function read(k, fallback) { try { return JSON.parse(localStorage.getItem(PRE + k)) ?? fallback; } catch (_) { return fallback; } }
  function write(k, v) { try { localStorage.setItem(PRE + k, JSON.stringify(v)); } catch (_) { /* storage unavailable */ } }
  const prefs = Object.assign({ auto: false, side: 'left', muted: false }, read('settings', {})), best = read('best', {});
  let s, last = 0, mirrorTime = 0, noticeText = '', noticeUntil = 0;
  function notice(text) { noticeText = text; noticeUntil = performance.now() + 3000; }
  const keys = new Set(), held = { throttle: 0, brake: 0, clutch: 0, steer: 0 };
  const wheel = $('wheel'), list = $('lessons');
  const definitions = () => D.basics.concat(D.roadLessons(prefs.side), [D.mockDefinition(prefs.side)]);
  function options() {
    list.replaceChildren(...definitions().map(def => {
      const opt = document.createElement('option'); opt.value = def.id;
      opt.textContent = def.name + (best[def.id] != null ? ' · best ' + best[def.id] : ''); return opt;
    }));
  }
  options();
  function reset() {
    const def = definitions().find(d => d.id === list.value) || D.basics[0];
    s = D.session(def, prefs); keys.clear(); Object.keys(held).forEach(k => held[k] = 0);
    $('end-test').hidden = !def.mock; $('lesson-name').textContent = def.name; write('last', def.id); mirrorTime = 0;
  }
  list.value = read('last', 'start'); reset();
  list.onchange = reset; $('retry').onclick = reset;
  $('engine').onclick = () => { if (!D.start(s.c)) notice(s.c.message); };
  $('up').onclick = () => { if (!D.shift(s.c, s.c.gear + 1)) notice(s.c.message); };
  $('down').onclick = () => { if (!D.shift(s.c, s.c.gear - 1)) notice(s.c.message); };
  $('park').onclick = () => { s.c.handbrake = !s.c.handbrake; };
  function indicator(side) { s.c.indicator = s.c.indicator === side ? '' : side; }
  $('left').onclick = () => indicator('left'); $('right').onclick = () => indicator('right');
  $('look').onclick = () => { mirrorTime = s.c.elapsed + 3; };
  function clearInput() { keys.clear(); Object.keys(held).forEach(k => held[k] = 0); }
  function pause() { s.paused = true; clearInput(); if (!$('pause-card').open) $('pause-card').showModal(); }
  $('pause').onclick = pause;
  D.sound.mute(prefs.muted);
  function muteLabel() { $('mute').textContent = prefs.muted ? 'Muted' : 'Sound on'; $('mute').setAttribute('aria-pressed', prefs.muted); }
  muteLabel();
  $('mute').onclick = () => { prefs.muted = !prefs.muted; D.sound.mute(prefs.muted); write('settings', prefs); muteLabel(); };
  $('horn').onclick = () => D.sound.horn();
  window.addEventListener('pointerdown', D.sound.unlock, { passive: true });
  window.addEventListener('keydown', D.sound.unlock);
  function modalOpen() { s.paused = true; clearInput(); }
  for (const id of ['help-card','quiz-card','report-card']) $(id).addEventListener('close', () => { s.paused = false; clearInput(); });
  $('help').onclick = () => { modalOpen(); $('help-card').showModal(); };
  $('close-help').onclick = () => $('help-card').close();
  $('quiz').onclick = () => { modalOpen(); D.showQuiz($('quiz-card'), read('quiz-best', 0), v => write('quiz-best', v)); };
  function report() { modalOpen(); const r = D.testReport(s.l.faults, s.l.done, s.l.elapsed); write('test-last', r); D.showReport($('report-card'), r); }
  $('end-test').onclick = report;
  $('resume').onclick = () => { $('pause-card').close(); s.paused = false; };
  $('pause-card').addEventListener('cancel', () => { s.paused = false; });
  $('settings').onclick = () => {
    s.paused = true; clearInput(); $('transmission').value = prefs.auto ? 'auto' : 'manual';
    $('side').value = prefs.side; $('theme').value = HubTheme.own(); $('preferences').showModal();
  };
  $('close-settings').onclick = () => { $('preferences').close(); s.paused = false; };
  $('preferences').addEventListener('cancel', () => { s.paused = false; });
  $('transmission').onchange = e => {
    prefs.auto = e.target.value === 'auto'; write('settings', prefs); reset(); s.paused = true;
  };
  $('side').onchange = e => { prefs.side = e.target.value; write('settings', prefs); const id = list.value; options(); list.value = id; reset(); s.paused = true; };
  $('theme').onchange = e => HubTheme.setOwn(e.target.value);
  // Follow Hub preference when set, otherwise the operating system. No shared files changed.
  function syncTheme() {
    if (HubTheme.own() !== 'system') return;
    let theme = '', auto = '';
    try { theme = localStorage.getItem('sites-hub.theme'); auto = localStorage.getItem('sites-hub.themeAuto'); } catch (_) { /* blocked */ }
    if (!theme || auto === '1') {
      const dark = matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('light', !dark); document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    }
  }
  HubTheme.onChange(syncTheme); window.addEventListener('storage', syncTheme); window.addEventListener('focus', syncTheme);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncTheme); syncTheme();
  const actions = { Enter: 'engine', q: 'down', e: 'up', h: 'park', z: 'left', x: 'right', m: 'look', b: 'horn' };
  const driving = ['w', 's', 'a', 'd', 'c', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  window.addEventListener('keydown', e => {
    if (e.target.matches('select,input,textarea') || s.paused) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (driving.includes(k) || actions[k]) { e.preventDefault(); if (!e.repeat && actions[k]) $(actions[k]).click(); keys.add(k); }
    if (k === 'Escape') pause();
  });
  window.addEventListener('keyup', e => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
  window.addEventListener('blur', () => { if (!s.paused) pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && !s.paused) pause(); });
  document.querySelectorAll('[data-hold]').forEach(b => {
    b.onpointerdown = e => { if (s.paused) return; e.preventDefault(); b.setPointerCapture(e.pointerId); held[b.dataset.hold] = 1; b.classList.add('active'); };
    const release = () => { held[b.dataset.hold] = 0; b.classList.remove('active'); };
    b.onpointerup = b.onpointercancel = b.onlostpointercapture = release;
  });
  let wheelPointer = null, wheelStart = 0;
  wheel.onpointerdown = e => { e.preventDefault(); wheelPointer = e.pointerId; wheelStart = e.clientX; wheel.setPointerCapture(e.pointerId); };
  wheel.onpointermove = e => { if (e.pointerId === wheelPointer) held.steer = D.clamp((e.clientX - wheelStart) / 45, -1, 1); };
  wheel.onpointerup = wheel.onpointercancel = wheel.onlostpointercapture = () => { held.steer = 0; wheelPointer = null; };
  wheel.onkeydown = e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); held.steer = e.key === 'ArrowLeft' ? -1 : 1; } };
  wheel.onkeyup = () => { held.steer = 0; };
  function input() {
    return { throttle: Math.max(held.throttle, +(keys.has('w') || keys.has('ArrowUp'))),
      brake: Math.max(held.brake, +(keys.has('s') || keys.has('ArrowDown') || keys.has(' '))),
      clutch: Math.max(held.clutch, +keys.has('c')),
      steer: held.steer || +(keys.has('d') || keys.has('ArrowRight')) - +(keys.has('a') || keys.has('ArrowLeft')) };
  }
  function update(dt) {
    D.tick(s, input(), dt);
    if (s.l.done && !s.saved) { best[s.l.def.id] = Math.max(best[s.l.def.id] || 0, s.l.score); write('best', best); s.saved = true; const id = list.value; options(); list.value = id; }
    $('speed').textContent = Math.round(Math.abs(s.c.v) * 3.6);
    $('rpm-meter').value = s.c.rpm;
    $('rpm').textContent = Math.round(s.c.rpm / 100) * 100 + ' RPM';
    $('gear').textContent = s.c.gear === -1 ? 'R' : s.c.gear ? (s.c.auto ? 'D' : '') + s.c.gear : 'N';
    $('lamps').textContent = (s.c.handbrake ? 'Ⓟ PARK · ' : '') + (s.c.stalled ? 'STALL · ' : '') + (s.c.indicator === 'left' ? '◀ LEFT' : s.c.indicator === 'right' ? 'RIGHT ▶' : 'Signals off');
    $('hint').textContent = noticeUntil > performance.now() ? noticeText : D.hint(s.l, s.c);
    $('progress').textContent = (s.l.def.finish || 'Follow the guide.') + ' · ' + (s.l.def.gates.length > 1 ? s.l.gate + '/' + s.l.def.gates.length + ' rings · ' : '') + Math.floor(s.l.elapsed) + ' s · clutch ' + Math.round(s.c.clutch * 100) + '%';
    $('score').textContent = ' · Score ' + s.l.score + '/100 · Best ' + (best[s.l.def.id] ?? '—');
    $('park').setAttribute('aria-pressed', s.c.handbrake);
    $('left').setAttribute('aria-pressed', s.c.indicator === 'left'); $('right').setAttribute('aria-pressed', s.c.indicator === 'right');
    wheel.style.transform = 'rotate(' + s.c.steer * 65 + 'deg)'; wheel.setAttribute('aria-valuenow', Math.round(s.c.steer * 100));
    $('mirror').textContent = mirrorTime > s.c.elapsed ? 'REAR CHECKED · lot clear · check sides too' : 'REAR · practice lot · M to look';
    const f = s.l.faults[s.l.faults.length - 1];
    $('fault').textContent = f && (s.w ? s.w.time - f.time < 5 : s.l.elapsed - f.time < 5) ? f.reason : '';
    if (s.w) {
      const back = s.w.cars.filter(ai => { const dx = ai.x - s.c.x, dy = ai.y - s.c.y; return dx * Math.cos(s.c.heading) + dy * Math.sin(s.c.heading) < 0 && Math.hypot(dx, dy) < 30; });
      $('mirror').textContent = 'REAR · ' + back.length + ' vehicle(s) nearby · check blind spots';
    }
    D.sound.update(s.c, s.paused || s.l.done);
    if (s.l.def.mock && s.l.done && !s.reported) { s.reported = true; report(); }
    D.draw($('road'), s, prefs);
  }
  function frame(t) { let dt = Math.min(.1, (t - (last || t)) / 1000); last = t; while (dt > 0) { const step = Math.min(dt, 1 / 60); update(step); dt -= step; } requestAnimationFrame(frame); }
  if (window.LearnHubBar) LearnHubBar.attach(document.querySelector('.lrn-head'));
  // Deterministic harness uses exactly the same session/physics; never shipped with auto-driving enabled.
  if (new URLSearchParams(location.search).has('test')) window.drivingTest = { D, get s() { return s; }, reset, input, update, prefs };
  requestAnimationFrame(frame);
})();
