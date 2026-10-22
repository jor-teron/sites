/*
 * Taskbar busy meter (hub/drives/hub_traymeter.js) — OPTIONAL, off by default: Settings → Desktop →
 * "Busy meter in the taskbar" (localStorage 'sites-hub.trayMeter' = '1'). Desktop mode only.
 * A small button left of the clock: a 30 s sparkline + "12%" = the Hub main thread's busy
 * ESTIMATE (shared/perf/busy_meter.js, same as System Monitor → CPU). Click = System Monitor on
 * its CPU tab. While off it runs nothing; it also pauses while the page is hidden.
 * Turns on / off live (Settings' {type:'hub-prefs'} message / the storage event).
 */
(function () {
  'use strict';
  const bar = document.getElementById('wm-taskbar');
  if (!bar || !window.BusyMeter) return;
  const KEY = 'sites-hub.trayMeter';
  const meter = BusyMeter.create();
  const vals = [];
  let b = null, cv = null, txt = null, t = 0;

  const on = () => { try { return localStorage.getItem(KEY) === '1'; } catch (_) { return false; } };

  function build() {
    b = document.createElement('button');
    b.type = 'button'; b.className = 'wm-meter';
    b.title = 'Hub busy (estimate) \u2014 open System Monitor';
    b.setAttribute('aria-label', b.title);
    cv = document.createElement('canvas'); cv.width = 72; cv.height = 32;
    txt = document.createElement('span'); txt.textContent = '\u2014';
    b.append(cv, txt);
    b.addEventListener('click', () => { if (window.__hubOpenApp) window.__hubOpenApp('apps/system/sysmon/', { hash: 'cpu' }); });
    const clock = bar.querySelector('.wm-clock');
    bar.insertBefore(b, clock || null);
  }
  function paint() {
    const g = cv.getContext('2d'), w = cv.width, h = cv.height;
    g.clearRect(0, 0, w, h);
    if (!vals.length) return;
    g.beginPath();
    vals.forEach((v, i) => { const x = w - (vals.length - 1 - i) * (w / 29), y = h - 2 - (h - 4) * v; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.lineWidth = 3; g.lineJoin = 'round';
    g.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6ea8fe';
    g.stroke();
  }
  function tick() {
    if (document.hidden) return;
    const v = meter.take();
    vals.push(v); if (vals.length > 30) vals.shift();
    txt.textContent = Math.round(v * 100) + '%';
    paint();
  }
  function sync() {
    const want = on();
    if (want && !b) { build(); meter.start(); t = setInterval(tick, 1000); }
    else if (!want && b) { clearInterval(t); t = 0; meter.stop(); b.remove(); b = null; vals.length = 0; }
  }
  document.addEventListener('visibilitychange', () => {
    if (!b) return;
    if (document.hidden) meter.stop(); else { meter.start(); meter.take(); }
  });
  window.addEventListener('storage', (e) => { if (!e.key || e.key === KEY) sync(); });
  window.addEventListener('message', (e) => { if (e.origin === location.origin && e.data && e.data.type === 'hub-prefs') setTimeout(sync, 0); });
  sync();
})();
