(function () {
  'use strict';
  const H = window.HT, $ = id => document.getElementById(id), PRE = 'learn.history-timeline.';
  H.read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(PRE + key)) ?? fallback; } catch (_) { return fallback; } };
  H.write = (key, value) => { try { localStorage.setItem(PRE + key, JSON.stringify(value)); } catch (_) { /* private/limited storage */ } };
  H.el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  const saved = H.read('view', null);
  const state = H.state = { view: H.view(), region: 'both', selected: '', search: '', topics: [], bookmarksOnly: false, events: [], page: 0, hits: [] };
  if (saved && ['log','linear'].includes(saved.mode) && Number.isFinite(saved.lo) && Number.isFinite(saved.hi) && saved.hi > saved.lo) state.view = H.clampView(saved);
  $('scale').value = state.view.mode;
  let dirty = true;
  function requestDraw() { dirty = true; }
  H.requestDraw = requestDraw;
  function filtered() { return H.query(H.events, { search: state.search, region: state.region, topics: state.topics, ids: state.bookmarksOnly ? (H.bookmarks || []) : null }); }
  function eventButton(e) {
    const b = H.el('button', null, 'event'), label = H.el('span', null, 'label');
    label.append(H.el('strong', e.title), H.el('small', H.dates(e) + ' · ' + (e.region === 'india' ? 'India' : 'World')));
    b.append(H.icon(e.topic), label); b.dataset.id = e.id; b.setAttribute('aria-pressed', state.selected === e.id);
    b.onclick = () => select(e); return b;
  }
  H.eventButton = eventButton;
  function results() {
    const [lo, hi] = H.range(state.view), list = $('visible').checked ? state.events.filter(e => e.year >= lo && e.year <= hi) : state.events;
    const pages = Math.max(1, Math.ceil(list.length / 16)); state.page = Math.min(state.page, pages - 1);
    $('count').textContent = list.length + ' events' + (state.search || state.topics.length || state.bookmarksOnly ? ' found' : '');
    $('event-list').replaceChildren(...list.slice(state.page * 16, (state.page + 1) * 16).map(eventButton));
    if (!list.length) $('event-list').append(H.el('p', 'No events match. Clear search or filters to explore again.'));
    $('page').textContent = (state.page + 1) + ' / ' + pages; $('prev').disabled = state.page === 0; $('next').disabled = state.page === pages - 1;
  }
  H.results = results;
  function update() { state.events = filtered(); state.page = 0; results(); requestDraw(); }
  H.update = update;
  function viewChange(view) { state.view = H.clampView(view); requestDraw(); if ($('visible').checked) results(); H.write('view', state.view); }
  H.viewChange = viewChange;
  function focus(e) {
    const half = Math.max(15, Math.min(150, (H.range(state.view)[1] - H.range(state.view)[0]) / 4));
    viewChange(H.view(state.view.mode, Math.max(H.MIN, e.year - half), Math.min(H.MAX, e.year + half)));
  }
  H.focus = focus;
  function select(e, pan = true) {
    state.selected = e.id; const card = $('card');
    card.replaceChildren(H.el('div', e.region + ' · ' + e.topic, 'badge'), H.el('h2', e.title), H.el('p', H.dates(e), 'date'), H.el('p', e.fact));
    card.append(H.el('p', 'Location: ' + e.place.name + ' (representative location).', 'hint'));
    if (e.approximate) card.append(H.el('p', 'Approximate date: surviving evidence does not support an exact year.', 'hint'));
    if (H.enrichCard) H.enrichCard(card, e);
    if (pan) focus(e); results(); requestDraw();
  }
  H.select = select;
  function jumpBands() {
    const bands = state.region === 'india' ? H.indiaEras : H.eras;
    $('eras').replaceChildren(...bands.map(([name, from, to]) => {
      const b = H.el('button', name); b.title = H.date(from) + ' – ' + H.date(to);
      b.onclick = () => viewChange(H.view(state.view.mode, from, to)); return b;
    }));
  }
  $('lanes').onchange = e => { state.region = e.target.value; jumpBands(); update(); };
  $('scale').onchange = e => { const range = H.range(state.view); viewChange(H.view(e.target.value, ...range)); };
  $('search').oninput = e => { state.search = e.target.value; update(); };
  $('visible').onchange = () => { state.page = 0; results(); };
  $('prev').onclick = () => { state.page--; results(); }; $('next').onclick = () => { state.page++; results(); };
  $('in').onclick = () => viewChange(H.zoom(state.view, 2)); $('out').onclick = () => viewChange(H.zoom(state.view, .5));
  $('all').onclick = () => viewChange(H.view(state.view.mode));
  $('decade').onclick = () => {
    const e = H.events.find(e => e.id === state.selected), centre = e ? e.year : Math.min(H.MAX - 5, H.yearAt(.5, state.view, 1));
    viewChange(H.view(state.view.mode, Math.max(H.MIN, centre - 5), Math.min(H.MAX, centre + 5)));
  };
  const canvas = $('timeline'), points = new Map(); let gesture = null, moved = false;
  const local = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  function startGesture() {
    const p = [...points.values()]; gesture = { view: { ...state.view }, x: p.reduce((s, v) => s + v.x, 0) / p.length, distance: p.length === 2 ? Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y) : 0 };
  }
  canvas.onpointerdown = e => { e.preventDefault(); canvas.setPointerCapture(e.pointerId); points.set(e.pointerId, local(e)); if (points.size === 1) moved = false; else moved = true; startGesture(); };
  canvas.onpointermove = e => {
    if (!points.has(e.pointerId)) return; points.set(e.pointerId, local(e)); const p = [...points.values()], width = canvas.clientWidth - 28;
    if (p.length === 2 && gesture.distance > 0) {
      const distance = Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y), mid = (p[0].x + p[1].x) / 2;
      viewChange(H.pan(H.zoom(gesture.view, distance / gesture.distance, (gesture.x - 14) / width), (gesture.x - mid) / width)); moved = true;
    } else if (p.length === 1) {
      const dx = p[0].x - gesture.x; if (Math.abs(dx) > 4) moved = true;
      viewChange(H.pan(gesture.view, -dx / width));
    }
  };
  function end(e) {
    if (!points.has(e.pointerId)) return;
    if (!moved && e.type === 'pointerup') {
      const p = local(e), hit = state.hits.find(h => Math.hypot(h.x - p.x, h.y - p.y) < 23); if (hit) select(hit.e, false);
    }
    points.delete(e.pointerId); if (points.size) startGesture(); else gesture = null;
  }
  canvas.onpointerup = canvas.onpointercancel = canvas.onlostpointercapture = end;
  canvas.addEventListener('wheel', e => { e.preventDefault(); viewChange(H.zoom(state.view, Math.exp(-e.deltaY * .002), (local(e).x - 14) / (canvas.clientWidth - 28))); }, { passive: false });
  canvas.onkeydown = e => {
    const ops = { ArrowLeft: () => H.pan(state.view, -.15), ArrowRight: () => H.pan(state.view, .15), '+': () => H.zoom(state.view, 2), '=': () => H.zoom(state.view, 2), '-': () => H.zoom(state.view, .5), Home: () => H.view(state.view.mode) };
    if (ops[e.key]) { e.preventDefault(); viewChange(ops[e.key]()); }
  };
  $('settings').onclick = () => { $('theme').value = HubTheme.own(); $('preferences').showModal(); };
  $('close-settings').onclick = () => $('preferences').close(); $('theme').onchange = e => HubTheme.setOwn(e.target.value);
  function theme() {
    if (HubTheme.own() === 'system') {
      let saved = '', auto = ''; try { saved = localStorage.getItem('sites-hub.theme'); auto = localStorage.getItem('sites-hub.themeAuto'); } catch (_) { /* unavailable */ }
      if (!saved || auto === '1') {
        const dark = matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.classList.toggle('light', !dark); document.documentElement.dataset.theme = dark ? 'dark' : 'light'; document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
      }
    }
    requestDraw();
  }
  HubTheme.onChange(theme); window.addEventListener('storage', theme); window.addEventListener('focus', theme);
  window.addEventListener('message', e => { if (e.source === parent && (e.origin === location.origin || location.protocol === 'file:') && e.data?.type === 'hub-prefs') theme(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', theme); theme();
  new ResizeObserver(requestDraw).observe(canvas);
  function frame() {
    if (dirty) { dirty = false; state.hits = H.draw(canvas, state); const r = H.range(state.view); $('range').textContent = H.date(r[0]) + ' — ' + H.date(r[1]); $('scale-note').textContent = state.view.mode === 'log' ? 'Unequal spacing · deep time compressed' : 'Equal spacing · linear years'; }
    requestAnimationFrame(frame);
  }
  if (window.LearnHubBar) LearnHubBar.attach(document.querySelector('.lrn-head'), { buttons: '#settings' });
  jumpBands(); update(); requestAnimationFrame(frame);
})();
