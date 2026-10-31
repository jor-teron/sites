/* Compass CP2: Speed tab — GPS speedometer + GPS altitude, trip stats.
   Settings 'compass-speed-v1': { unit:'metric'|'imp', range:'auto'|'60'|'160'|'240' }
   Trip 'compass-trip-v1': { running, acc (ms), runFrom (ms|null), moving (ms), dist (m), top (m/s), lo, hi (m), last:{lat,lon,t}|null } */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const load = (k, d) => { try { return Object.assign(d, JSON.parse(localStorage.getItem(k) || '{}')); } catch (_) { return d; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* */ } };
  const S = load('compass-speed-v1', { unit: 'metric', range: 'auto' });
  const fresh = () => ({ running: false, acc: 0, runFrom: null, moving: 0, dist: 0, top: 0, lo: null, hi: null, last: null });
  let T = load('compass-trip-v1', fresh());
  if (T.running && T.runFrom == null) T.runFrom = Date.now();
  const saveS = () => store('compass-speed-v1', S), saveT = () => store('compass-trip-v1', T);

  const MAX_ACC = 30, STILL = 1 / 3.6, MAX_V = 100;           // m; 1 km/h; 360 km/h jump filter
  const imp = () => S.unit === 'imp';
  const spd = (ms) => ms * (imp() ? 2.236936 : 3.6);           // m/s -> km/h | mph
  const len = (m) => imp() ? m * 3.28084 : m;                   // altitude m | ft
  const dist = (m) => imp() ? (m / 1609.344).toFixed(2) + ' mi' : (m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(2) + ' km');
  const hms = (ms) => { const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
  function hav(a, b) {
    const R = 6371008.8, r = Math.PI / 180, dl = (b.lat - a.lat) * r, dn = (b.lon - a.lon) * r;
    const q = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(q)));
  }

  /* dial: 270° sweep */
  const NS = 'http://www.w3.org/2000/svg', SW = 270, A0 = -135;
  let max = 0, cur = 0, shownV = 0, lastFix = 0;
  function el(tag, at, p) { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); p.appendChild(e); return e; }
  const xy = (deg, r) => { const a = deg * Math.PI / 180; return [Math.sin(a) * r, -Math.cos(a) * r]; };
  function arc(r, d0, d1) { const [x0, y0] = xy(d0, r), [x1, y1] = xy(d1, r); return `M${x0},${y0} A${r},${r} 0 ${d1 - d0 > 180 ? 1 : 0} 1 ${x1},${y1}`; }
  let arcV = null;
  function scale() {
    const top = spd(Math.max(T.top, cur));
    const m = S.range !== 'auto' ? +S.range : top <= 55 ? 60 : top <= 150 ? 160 : 240;
    if (m === max) return; max = m;
    const g = $('sscale'); g.textContent = '';
    el('path', { d: arc(140, A0, A0 + SW), class: 'sarc' }, g);
    arcV = el('path', { d: '', class: 'sarcv' }, g);
    const step = m === 60 ? 5 : m === 160 ? 10 : 20;
    for (let v = 0; v <= m; v += step) {
      const d = A0 + SW * v / m, big = v % (step * 2) === 0, [x0, y0] = xy(d, big ? 118 : 126), [x1, y1] = xy(d, 134);
      el('line', { x1: x0, y1: y0, x2: x1, y2: y1, class: 'tk' + (big ? ' m' : '') }, g);
      if (big) { const [tx, ty] = xy(d, 100); const t = el('text', { x: tx, y: ty, class: 'nm' }, g); t.textContent = v; }
    }
  }

  function render() {
    scale();
    const v = spd(cur); shownV += (v - shownV) * 0.3;
    const d = A0 + SW * Math.min(shownV, max) / max;
    $('sneedle').setAttribute('transform', `rotate(${d.toFixed(2)})`);
    arcV.setAttribute('d', shownV > max * 0.005 ? arc(140, A0, d) : '');
    $('sval').textContent = Math.round(v); $('sunit').textContent = imp() ? 'mph' : 'km/h';
    const el_ = T.acc + (T.running && T.runFrom ? Date.now() - T.runFrom : 0), u = imp() ? ' mph' : ' km/h';
    $('st-top').textContent = spd(T.top).toFixed(1) + u;
    $('st-avg').textContent = (T.moving > 0 ? spd(T.dist / (T.moving / 1000)) : 0).toFixed(1) + u;
    $('st-dist').textContent = dist(T.dist); $('st-time').textContent = hms(el_);
    const lu = imp() ? ' ft' : ' m';
    $('st-lh').textContent = T.lo == null ? '—' : Math.round(len(T.lo)) + ' / ' + Math.round(len(T.hi)) + lu;
    $('trip').textContent = T.running ? 'Pause' : (el_ ? 'Resume' : 'Start trip');
    for (const b of $('unit').children) b.classList.toggle('on', b.dataset.v === S.unit);
    for (const b of $('range').children) b.classList.toggle('on', b.dataset.v === S.range);
    if (watchId != null && lastFix && Date.now() - lastFix > 10000) gps('Waiting for GPS… (no fix for ' + Math.round((Date.now() - lastFix) / 1000) + ' s)', false);
  }
  function gps(t, bad) { const g = $('gps'); g.textContent = t; g.classList.toggle('bad', !!bad); }

  function onFix(p) {
    const c = p.coords, t = p.timestamp || Date.now(), here = { lat: c.latitude, lon: c.longitude, t };
    lastFix = Date.now();
    let v = c.speed != null && !isNaN(c.speed) && c.speed >= 0 ? c.speed : null;
    const good = c.accuracy <= MAX_ACC;
    if (T.last && good) {
      const dt = (t - T.last.t) / 1000, dd = hav(T.last, here);
      if (dt > 0) {
        const dv = dd / dt;
        if (v == null) v = dv;
        if (dv <= MAX_V) {
          if (T.running && (v > STILL) && dd > Math.min(c.accuracy, 5) * 0.5) { T.dist += dd; if (dt < 15) T.moving += dt * 1000; }
          T.last = here;
        } else if (dt > 30) T.last = here;                     // long gap: re-anchor instead of jumping
      }
    } else if (good) T.last = here;
    if (v == null || v < STILL || v > MAX_V) v = v != null && v > MAX_V ? cur : 0;
    cur = v;
    if (T.running) {
      if (good) T.top = Math.max(T.top, v);
      if (c.altitude != null) { T.lo = T.lo == null ? c.altitude : Math.min(T.lo, c.altitude); T.hi = T.hi == null ? c.altitude : Math.max(T.hi, c.altitude); }
      saveT();
    }
    const lu = imp() ? ' ft' : ' m';
    $('st-alt').textContent = c.altitude == null ? 'Altitude not available'
      : Math.round(len(c.altitude)) + lu + (c.altitudeAccuracy != null ? ' ±' + Math.round(len(c.altitudeAccuracy)) : '');
    gps('GPS ±' + Math.round(len(c.accuracy)) + lu + (good ? '' : ' — too rough, distance paused (needs ≤ ' + Math.round(len(MAX_ACC)) + lu + ')'), !good);
  }
  function onErr(e) {
    const m = e.code === 1 ? 'Location permission denied. Allow location for this site in the browser settings, then reopen the Speed tab.'
      : e.code === 2 ? 'GPS position unavailable. Go outdoors with a clear sky and check location is on.'
      : e.code === 3 ? 'GPS timed out — still trying…' : 'GPS error: ' + e.message;
    gps(m, e.code !== 3);
    if (e.code === 1) stop();
  }

  /* watch only while the Speed tab is shown and the page is visible */
  let watchId = null;
  function want() { return document.visibilityState === 'visible' && !$('pane-speed').hidden; }
  function startW() {
    if (watchId != null) return;
    if (!navigator.geolocation) { gps('This browser has no geolocation — the Speed tab needs GPS.', true); return; }
    if (!window.isSecureContext) gps('Waiting for GPS… (this page is not https, so the browser may block location)', false);
    else gps('Waiting for GPS…', false);
    lastFix = 0; T.last = null;                                // don't bridge a gap while not watching
    watchId = navigator.geolocation.watchPosition(onFix, onErr, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  }
  function stop() { if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; } cur = 0; }
  const sync = () => { want() ? startW() : stop(); };
  addEventListener('cp-tab', sync);
  document.addEventListener('visibilitychange', sync);

  $('trip').onclick = () => {
    if (T.running) { T.acc += Date.now() - T.runFrom; T.runFrom = null; T.running = false; }
    else { T.running = true; T.runFrom = Date.now(); T.last = null; }
    saveT(); render();
  };
  $('reset').onclick = () => {
    if (!confirm('Reset the trip? Top speed, distance, time and altitude range will be cleared.')) return;
    T = fresh(); saveT(); max = 0; render();
  };
  $('unit').onclick = (e) => { const v = e.target.dataset && e.target.dataset.v; if (v) { S.unit = v; saveS(); render(); } };
  $('range').onclick = (e) => { const v = e.target.dataset && e.target.dataset.v; if (v) { S.range = v; saveS(); max = 0; render(); } };
  addEventListener('pagehide', () => { if (T.running) { T.acc += Date.now() - T.runFrom; T.runFrom = Date.now(); saveT(); } });

  render(); setInterval(render, 250); sync();
})();
