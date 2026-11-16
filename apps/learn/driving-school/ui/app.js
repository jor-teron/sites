(function () {
  'use strict';
  const D = window.DS, $ = id => document.getElementById(id), PRE = 'learn.driving-school.';
  function read(k, fallback) { try { return JSON.parse(localStorage.getItem(PRE + k)) ?? fallback; } catch (_) { return fallback; } }
  function write(k, v) { try { localStorage.setItem(PRE + k, JSON.stringify(v)); } catch (_) { /* storage unavailable */ } }
  const prefs = D.settingsFrom(read('settings', {})), best = read('best', {});
  let s, last = 0, mirrorTime = 0, noticeText = '', noticeUntil = 0, view = null, frameNo = 0, clock = 0, noteShownAt = 0;
  let odo = D.odometersFrom(read('odo', {})), odoMark = 0, odoSavedAt = 0, faultCount = 0, faultBeepAt = 0, edgeTimer = 0;
  function saveOdo(force, now) {
    now = now == null ? clock : now;
    if (!D.shouldSaveOdo(odoSavedAt, now, force)) return;
    write('odo', { total: odo.total, trip: odo.trip }); odoSavedAt = now;
  }
  function rollOdo() {
    const step = D.takeDelta(odoMark, s.c.distance);
    odoMark = step.at; if (step.delta) odo = D.addDistance(odo, step.delta);
  }
  function notice(text) { noticeText = text; noticeUntil = clock + 3000; }
  const keys = new Set(), held = { throttle: 0, brake: 0, clutch: 0, steer: 0 };
  const list = $('lessons'), screen = $('screen');
  const flatOnly = new URLSearchParams(location.search).get('view') === 'map';
  const definitions = () => D.basics.concat(D.roadLessons(prefs.side), D.roadDefinitions(prefs.side, prefs.route), [D.mockDefinition(prefs.side)]);
  // Lesson list in groups: practice lot, town, open road (DS-3), test.
  const groupOf = def => def.group || (def.mock ? 'Test' : def.town ? 'Town' : 'Practice lot');
  function options() {
    const groups = [];
    for (const def of definitions()) {
      let g = groups.find(x => x.label === groupOf(def));
      if (!g) { g = document.createElement('optgroup'); g.label = groupOf(def); groups.push(g); }
      const opt = document.createElement('option'); opt.value = def.id;
      opt.textContent = def.name + (best[def.id] != null ? ' · best ' + best[def.id] : ''); g.appendChild(opt);
    }
    list.replaceChildren(...groups);
  }
  options();
  function rememberBest() {
    if (!s || !s.l) return;
    const id = s.l.def.id, live = s.l.score;
    const ended = s.l.done || (s.l.def.road === 'endless' && (s.l.distance || 0) > 0);
    if (!ended) return;
    const next = D.recordBest(best, id, live);
    if (next[id] !== best[id]) { Object.assign(best, next); write('best', best); const cur = list.value; options(); list.value = cur; }
    s.saved = true;
  }
  function reset() {
    rememberBest();
    const def = definitions().find(d => d.id === list.value) || D.basics[0];
    s = D.session(def, prefs); keys.clear(); Object.keys(held).forEach(k => held[k] = 0);
    $('end-test').hidden = !def.mock; $('lesson-name').textContent = def.name + (def.road ? ' · route ' + def.route : '');
    $('route-box').hidden = !def.road; $('route').value = String(prefs.route); write('last', def.id); mirrorTime = 0; odoMark = 0; faultCount = 0;
  }
  list.value = read('last', 'start'); reset();
  $('cockpit').classList.toggle('auto', prefs.auto);
  list.onchange = reset; $('retry').onclick = reset;
  // Route number (open road): the same number always gives the same road.
  $('route').onchange = () => { const n = Math.max(1, Math.min(9999, parseInt($('route').value, 10) || 1)); prefs.route = n; write('settings', prefs); reset(); };
  function toggleEngine() {
    if (s.c.engine) { D.stop(s.c); D.sound.cutEngine(); notice(s.c.message); return; }
    if (!D.start(s.c)) notice(s.c.message); else D.sound.crank();
  }
  $('engine').onclick = toggleEngine;
  // Automatic: D = first forward gear (it changes up by itself); stepping down from D goes to N.
  function selectGear(gear) { if (!D.shift(s.c, gear)) notice(s.c.message); }
  function gearUp() { selectGear(s.c.auto && s.c.gear > 0 ? s.c.gear : s.c.gear + 1); }
  function gearDown() { selectGear(s.c.auto && s.c.gear > 0 ? 0 : s.c.gear - 1); }
  $('park').onclick = () => { s.c.handbrake = !s.c.handbrake; };
  function indicator(side) { s.c.indicator = s.c.indicator === side ? '' : side; }
  $('left').onclick = () => indicator('left'); $('right').onclick = () => indicator('right');
  $('look').onclick = () => { mirrorTime = s.c.elapsed + 3; };
  $('cockpit').classList.toggle('lhd', prefs.side === 'right');
  function clearInput() { keys.clear(); Object.keys(held).forEach(k => held[k] = 0); }
  function pause() { s.paused = true; clearInput(); D.sound.hornStop(); if (!$('pause-card').open) $('pause-card').showModal(); }
  $('pause').onclick = pause;
  D.sound.mute(prefs.muted);
  function muteLabel() { $('mute').textContent = prefs.muted ? 'Muted' : 'Sound on'; $('mute').setAttribute('aria-pressed', prefs.muted); }
  muteLabel();
  $('mute').onclick = () => { prefs.muted = !prefs.muted; D.sound.mute(prefs.muted); write('settings', prefs); muteLabel(); };
  (function bindHorn(btn) {
    let heldId = null;
    const down = e => {
      if (e.button != null && e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      try { btn.setPointerCapture(e.pointerId); } catch (_) { /* capture is optional */ }
      heldId = e.pointerId; btn.classList.add('active'); D.sound.hornDown();
    };
    const up = e => {
      if (heldId != null && e.pointerId != null && e.pointerId !== heldId) return;
      heldId = null; btn.classList.remove('active'); D.sound.hornUp();
    };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);
  })($('horn'));

  $('trip-reset').onclick = () => { odo = D.resetTrip(odo); saveOdo(true, clock); };
  window.addEventListener('pointerdown', D.sound.unlock, { passive: true });
  window.addEventListener('keydown', D.sound.unlock);
  window.addEventListener('pagehide', () => saveOdo(true, clock));
  function modalOpen() { s.paused = true; clearInput(); }
  for (const id of ['help-card','quiz-card','report-card']) $(id).addEventListener('close', () => { s.paused = false; clearInput(); });
  $('help').onclick = () => { modalOpen(); $('help-card').showModal(); };
  $('close-help').onclick = () => $('help-card').close();
  $('quiz').onclick = () => { modalOpen(); D.showQuiz($('quiz-card'), read('quiz-best', 0), v => write('quiz-best', v)); };
  function report() { modalOpen(); const r = D.testReport(s.l.faults, s.l.done, s.l.elapsed, s.l.score); write('test-last', r); D.showReport($('report-card'), r); }
  $('end-test').onclick = report;
  $('resume').onclick = () => { $('pause-card').close(); s.paused = false; };
  $('pause-card').addEventListener('cancel', () => { s.paused = false; });
  $('settings').onclick = () => {
    s.paused = true; clearInput(); $('transmission').value = prefs.auto ? 'auto' : 'manual';
    $('side').value = prefs.side; $('minimap').value = prefs.minimap ? 'on' : 'off'; $('edge-alert-pref').value = prefs.edgeAlert ? 'on' : 'off'; $('theme').value = HubTheme.own(); $('preferences').showModal();
  };
  $('close-settings').onclick = () => { $('preferences').close(); s.paused = false; };
  $('preferences').addEventListener('cancel', () => { s.paused = false; });
  $('transmission').onchange = e => {
    prefs.auto = e.target.value === 'auto'; write('settings', prefs); reset(); s.paused = true; $('cockpit').classList.toggle('auto', prefs.auto);
  };
  $('side').onchange = e => { prefs.side = e.target.value; write('settings', prefs); $('cockpit').classList.toggle('lhd', prefs.side === 'right'); const id = list.value; options(); list.value = id; reset(); s.paused = true; };
  $('theme').onchange = e => HubTheme.setOwn(e.target.value);
  function applyMinimap() { $('screen').classList.toggle('no-minimap', !prefs.minimap); }
  applyMinimap();
  $('minimap').onchange = e => { prefs.minimap = e.target.value === 'on'; write('settings', prefs); applyMinimap(); };
  $('edge-alert-pref').onchange = e => { prefs.edgeAlert = e.target.value !== 'off'; write('settings', prefs); };

  // Floating lesson note: fades after a few seconds; tap the Note chip to bring it back.
  $('note').addEventListener('click', () => { if ($('note').classList.contains('faded')) noteShownAt = clock; });
  $('note-show').addEventListener('click', e => { e.stopPropagation(); noteShownAt = clock; });
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
  const actions = { Enter: () => $('engine').click(), q: gearDown, e: gearUp, h: () => $('park').click(), z: () => $('left').click(),
    x: () => $('right').click(), m: () => $('look').click() };
  const driving = ['w', 's', 'a', 'd', 'c', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  window.addEventListener('keydown', e => {
    if (e.target.matches('select,input,textarea') || s.paused) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'b') { e.preventDefault(); if (!e.repeat) D.sound.hornDown(); return; }
    if (driving.includes(k) || actions[k]) { e.preventDefault(); if (!e.repeat && actions[k]) actions[k](); keys.add(k); }
    if (k === 'Escape') pause();
  });
  window.addEventListener('keyup', e => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    keys.delete(k);
    if (k === 'b') D.sound.hornUp();
  });
  window.addEventListener('blur', () => { D.sound.hornStop(); if (!s.paused) pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && !s.paused) pause(); });
  document.querySelectorAll('[data-hold]').forEach(b => {
    b.onpointerdown = e => { if (s.paused) return; e.preventDefault(); b.setPointerCapture(e.pointerId); held[b.dataset.hold] = 1; b.classList.add('active'); };
    const release = () => { held[b.dataset.hold] = 0; b.classList.remove('active'); };
    b.onpointerup = b.onpointercancel = b.onlostpointercapture = release;
  });
  D.dash.build({ onSteer: v => { held.steer = s.paused ? 0 : v; } });
  function input() {
    return { throttle: Math.max(held.throttle, +(keys.has('w') || keys.has('ArrowUp'))),
      brake: Math.max(held.brake, +(keys.has('s') || keys.has('ArrowDown') || keys.has(' '))),
      clutch: Math.max(held.clutch, +keys.has('c')),
      steer: held.steer || +(keys.has('d') || keys.has('ArrowRight')) - +(keys.has('a') || keys.has('ArrowLeft')) };
  }
  function update(dt) {
    D.tick(s, input(), dt);
    if (s.l.done && !s.saved) { rememberBest(); const id = list.value; options(); list.value = id; }
    if (s.l.def.mock && s.l.done && !s.reported) { s.reported = true; report(); }
  }
  // 3D view when the ES module and WebGL work; otherwise (file://, no WebGL, ?view=map) the old top-down map.
  function use3d() {
    if (view || flatOnly || !D.view3dFactory) return;
    try { view = D.view3dFactory($('view3d')); screen.classList.remove('flat'); }
    catch (_) { view = null; notice('The 3D view does not work on this device, so the map view is shown.'); }
  }
  window.addEventListener('ds-view3d', use3d); use3d();
  $('view3d').addEventListener('webglcontextlost', e => { e.preventDefault(); view = null; screen.classList.add('flat'); });
  window.addEventListener('load', () => setTimeout(() => {
    if (!view && !flatOnly && location.protocol === 'file:') notice('The 3D view needs the Hub or a web server. Showing the map view.');
  }, 300));
  function paint(now) {
    const c = s.c, inp = input();
    clock = now;
    // Draw first (reads layout), then update the DOM, so a frame never forces two layouts.
    frameNo++;
    if (view) {
      const sides = screen.clientWidth >= 520;
      screen.classList.toggle('sides', sides);
      try { view.render(s, prefs, { rear: $('mirror'), left: $('mirror-l'), right: $('mirror-r'), sides }, now / 1000); }
      catch (err) { console.error(err); view = null; screen.classList.add('flat'); notice('The 3D view stopped, so the map view is shown.'); }
      if (prefs.minimap && frameNo % 3 === 0) D.draw($('road'), s, prefs);   // mini-map, every third frame, only when enabled
    } else D.draw($('road'), s, prefs);   // map fallback (?view=map / file://) always fills the screen
    rollOdo();
    saveOdo(false, now);
    if (s.l.faults.length > faultCount) {
      const added = s.l.faults.slice(faultCount);
      const severe = added.some(f => f.severity === 'serious') ? 'serious' : 'minor';
      if (D.faultBeepDue(faultBeepAt, now)) { D.sound.fault(); faultBeepAt = now; }
      if (D.edgeAlertOn(prefs)) {
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        const cls = D.edgeAlertPulse(severe, reduced), el = $('edge-alert');
        el.classList.remove('pulse-amber', 'pulse-red', 'show-amber', 'show-red');
        void el.offsetWidth;
        el.classList.add(cls);
        if (reduced) { clearTimeout(edgeTimer); edgeTimer = setTimeout(() => el.classList.remove(cls), 800); }
      }
      faultCount = s.l.faults.length;
    }
    D.dash.update(c, inp, selectGear, odo, { value: s.l.score });
    const done = s.l.done, raw = noticeUntil > now ? noticeText : D.hint(s.l, c);
    const text = done || noticeUntil > now ? raw : D.nextHint(raw);
    if ($('hint').textContent !== text) { $('hint').textContent = text; noteShownAt = now; }
    $('note').classList.toggle('faded', !!text && D.noteFaded(noteShownAt, now, false));
    const at = s.w && s.w.road && s.w.at;
    if (at) $('progress').textContent = D.ROAD_TYPES[at.type].name + ' · ' + at.limit + ' km/h · ' + (s.w.road.mode === 'loop' ? 'lap ' + Math.min(100, Math.round((s.l.lap || 0) * 100)) + '%' : (Math.max(0, s.w.progress) / 1000).toFixed(1) + ' km') + ' · ' + Math.floor(s.l.elapsed) + ' s';
    else $('progress').textContent = (s.l.def.gates.length > 1 ? 'Arch ' + Math.min(s.l.gate + 1, s.l.def.gates.length) + ' of ' + s.l.def.gates.length + ' · ' : '') + Math.floor(s.l.elapsed) + ' s';
    $('score').textContent = ' · Score ' + s.l.score + '% · Best ' + (best[s.l.def.id] ?? '—');
    const tone = D.scoreColour(s.l.score);
    if ($('score').dataset.colour !== tone) {
      $('score').dataset.colour = tone;
      $('score').classList.remove('green', 'amber', 'red');
      $('score').classList.add(tone);
    }

    const f = s.l.faults[s.l.faults.length - 1];
    $('fault').textContent = f && (s.w ? s.w.time - f.time < 5 : s.l.elapsed - f.time < 5) ? f.reason : '';
    const checked = mirrorTime > c.elapsed;
    let rearText = checked ? 'Mirror checked · look over your shoulder too' : 'Rear view · M to check';
    if (s.w) {
      const back = s.w.cars.filter(ai => { const dx = ai.x - c.x, dy = ai.y - c.y; return dx * Math.cos(c.heading) + dy * Math.sin(c.heading) < 0 && Math.hypot(dx, dy) < 30; });
      rearText = 'Behind you: ' + back.length + ' vehicle(s)' + (checked ? ' · checked' : '');
    }
    $('mirror').classList.toggle('checked', checked); $('mirror').setAttribute('aria-label', 'Rear-view mirror. ' + rearText);
    $('mirror-text').textContent = view ? '' : rearText;
    D.sound.update(c, s.paused || done);
  }
  function frame(t) { let dt = Math.min(.1, (t - (last || t)) / 1000); last = t; while (dt > 0) { const step = Math.min(dt, 1 / 60); update(step); dt -= step; } paint(t); requestAnimationFrame(frame); }
  // Inside a Hub window the head row moves to the title bar; send its buttons so they stay reachable.
  if (window.LearnHubBar) LearnHubBar.attach(document.querySelector('.lrn-head'), { buttons: '#quiz,#help,#mute,#settings' });
  // Deterministic harness uses exactly the same session/physics; never shipped with auto-driving enabled.
  if (new URLSearchParams(location.search).has('test')) window.drivingTest = { D, get s() { return s; }, reset, input, update(dt) { update(dt); paint(performance.now()); }, prefs, get view3d() { return !!view; }, get odo() { return odo; }, saveOdo };
  requestAnimationFrame(frame);
})();
