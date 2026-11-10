/* UI, input, persistence and fixed-step accumulator. Only SC.step mutates time. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id), KEY = 'star-colony.save';
  const map = $('map'), camera = { x: 20 * 28, y: 15 * 28, zoom: 1.4 };
  let state, speed = 1, paused = false, mode = null, selected = null, accum = 0, last = performance.now(), drawAt = 0, hudAt = 0, saveAt = 0;
  try { state = SC.load(localStorage.getItem(KEY)); } catch (_) { state = SC.create(); }
  const cursor = { x: 18, y: 15 };
  function status(text) { $('status').textContent = text; }
  function persist() { try { localStorage.setItem(KEY, SC.save(state)); status('Saved on this device'); } catch (_) { status('Storage unavailable — keep this tab open'); } }
  function dialog(title, body, actions) {
    paused = true; $('pause').textContent = 'Resume'; $('dialog-title').textContent = title;
    $('dialog-body').innerHTML = body; $('dialog-actions').replaceChildren();
    actions.forEach(([label, fn]) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; $('dialog-actions').append(b); });
    $('overlay').hidden = false; $('overlay').querySelector('.card').focus();
  }
  function resume() { $('overlay').hidden = true; paused = false; $('pause').textContent = 'Pause'; accum = 0; map.focus(); }
  function togglePause() {
    if (paused) { resume(); return; }
    dialog('Colony paused', '<p>Your settlers and all resources are safe while paused.</p>', [['Resume', resume], ['Save', persist]]);
  }
  function makeBuildBar() {
    $('build').replaceChildren();
    Object.entries(SCData.buildings).forEach(([key, def]) => {
      const b = document.createElement('button'); b.dataset.type = key;
      b.innerHTML = def.glyph + ' ' + def.name + '<small>' + Object.entries(def.cost).map(([k, n]) => n + ' ' + k).join(' · ') + '</small>';
      b.onclick = () => { mode = mode === key ? null : key; updateBuild(); status(mode ? 'Tap an empty tile. Drag only pans. Escape cancels.' : 'Inspect mode'); };
      $('build').append(b);
    });
  }
  function updateBuild() { $('build').querySelectorAll('button').forEach(b => { b.classList.toggle('active', b.dataset.type === mode); b.setAttribute('aria-pressed', String(b.dataset.type === mode)); }); }
  function inspect() {
    if (!selected) return;
    if (selected.kind === 'colonist') {
      const c = state.colonists.find(c => c.id === selected.id); if (!c) return;
      $('details').innerHTML = '<h2>' + c.name + '</h2><p>' + (c.activity || 'Idle') + ' · Health ' + Math.round(c.health) + '</p><p>Oxygen ' + Math.round(c.air) + ' · Food ' + Math.round(c.food) + ' · Rest ' + Math.round(c.rest) + ' · Morale ' + Math.round(c.morale) + '</p>';
    } else {
      const b = SC.building(state, selected.id); if (!b) return;
      const job = state.jobs.find(j => j.target === b.id && j.kind === 'build');
      $('details').innerHTML = '<h2>' + SCData.buildings[b.type].name + '</h2><p>' + (b.ready ? (b.powered ? 'Powered / connected' : 'No power') : b.delivered ? 'Construction ' + Math.floor((job?.work || 0) / SCData.buildings[b.type].work * 100) + '%' : 'Waiting for a supply haul') + ' · Health ' + Math.round(b.health) + '</p><p>' + (b.type === 'dome' ? 'Oxygen: ' + b.oxygen.toFixed(0) + ' / 180 · Beds: 5' : b.type === 'battery' ? 'Stored: ' + b.charge.toFixed(0) + ' / 900' : b.type === 'storage' ? Object.entries(b.stock).map(([k, n]) => k + ' ' + Math.floor(n)).join(' · ') : 'Connect to the settlement with adjacent buildings or corridors.') + '</p>';
    }
  }
  function hud() {
    const r = SC.totals(state), p = state.power;
    $('resources').innerHTML = '<span>Day <b>' + (Math.floor(state.time / SCData.DAY) + 1) + '</b> ' + (SC.daylight(state) ? '☀ Daylight' : '☾ Night') + '</span><span>Settlers <b>' + state.colonists.length + '</b></span>' + Object.entries(r).map(([k, n]) => '<span>' + k + ' <b>' + Math.floor(n) + '</b></span>').join('') + '<span>Power <b>' + p.made.toFixed(0) + '/' + p.demand.toFixed(0) + '</b> · Battery ' + p.charge.toFixed(0) + '</span>';
    inspect(); if (window.SCGrowthUI) window.SCGrowthUI.update(state);
  }
  function point(e) {
    const r = map.getBoundingClientRect(); return { x: (e.clientX - r.left - r.width / 2) / camera.zoom + camera.x, y: (e.clientY - r.top - r.height / 2) / camera.zoom + camera.y };
  }
  function select(x, y) {
    if (x < 0 || y < 0 || x >= state.w || y >= state.h) return;
    if (mode) {
      const result = SC.place(state, mode, x, y);
      status(typeof result === 'string' ? result : SCData.buildings[mode].name + ' queued');
      if (typeof result !== 'string') { selected = { id: result.id, kind: 'building' }; window.SCFx?.sound('build'); }
    } else {
      const c = state.colonists.find(c => Math.hypot(c.x - x, c.y - y) < .6);
      const b = state.buildings.find(b => b.x === x && b.y === y);
      selected = c ? { id: c.id, kind: 'colonist' } : b ? { id: b.id, kind: 'building' } : null;
      if (!selected) $('details').innerHTML = '<h2>' + state.terrain[y * state.w + x] + '</h2><p>Tile ' + x + ', ' + y + ' · Choose a structure above to build.</p>';
    }
    hud();
  }
  const pointers = new Map(); let origin = null, moved = false, pinch = 0;
  function distance() { const p = [...pointers.values()]; return p.length < 2 ? 0 : Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); }
  map.addEventListener('pointerdown', e => { map.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); origin = { x: e.clientX, y: e.clientY }; moved = false; pinch = distance(); window.SCFx?.unlock(); });
  map.addEventListener('pointermove', e => {
    const old = pointers.get(e.pointerId); if (!old) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size > 1) { const d = distance(); if (pinch) camera.zoom = Math.max(.45, Math.min(3.2, camera.zoom * d / pinch)); pinch = d; moved = true; }
    else if (origin && (moved || Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 6)) { camera.x -= (e.clientX - old.x) / camera.zoom; camera.y -= (e.clientY - old.y) / camera.zoom; moved = true; }
    boundCamera();
  });
  map.addEventListener('pointerup', e => { if (!moved && pointers.size === 1) { const p = point(e); select(Math.floor(p.x / 28), Math.floor(p.y / 28)); } pointers.delete(e.pointerId); origin = null; });
  map.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); origin = null; moved = true; });
  function boundCamera() { camera.x = Math.max(0, Math.min(state.w * 28, camera.x)); camera.y = Math.max(0, Math.min(state.h * 28, camera.y)); }
  map.addEventListener('wheel', e => { e.preventDefault(); const p = point(e); camera.zoom = Math.max(.45, Math.min(3.2, camera.zoom * Math.exp(-e.deltaY * .001))); const after = point(e); camera.x += p.x - after.x; camera.y += p.y - after.y; boundCamera(); }, { passive: false });
  map.addEventListener('keydown', e => {
    const directions = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (directions[e.key]) { e.preventDefault(); const d = directions[e.key]; cursor.x = Math.max(0, Math.min(state.w - 1, cursor.x + d[0])); cursor.y = Math.max(0, Math.min(state.h - 1, cursor.y + d[1])); camera.x = (cursor.x + .5) * 28; camera.y = (cursor.y + .5) * 28; status('Tile cursor ' + cursor.x + ', ' + cursor.y); }
    if (e.key === 'Enter') select(cursor.x, cursor.y);
  });
  addEventListener('keydown', e => { if (e.target.matches('input,select,textarea')) return; if (e.key.toLowerCase() === 'p') togglePause(); if (e.key === 'Escape') { if (mode) { mode = null; updateBuild(); } else if ($('overlay').hidden) togglePause(); else resume(); } });
  $('pause').onclick = togglePause; $('speed').onchange = () => { speed = Number($('speed').value); };
  $('minus').onclick = () => { camera.zoom = Math.max(.45, camera.zoom / 1.2); };
  $('plus').onclick = () => { camera.zoom = Math.min(3.2, camera.zoom * 1.2); };
  $('home').onclick = () => { camera.x = 20 * 28; camera.y = 15 * 28; camera.zoom = 1.4; };
  $('save').onclick = persist;
  $('new').onclick = () => dialog('Start a new colony?', '<p>This replaces the local saved settlement.</p>', [['Keep colony', resume], ['New colony', () => { state = SC.create(Date.now()); if (SC.growth) SC.growth.init(state); selected = null; mode = null; makeBuildBar(); persist(); resume(); }]]);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { persist(); if (!paused) togglePause(); } });
  addEventListener('blur', () => { if (SCSettings.get('autoPause') && !paused) togglePause(); });
  addEventListener('pagehide', persist);
  SCSettings.mount($('gear')); makeBuildBar();
  if (window.SCGrowthUI) window.SCGrowthUI.init({ get: () => state, dialog, resume, hud });
  if (window.SCFx) window.SCFx.init({ get: () => state, dialog, resume, persist });
  function frame(now) {
    const elapsed = Math.min((now - last) / 1000, .25); last = now;
    if (!paused && !state.over) {
      accum += elapsed * speed;
      while (accum >= SCData.STEP) { SC.step(state); accum -= SCData.STEP; }
    }
    if (now - drawAt >= 1000 / SCSettings.get('fpsLimit')) { SCRender.draw(map, state, camera, selected, mode, now / 1000); drawAt = now; }
    if (now - hudAt > 350) { hud(); hudAt = now; }
    if (now - saveAt > 12000) { persist(); saveAt = now; }
    if (state.over && $('overlay').hidden) dialog('Colony lost', '<p>Days survived: ' + (state.time / SCData.DAY).toFixed(1) + ' · Structures built: ' + state.stats.built + ' · Settlers lost: ' + state.stats.lost + '</p>', [['New colony', () => $('new').click()], ['Inspect', resume]]);
    requestAnimationFrame(frame);
  }
  /* A read-only integration surface; simulation is independently tested in Node. */
  window.StarColony = { getState: () => state, camera, persist, select, setPaused: v => { paused = !!v; }, hud };
  hud(); requestAnimationFrame(frame);
})();
