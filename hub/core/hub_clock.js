/*
 * H160 Desktop analog clock (hub/core/hub_clock.js) — a small SVG clock on the Hub
 * desktop (desktop/desktop.html only, not Phone). Off by default
 * (Settings › Desktop › Show analog clock on the desktop; sites-hub.deskClock = '1').
 *
 * Look: thin cream ring, see-through face, cream hour and minute hands, red second
 * hand, a small centre dot, subtle ticks at 12 / 3 / 6 / 9, no numbers. Soft shadow
 * so it reads on any wallpaper. Sits above the wallpaper, below windows.
 *
 * Drag to move (position remembered in sites-hub.deskClockPos). Right-click: Small /
 * Medium / Large (sites-hub.deskClockSize) and Hide clock (turns the Settings switch
 * off). Hands update once a second (setTimeout aligned to the next second, not rAF).
 * Pauses while a window is maximised (.wm-max, not minimised, not on the other
 * workspace), the screen is locked, a break is on, or the tab is hidden — same
 * signals as hub/drives/hub_live_wallpaper.js shouldPause.
 *
 * API: window.HubClock (also module.exports in Node): SIZES, MARGIN, prefEnabled,
 *   normalizeSize, sizePx, handAngles, nextSecondDelay, parsePos, formatPos,
 *   defaultPos, clampPos, shouldPause, isMaximisedClass, shouldShow, apply.
 */
(function (global) {
  'use strict';

  const SIZES = { s: 88, m: 128, l: 176 };
  const MARGIN = 16;
  const CREAM = '#f3ead2';
  const RED = '#e53935';
  const KEY_ON = 'deskClock';
  const KEY_SIZE = 'deskClockSize';
  const KEY_POS = 'deskClockPos';
  const P = 'sites-hub.';

  function prefEnabled(v) {
    return v === '1';
  }

  function normalizeSize(v) {
    return (v === 's' || v === 'l') ? v : 'm';
  }

  function sizePx(v) {
    return SIZES[normalizeSize(v)];
  }

  /** Clock-hand angles in degrees, clockwise from 12. */
  function handAngles(date) {
    const d = date || new Date(0);
    const s = d.getSeconds();
    const m = d.getMinutes();
    const h = d.getHours() % 12;
    return {
      hour: (h * 30) + (m * 0.5) + (s * (0.5 / 60)),
      minute: (m * 6) + (s * 0.1),
      second: s * 6
    };
  }

  function nextSecondDelay(nowMs) {
    const t = nowMs == null ? 0 : Number(nowMs);
    const rem = ((t % 1000) + 1000) % 1000;
    return Math.max(1, 1000 - rem);
  }

  function parsePos(raw) {
    if (raw == null || raw === '') return null;
    const s = String(raw).trim();
    let x, y;
    if (s.charAt(0) === '{') {
      try {
        const o = JSON.parse(s);
        x = o && o.x; y = o && o.y;
      } catch (_) { return null; }
    } else {
      const p = s.split(',');
      if (p.length < 2) return null;
      x = p[0]; y = p[1];
    }
    x = +x; y = +y;
    if (!isFinite(x) || !isFinite(y)) return null;
    return { x: Math.round(x), y: Math.round(y) };
  }

  function formatPos(x, y) {
    return Math.round(x) + ',' + Math.round(y);
  }

  function defaultPos(viewW, viewH, size, margin, taskH, taskTop) {
    const m = margin == null ? MARGIN : margin;
    const s = size || SIZES.m;
    const th = taskH || 0;
    const vw = viewW || 0, vh = viewH || 0;
    const x = vw - s - m;
    const y = taskTop ? (th + m) : m;
    return clampPos(x, y, s, vw, vh, th, taskTop);
  }

  function clampPos(x, y, size, viewW, viewH, taskH, taskTop) {
    const s = size || 0;
    const th = taskH || 0;
    const vw = viewW || 0, vh = viewH || 0;
    const minX = 0;
    const maxX = Math.max(0, vw - s);
    const minY = taskTop ? th : 0;
    const maxY = Math.max(minY, taskTop ? (vh - s) : (vh - th - s));
    const nx = Math.max(minX, Math.min(x == null ? 0 : x, maxX));
    const ny = Math.max(minY, Math.min(y == null ? 0 : y, maxY));
    return { x: Math.round(nx), y: Math.round(ny) };
  }

  function shouldPause(opts) {
    const o = opts || {};
    if (o.hidden) return true;
    if (o.locked) return true;
    if (o.breakOn) return true;
    if (o.maximised) return true;
    return false;
  }

  /** True for a maximised window on this workspace (not minimised, not .wm-off). */
  function isMaximisedClass(cls) {
    const c = ' ' + String(cls || '') + ' ';
    return c.indexOf(' wm-max ') >= 0 && c.indexOf(' wm-min ') < 0 && c.indexOf(' wm-off ') < 0;
  }

  function shouldShow(opts) {
    const o = opts || {};
    return prefEnabled(o.pref) && !!o.isDesktop;
  }

  const api = {
    SIZES: SIZES,
    MARGIN: MARGIN,
    prefEnabled: prefEnabled,
    normalizeSize: normalizeSize,
    sizePx: sizePx,
    handAngles: handAngles,
    nextSecondDelay: nextSecondDelay,
    parsePos: parsePos,
    formatPos: formatPos,
    defaultPos: defaultPos,
    clampPos: clampPos,
    shouldPause: shouldPause,
    isMaximisedClass: isMaximisedClass,
    shouldShow: shouldShow
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  window.HubClock = api;

  let el = null, hourEl = null, minuteEl = null, secondEl = null;
  let timer = 0, paused = false, dragging = false, sizeId = 'm';
  let pos = null, observer = null, started = false;

  function rd(k) {
    try { return localStorage.getItem(P + k) || ''; } catch (_) { return ''; }
  }
  function wr(k, v) {
    try {
      if (v == null || v === '') localStorage.removeItem(P + k);
      else localStorage.setItem(P + k, String(v));
    } catch (_) { /* blocked */ }
  }

  function isDesktop() {
    return !!(document.body && document.body.classList.contains('wm-desktop'));
  }

  function taskbar() {
    const root = document.documentElement;
    const top = root && root.classList.contains('hub-task-top');
    let h = 40;
    try {
      const cs = getComputedStyle(root);
      const px = parseFloat(cs.getPropertyValue('--wm-task-h'));
      if (isFinite(px) && px > 0) h = px;
    } catch (_) { /* no css */ }
    return { h: h, top: !!top };
  }

  function viewSize() {
    const wrap = document.getElementById('frame-wrap');
    if (wrap && wrap.clientWidth) return { w: wrap.clientWidth, h: wrap.clientHeight };
    return { w: window.innerWidth || 0, h: window.innerHeight || 0 };
  }

  function pauseSignals() {
    const root = document.documentElement;
    const max = !!(document.querySelector && document.querySelector('.wm-max:not(.wm-min):not(.wm-off)'));
    return {
      hidden: !!document.hidden,
      locked: !!(root && root.classList.contains('hub-locked')),
      breakOn: !!(root && root.classList.contains('hub-break')),
      maximised: max
    };
  }

  function rotate(node, deg) {
    if (node) node.setAttribute('transform', 'rotate(' + deg + ' 50 50)');
  }

  function paint(date) {
    const a = handAngles(date || new Date());
    rotate(hourEl, a.hour);
    rotate(minuteEl, a.minute);
    rotate(secondEl, a.second);
    if (el) {
      const d = date || new Date();
      let h = d.getHours(), m = d.getMinutes();
      const ap = h >= 12 ? 'PM' : 'AM';
      h = h % 12; if (!h) h = 12;
      el.setAttribute('aria-label', 'Clock ' + h + ':' + (m < 10 ? '0' : '') + m + ' ' + ap);
    }
  }

  function stopTimer() {
    if (timer) { clearTimeout(timer); timer = 0; }
  }

  function schedule() {
    stopTimer();
    if (paused || !el || el.hidden) return;
    timer = setTimeout(tick, nextSecondDelay(Date.now()));
  }

  function tick() {
    if (paused || !el || el.hidden) return;
    paint(new Date());
    schedule();
  }

  function pause() {
    paused = true;
    stopTimer();
    if (el) el.setAttribute('data-paused', '1');
  }

  function resume() {
    if (shouldPause(pauseSignals())) return;
    paused = false;
    if (el) el.removeAttribute('data-paused');
    paint(new Date());
    schedule();
  }

  function checkState() {
    if (!el || el.hidden) return;
    const now = shouldPause(pauseSignals());
    if (now && !paused) pause();
    else if (!now && paused) resume();
  }

  function place(x, y) {
    if (!el) return;
    const tb = taskbar();
    const vs = viewSize();
    const p = clampPos(x, y, sizePx(sizeId), vs.w, vs.h, tb.h, tb.top);
    pos = p;
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
  }

  function remember() {
    if (pos) wr(KEY_POS, formatPos(pos.x, pos.y));
  }

  function applySize(id) {
    sizeId = normalizeSize(id);
    if (!el) return;
    const px = sizePx(sizeId);
    el.style.width = px + 'px';
    el.style.height = px + 'px';
    el.dataset.size = sizeId;
    const cur = pos || { x: 0, y: 0 };
    place(cur.x, cur.y);
  }

  function svgEl(name, attrs) {
    const n = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.keys(attrs).forEach((k) => n.setAttribute(k, attrs[k]));
    return n;
  }

  function buildSvg() {
    const svg = svgEl('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true', focusable: 'false' });
    svg.appendChild(svgEl('circle', { cx: '50', cy: '50', r: '46', fill: 'none', stroke: CREAM, 'stroke-width': '2.2' }));
    const ticks = [[50, 7, 50, 13], [93, 50, 87, 50], [50, 93, 50, 87], [7, 50, 13, 50]];
    ticks.forEach((t) => {
      svg.appendChild(svgEl('line', { x1: t[0], y1: t[1], x2: t[2], y2: t[3], stroke: CREAM, 'stroke-width': '1.8', 'stroke-linecap': 'round' }));
    });
    hourEl = svgEl('line', { id: 'hub-clock-hour', x1: '50', y1: '50', x2: '50', y2: '28', stroke: CREAM, 'stroke-width': '3.2', 'stroke-linecap': 'round' });
    minuteEl = svgEl('line', { id: 'hub-clock-minute', x1: '50', y1: '50', x2: '50', y2: '16', stroke: CREAM, 'stroke-width': '2.1', 'stroke-linecap': 'round' });
    secondEl = svgEl('line', { id: 'hub-clock-second', x1: '50', y1: '54', x2: '50', y2: '12', stroke: RED, 'stroke-width': '1.1', 'stroke-linecap': 'round' });
    svg.appendChild(hourEl);
    svg.appendChild(minuteEl);
    svg.appendChild(secondEl);
    svg.appendChild(svgEl('circle', { cx: '50', cy: '50', r: '2.4', fill: CREAM }));
    svg.appendChild(svgEl('circle', { cx: '50', cy: '50', r: '1.15', fill: RED }));
    return svg;
  }

  function mountParent() {
    return document.getElementById('wm-desk') || document.getElementById('frame-wrap') || document.body;
  }

  function deskPoint(clientX, clientY) {
    const parent = el && el.parentElement;
    if (parent && parent.getBoundingClientRect) {
      const r = parent.getBoundingClientRect();
      return { x: clientX - r.left, y: clientY - r.top };
    }
    return { x: clientX, y: clientY };
  }

  function onDrag(e) {
    if (!dragging || e.pointerId !== dragging.id) return;
    const p = deskPoint(e.clientX - dragging.dx, e.clientY - dragging.dy);
    place(p.x, p.y);
  }

  function endDrag(e) {
    if (!dragging || (e && e.pointerId !== dragging.id)) return;
    const id = dragging.id;
    dragging = false;
    if (el) {
      el.classList.remove('dragging');
      try { el.releasePointerCapture(id); } catch (_) { /* already */ }
    }
    document.removeEventListener('pointermove', onDrag);
    document.removeEventListener('pointerup', endDrag);
    document.removeEventListener('pointercancel', endDrag);
    remember();
  }

  function startDrag(e) {
    if (!el || e.button !== 0) return;
    const r = el.getBoundingClientRect();
    dragging = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top };
    el.classList.add('dragging');
    try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    document.addEventListener('pointermove', onDrag);
    document.addEventListener('pointerup', endDrag);
    document.addEventListener('pointercancel', endDrag);
    e.preventDefault();
  }

  function setSize(id) {
    applySize(id);
    wr(KEY_SIZE, sizeId === 'm' ? '' : sizeId);
    remember();
  }

  function hideClock() {
    wr(KEY_ON, '');
    if (window.HubPrefs) window.HubPrefs.apply();
    else apply();
    try {
      const origin = (location.protocol === 'file:' || location.origin === 'null') ? '*' : location.origin;
      window.postMessage({ type: 'hub-prefs', key: KEY_ON }, origin);
    } catch (_) { /* ignore */ }
  }

  function openMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    if (dragging) endDrag({ pointerId: dragging.id });
    const items = [
      { label: 'Small', hint: sizeId === 's' ? '\u2713' : '', action: () => setSize('s') },
      { label: 'Medium', hint: sizeId === 'm' ? '\u2713' : '', action: () => setSize('m') },
      { label: 'Large', hint: sizeId === 'l' ? '\u2713' : '', action: () => setSize('l') },
      { sep: true },
      { label: 'Hide clock', action: hideClock }
    ];
    if (window.CtxMenu && window.CtxMenu.open) window.CtxMenu.open(e.clientX, e.clientY, items);
  }

  function ensure() {
    if (el && el.parentElement) return el;
    el = document.getElementById('hub-desk-clock');
    if (!el) {
      el = document.createElement('div');
      el.id = 'hub-desk-clock';
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', 'Clock');
      el.appendChild(buildSvg());
    } else {
      hourEl = el.querySelector('#hub-clock-hour') || hourEl;
      minuteEl = el.querySelector('#hub-clock-minute') || minuteEl;
      secondEl = el.querySelector('#hub-clock-second') || secondEl;
      if (!hourEl) {
        el.textContent = '';
        el.appendChild(buildSvg());
      }
    }
    const parent = mountParent();
    if (parent && el.parentElement !== parent) parent.appendChild(el);
    if (!el._hubClockBound) {
      el._hubClockBound = true;
      el.addEventListener('pointerdown', startDrag);
      el.addEventListener('contextmenu', openMenu);
    }
    return el;
  }

  function hide() {
    stopTimer();
    paused = false;
    if (el) {
      el.hidden = true;
      el.removeAttribute('data-paused');
    }
  }

  function show() {
    ensure();
    el.hidden = false;
    applySize(rd(KEY_SIZE));
    const vs = viewSize();
    const tb = taskbar();
    const saved = parsePos(rd(KEY_POS));
    if (saved) place(saved.x, saved.y);
    else {
      const d = defaultPos(vs.w, vs.h, sizePx(sizeId), MARGIN, tb.h, tb.top);
      place(d.x, d.y);
    }
    if (shouldPause(pauseSignals())) {
      paint(new Date());
      pause();
    } else {
      resume();
    }
  }

  function apply() {
    if (shouldShow({ pref: rd(KEY_ON), isDesktop: isDesktop() })) show();
    else hide();
  }

  function listen() {
    if (started) return;
    started = true;
    document.addEventListener('visibilitychange', checkState);
    window.addEventListener('resize', () => {
      if (!el || el.hidden) return;
      const cur = pos || { x: 0, y: 0 };
      place(cur.x, cur.y);
    });
    try {
      observer = new MutationObserver(() => {
        checkState();
        if (el && !el.hidden && !isDesktop()) hide();
        else if (!el || el.hidden) apply();
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      if (document.body) {
        observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'], childList: true });
      }
    } catch (_) { /* no MutationObserver */ }
  }

  api.apply = apply;
  api.hide = hide;
  api.show = show;
  api.tick = tick;
  api.pause = pause;
  api.resume = resume;
  api.checkState = checkState;
  api.isPaused = () => paused;
  api.element = () => el;

  listen();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();
})(typeof window !== 'undefined' ? window : globalThis);
