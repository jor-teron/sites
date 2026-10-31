/* Compass CP1: device heading -> rotating SVG dial, smoothing, true/magnetic (offline WMM2025), lock bearing,
   calibration hint, no-sensor fallback with manual drag, wake lock.
   Settings in 'compass-settings-v1': { theme, north:'mag'|'true', lock:null|deg, awake:bool, loc:{lat,lon,ts}|null } */
(function () {
  'use strict';
  const SKEY = 'compass-settings-v1';
  const P = { theme: 'system', north: 'mag', lock: null, awake: false, loc: null };
  try { Object.assign(P, JSON.parse(localStorage.getItem(SKEY) || '{}')); } catch (_) { /* */ }
  const saveP = () => { try { localStorage.setItem(SKEY, JSON.stringify(P)); } catch (_) { /* */ } };
  const $ = (id) => document.getElementById(id);
  const norm = (a) => ((a % 360) + 360) % 360;
  const sdiff = (a, b) => ((a - b + 540) % 360) - 180;        // shortest signed a-b in (-180,180]

  /* theme: Auto follows the hub pref, then the device */
  const mq = matchMedia('(prefers-color-scheme: dark)');
  function theme() {
    let h = null; try { h = localStorage.getItem('sites-hub.theme'); } catch (_) { /* */ }
    const sys = h === 'dark' || h === 'light' ? h === 'dark' : mq.matches;
    document.documentElement.classList.toggle('dark', P.theme === 'dark' || (P.theme === 'system' && sys));
  }
  theme(); mq.addEventListener && mq.addEventListener('change', theme);
  addEventListener('storage', (e) => { if (e.key === 'sites-hub.theme') theme(); });

  /* dial */
  const NS = 'http://www.w3.org/2000/svg';
  const NAMES = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const point = (d) => NAMES[Math.round(norm(d) / 22.5) % 16];
  function el(tag, at, parent) { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); parent.appendChild(e); return e; }
  const rose = $('rose');
  el('circle', { r: 150, class: 'face' }, rose);
  for (let d = 0; d < 360; d += 5) {
    const r1 = d % 30 === 0 ? 120 : d % 10 === 0 ? 130 : 136, a = d * Math.PI / 180;
    el('line', { x1: Math.sin(a) * r1, y1: -Math.cos(a) * r1, x2: Math.sin(a) * 146, y2: -Math.cos(a) * 146, class: 'tk' + (d % 30 === 0 ? ' m' : '') }, rose);
  }
  for (let d = 0; d < 360; d += 30) {
    const a = d * Math.PI / 180, card = d % 90 === 0;
    const t = el('text', { x: Math.sin(a) * (card ? 100 : 106), y: -Math.cos(a) * (card ? 100 : 106), class: card ? 'lb' + (d === 0 ? ' n' : '') : 'nm',
      transform: `rotate(${d} ${Math.sin(a) * (card ? 100 : 106)} ${-Math.cos(a) * (card ? 100 : 106)})` }, rose);
    t.textContent = card ? 'NESW'[d / 90] : String(d);
  }
  el('path', { d: 'M0,-70 L10,0 L-10,0 Z', class: 'needle-n' }, rose);
  el('path', { d: 'M0,70 L10,0 L-10,0 Z', class: 'needle-s' }, rose);
  el('circle', { r: 5, class: 'face' }, rose);
  const lockg = $('lockg');
  rose.appendChild(lockg);                                     // the lock marker turns with the rose

  /* state */
  let raw = null, sx = 0, sy = 0, smoothed = null, disp = 0, started = false, got = false, manual = false;
  const hist = [];
  let decl = 0, declOk = false;

  function calcDecl() {
    declOk = false;
    if (P.loc && window.CompassWMM) {
      const d = new Date(), yr = d.getFullYear() + (d - new Date(d.getFullYear(), 0, 1)) / 31557600000;
      decl = CompassWMM.declination(P.loc.lat, P.loc.lon, 0, yr); declOk = true;
      $('decl').textContent = `Declination ${Math.abs(decl).toFixed(1)}° ${decl >= 0 ? 'E' : 'W'} at ${P.loc.lat.toFixed(2)}, ${P.loc.lon.toFixed(2)} (WMM2025, offline)` +
        (yr > 2030 ? ' — model expired after 2030, may be off' : '');
    } else $('decl').textContent = 'No location yet: True north needs it once (Get location).';
  }
  const useTrue = () => P.north === 'true' && declOk;
  const shown = () => smoothed == null ? null : norm(smoothed + (useTrue() ? decl : 0));

  function feed(h, acc) {
    h = norm(h); got = true; raw = h;
    const r = h * Math.PI / 180, k = 0.15;                    // circular low-pass on sin/cos
    if (smoothed == null) { sx = Math.cos(r); sy = Math.sin(r); disp = -h; } else { sx += k * (Math.cos(r) - sx); sy += k * (Math.sin(r) - sy); }
    smoothed = norm(Math.atan2(sy, sx) * 180 / Math.PI);
    hist.push(r); if (hist.length > 30) hist.shift();
    let cx = 0, cy = 0; for (const a of hist) { cx += Math.cos(a); cy += Math.sin(a); }
    const R = Math.hypot(cx, cy) / hist.length;                // mean resultant length; low = unsteady
    $('cal').hidden = !((acc != null && (acc < 0 || acc > 25)) || (hist.length >= 20 && R < 0.9));
    if (!manual) $('msg').hidden = true;
  }

  function screenAngle() {
    if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
    return typeof window.orientation === 'number' ? window.orientation : 0;
  }
  function onAbs(e) { if (e.alpha != null) { usingAbs = true; feed(360 - e.alpha + screenAngle()); } }
  let usingAbs = false;
  function onOri(e) {
    if (usingAbs) return;
    if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) feed(e.webkitCompassHeading + screenAngle(), e.webkitCompassAccuracy);
    else if (e.absolute && e.alpha != null) feed(360 - e.alpha + screenAngle());
  }

  async function start() {
    if (started) return;
    try {
      if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') { show('Motion permission was denied. Allow it in Settings → Safari → Motion & Orientation, then reload.'); return; }
      }
    } catch (err) { show('Could not ask for motion permission: ' + (err && err.message || err)); return; }
    started = true; $('start').hidden = true;
    if ('ondeviceorientationabsolute' in window) addEventListener('deviceorientationabsolute', onAbs);
    addEventListener('deviceorientation', onOri);
    setTimeout(() => { if (!got) noSensor(); }, 3000);
  }
  function show(t) { $('msg').textContent = t; $('msg').hidden = false; }
  function noSensor() {
    manual = true;
    show('No compass sensor on this device. Laptops and desktops usually have no magnetometer, and some browsers block sensors on file:// or plain http. Open it on a phone through the Hub (https). You can drag the dial to try it.');
    if (smoothed == null) feed(0);
  }

  /* manual drag (demo, only when no sensor) */
  let dragA = null;
  const dial = $('dial');
  const ang = (e) => { const b = dial.getBoundingClientRect(); return Math.atan2(e.clientX - b.left - b.width / 2, -(e.clientY - b.top - b.height / 2)) * 180 / Math.PI; };
  dial.addEventListener('pointerdown', (e) => { if (!manual) return; dragA = ang(e); dial.setPointerCapture(e.pointerId); });
  dial.addEventListener('pointermove', (e) => {
    if (dragA == null) return; const a = ang(e), d = sdiff(a, dragA); dragA = a;
    smoothed = norm(smoothed - d); const r = smoothed * Math.PI / 180; sx = Math.cos(r); sy = Math.sin(r); hist.length = 0;
  });
  dial.addEventListener('pointerup', () => { dragA = null; });

  /* render loop: shortest-path animation of the rose */
  function frame() {
    const h = shown();
    if (h != null) {
      disp += sdiff(-h, disp) * 0.25;
      rose.setAttribute('transform', `rotate(${disp.toFixed(2)})`);
      const r = Math.round(h) % 360;
      $('deg').textContent = r + '°'; $('card').textContent = point(h);
      if (P.lock != null) {
        const off = Math.round(sdiff(P.lock, h));
        $('lockinfo').textContent = `Locked ${Math.round(P.lock)}° ${point(P.lock)} · ` + (off === 0 ? 'on bearing' : `${Math.abs(off)}° ${off > 0 ? 'right' : 'left'}`);
      }
    }
    requestAnimationFrame(frame);
  }

  /* lock bearing (stored in the shown reference) */
  function renderLock() {
    lockg.hidden = P.lock == null;
    if (P.lock != null) lockg.firstElementChild.setAttribute('transform', `rotate(${P.lock})`);
    else $('lockinfo').textContent = '';
    $('lock').classList.toggle('on', P.lock != null);
    $('lock').textContent = P.lock != null ? 'Unlock' : 'Lock bearing';
  }
  function toggleLock() { const h = shown(); P.lock = P.lock != null || h == null ? null : Math.round(h); saveP(); renderLock(); }
  $('lock').onclick = toggleLock;
  dial.addEventListener('click', () => { if (!manual) toggleLock(); });

  /* north + theme segments */
  function renderSeg() {
    for (const b of $('north').children) b.classList.toggle('on', b.dataset.v === P.north);
    for (const b of $('theme').children) b.classList.toggle('on', b.dataset.v === P.theme);
    $('sub').textContent = P.north === 'true' ? (declOk ? 'True north' : 'True north needs your location — showing magnetic') : 'Magnetic north';
  }
  $('north').onclick = (e) => {
    const v = e.target.dataset && e.target.dataset.v; if (!v) return;
    if (P.lock != null && v !== P.north && declOk) P.lock = norm(P.lock + (v === 'true' ? decl : -decl));
    P.north = v; saveP(); renderSeg(); renderLock();
    if (v === 'true' && !declOk) getLoc();
  };
  $('theme').onclick = (e) => { const v = e.target.dataset && e.target.dataset.v; if (!v) return; P.theme = v; saveP(); theme(); renderSeg(); };

  /* location once, cached */
  function getLoc() {
    if (!navigator.geolocation) { $('decl').textContent = 'No geolocation in this browser — True north unavailable.'; return; }
    $('decl').textContent = 'Getting location…';
    navigator.geolocation.getCurrentPosition((p) => {
      P.loc = { lat: p.coords.latitude, lon: p.coords.longitude, ts: Date.now() }; saveP(); calcDecl(); renderSeg();
    }, (err) => { $('decl').textContent = 'Location failed (' + err.message + '). True north needs it; showing magnetic.'; renderSeg(); },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 86400000 });
  }
  $('loc').onclick = getLoc;

  /* wake lock */
  let wl = null;
  async function wake() {
    if (!P.awake || document.visibilityState !== 'visible' || wl) return;
    try { wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', () => { wl = null; }); } catch (_) { wl = null; }
  }
  const aw = $('awake');
  if (!('wakeLock' in navigator)) { aw.disabled = true; aw.parentElement.title = 'Wake Lock is not supported in this browser'; aw.parentElement.classList.add('mut'); }
  aw.checked = !!P.awake;
  aw.onchange = () => { P.awake = aw.checked; saveP(); if (P.awake) wake(); else if (wl) { wl.release(); wl = null; } };
  document.addEventListener('visibilitychange', wake);

  $('start').onclick = start;
  calcDecl(); renderSeg(); renderLock(); wake();
  // no permission prompt needed (Android/desktop): start right away; iOS keeps the button for the tap
  if (!(window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function')) start();
  if (!window.DeviceOrientationEvent) noSensor();
  requestAnimationFrame(frame);
})();
