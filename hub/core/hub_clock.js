/*
 * Desktop analog clock (hub/core/hub_clock.js) — Web_OS identical desktop analog clock widget
 * on the Hub desktop (desktop/desktop.html only, not Phone).
 * (Settings › Desktop › Show analog clock on the desktop; sites-hub.deskClock = '1').
 *
 * Look & Feel (Web_OS identical):
 * - Circular face (250px diameter) with 3px subtle border rgba(226, 232, 240, 0.7)
 * - Fixed top-right positioning: top 16px, right 18px on the desktop surface
 * - Clean HTML5 elements: .analog-face, #handHour.hand.hour, #handMinute.hand.minute, #handSecond.hand.second, .analog-dot
 * - Hands: hour (width 6px, height 70px, #e2e8f0), minute (4px x 95px, #e2e8f0), second (2px x 108px, #f87171)
 * - Center dot: 10px diameter, #e2e8f0
 * - Non-intrusive: opacity 0.5, pointer-events none
 * - Auto-pauses when tab is hidden, screen is locked, or a window is maximised
 */
(function (global) {
  'use strict';

  const SIZE = 250;
  const KEY_ON = 'deskClock';
  const P = 'sites-hub.';

  function prefEnabled(v) {
    return v === '1';
  }

  function sizePx() {
    return SIZE;
  }

  /** Clock-hand angles in degrees (Web_OS formula: hour h*30 + m*0.5, minute m*6, second s*6). */
  function handAngles(date) {
    const d = date || new Date(0);
    const s = d.getSeconds();
    const m = d.getMinutes();
    const h = d.getHours() % 12;
    return {
      hour: (h * 30) + (m * 0.5),
      minute: m * 6,
      second: s * 6
    };
  }

  function nextSecondDelay(nowMs) {
    const t = nowMs == null ? 0 : Number(nowMs);
    const rem = ((t % 1000) + 1000) % 1000;
    return Math.max(1, 1000 - rem);
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
    SIZE: SIZE,
    sizePx: sizePx,
    prefEnabled: prefEnabled,
    handAngles: handAngles,
    nextSecondDelay: nextSecondDelay,
    shouldPause: shouldPause,
    isMaximisedClass: isMaximisedClass,
    shouldShow: shouldShow
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  window.HubClock = api;

  let el = null, hourEl = null, minuteEl = null, secondEl = null;
  let timer = 0, paused = false, started = false, observer = null;

  function rd(k) {
    try { return localStorage.getItem(P + k) || ''; } catch (_) { return ''; }
  }

  function isDesktop() {
    return !!(document.body && document.body.classList.contains('wm-desktop'));
  }

  function mountParent() {
    return document.getElementById('wm-desk') || document.getElementById('frame-wrap') || document.body;
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

  function paint(date) {
    const a = handAngles(date || new Date());
    if (hourEl) hourEl.style.transform = 'rotate(' + a.hour + 'deg)';
    if (minuteEl) minuteEl.style.transform = 'rotate(' + a.minute + 'deg)';
    if (secondEl) secondEl.style.transform = 'rotate(' + a.second + 'deg)';
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

  function buildClockDom() {
    const face = document.createElement('div');
    face.className = 'analog-face';

    hourEl = document.createElement('div');
    hourEl.className = 'hand hour';
    hourEl.id = 'handHour';

    minuteEl = document.createElement('div');
    minuteEl.className = 'hand minute';
    minuteEl.id = 'handMinute';

    secondEl = document.createElement('div');
    secondEl.className = 'hand second';
    secondEl.id = 'handSecond';

    const dot = document.createElement('div');
    dot.className = 'analog-dot';

    face.appendChild(hourEl);
    face.appendChild(minuteEl);
    face.appendChild(secondEl);
    face.appendChild(dot);
    return face;
  }

  function ensure() {
    if (el && el.parentElement) return el;
    el = document.getElementById('analogClock') || document.getElementById('hub-desk-clock');
    if (!el) {
      el = document.createElement('div');
      el.id = 'analogClock';
      el.className = 'analog-clock';
      el.setAttribute('aria-hidden', 'true');
      el.appendChild(buildClockDom());
    } else {
      hourEl = el.querySelector('#handHour, .hand.hour') || hourEl;
      minuteEl = el.querySelector('#handMinute, .hand.minute') || minuteEl;
      secondEl = el.querySelector('#handSecond, .hand.second') || secondEl;
      if (!hourEl || !minuteEl || !secondEl) {
        el.textContent = '';
        el.appendChild(buildClockDom());
      }
    }
    const parent = mountParent();
    if (parent && el.parentElement !== parent) parent.appendChild(el);
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
