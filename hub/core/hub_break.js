/*
 * Computer break (hub/core/hub_break.js), H65. A basic 25 / 5 timer: after Work length minutes of Hub
 * time a full-screen lock #hub-break covers the whole Hub (every window, app frame, the Hub bar, menus,
 * pop-ups) for Break length minutes, with a calm message, a big mm:ss countdown and a tip. There is no
 * Skip and no Snooze: it unlocks by itself when the countdown ends, and the next work period starts.
 * A webpage can only lock itself: other tabs and other apps on the computer stay usable.
 *
 * While locked: the overlay sits at the top z-index and takes every pointer / touch / wheel / right-click;
 * keydown / keyup / keypress are caught at window level (capture) and stopped (no Esc, no Tab, no
 * shortcuts); every other child of <body> gets the 'inert' attribute (no focus, no clicks), and focus is
 * pulled back to the overlay whenever it moves away (e.g. into an app iframe).
 *
 * Timer: plain wall-clock while the Hub is open (no idle detection). A gap longer than the break length
 * (the Hub was closed, the computer slept) counts as a break: the work period starts again on return.
 *
 * localStorage keys (Settings › Desktop › Computer break):
 *   sites-hub.breakOn    '1' = on; '' = Off (default)                       synced (Shared group)
 *   sites-hub.breakWork  work minutes 5..120, '' = 25                        synced (Shared group)
 *   sites-hub.breakLen   break minutes 1..30, '' = 5                         synced (Shared group)
 *   hub-break.breakStart ms when the current work period began               this device only (never synced)
 *   hub-break.breakEnd   ms when the running break ends ('' = no break)     this device only (never synced)
 *   hub-break.breakSeen  ms of the last 'Hub open' mark, every ~10 s (gap check after a close / sleep)
 * (the three hub-break.* keys sit outside 'sites-hub.' on purpose: no profile, no sync, no HubPrefs wake-ups)
 * A reload during a break restores the lock with the time left (breakEnd); the work timer survives
 * reloads (breakStart). Turning the setting off is refused while a break runs; if it arrives anyway
 * (another tab / a synced profile), the running break still finishes, then the timer stops.
 *
 * API: window.HubBreak { apply(), state(), locked(), canTurnOff(), work(), len(),
 *   start(sec) — start a break now (optional length in seconds; for testing) }
 */
(function () {
  'use strict';
  const P = 'sites-hub.';
  const root = document.documentElement;
  const S = 'hub-break.';   // this device's timer state: outside 'sites-hub.' so it is never in a profile / sync and
                            // its writes don't wake hub_prefs.js in other tabs
  const key = (k) => (k === 'breakOn' || k === 'breakWork' || k === 'breakLen' ? P : S) + k;
  const get = (k) => { try { return localStorage.getItem(key(k)) || ''; } catch (_) { return ''; } };
  const put = (k, v) => { try { if (v) localStorage.setItem(key(k), String(v)); else localStorage.removeItem(key(k)); } catch (_) { /* blocked */ } };
  const SEEN_EVERY = 10000;   // ms between 'still open' marks (breakSeen)
  const MIN = 60000;
  const norm = (v, def, lo, hi) => {
    const s = String(v == null ? '' : v).trim();
    if (!/^\d+$/.test(s)) return def;
    return Math.max(lo, Math.min(hi, parseInt(s, 10)));
  };
  const on = () => get('breakOn') === '1';
  const work = () => norm(get('breakWork'), 25, 5, 120);   // minutes
  const len = () => norm(get('breakLen'), 5, 1, 30);       // minutes
  const num = (k) => { const n = +get(k); return isFinite(n) && n > 0 ? n : 0; };
  const TIPS = [
    'Look at something 20 feet (6 m) away.', 'Stand up and stretch your arms and back.',
    'Drink a glass of water.', 'Roll your shoulders and relax your hands.',
    'Close your eyes and take a few slow breaths.', 'Walk around for a minute.'
  ];

  /* ---------- overlay ---------- */
  let el = null, timeEl = null, tipEl = null, isLocked = false, mo = null;
  const inerted = new Set();
  function build() {
    if (el) return el;
    el = document.createElement('div');
    el.id = 'hub-break';
    el.tabIndex = -1;
    el.setAttribute('role', 'alertdialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'hub-break-title');
    el.hidden = true;
    const box = document.createElement('div');
    box.className = 'hub-break-box';
    const ico = document.createElement('div');
    ico.className = 'hub-break-ico';
    ico.setAttribute('aria-hidden', 'true');
    ico.textContent = '\u2615';
    const h = document.createElement('h2');
    h.id = 'hub-break-title';
    h.textContent = 'Time for a break';
    timeEl = document.createElement('div');
    timeEl.className = 'hub-break-time';
    timeEl.setAttribute('aria-live', 'off');
    tipEl = document.createElement('p');
    tipEl.className = 'hub-break-tip';
    const sub = document.createElement('p');
    sub.className = 'hub-break-sub';
    sub.textContent = 'The Hub unlocks by itself when the timer ends.';
    box.append(ico, h, timeEl, tipEl, sub);
    el.appendChild(box);
    // every pointer / touch / wheel / menu event that lands on the lock stops here
    ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick', 'contextmenu',
      'touchstart', 'touchmove', 'touchend', 'wheel', 'dragstart', 'selectstart'].forEach((t) =>
      el.addEventListener(t, (e) => { if (e.cancelable) e.preventDefault(); e.stopPropagation(); }, { capture: true, passive: false }));
    return el;
  }
  function mount() {
    const b = document.body || root;
    if (el.parentNode !== b || b.lastElementChild !== el) b.appendChild(el);   // last child: above equal z-index layers
  }
  function setInert(v) {
    const b = document.body;
    if (!b) return;
    if (v) {
      for (const c of b.children) {
        if (c === el || c.tagName === 'SCRIPT' || c.id === 'hub-eye' || c.hasAttribute('inert')) continue;
        c.setAttribute('inert', ''); inerted.add(c);
      }
    } else {
      inerted.forEach((c) => c.removeAttribute('inert'));
      inerted.clear();
    }
  }
  /* keys: window capture runs before every other listener (document / element ones and the loader's) */
  function stopKey(e) {
    if (!isLocked) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  ['keydown', 'keyup', 'keypress'].forEach((t) => window.addEventListener(t, stopKey, true));
  function grab() {
    if (!isLocked || !el) return;
    const a = document.activeElement;
    if (a !== el) { try { if (a && a.blur) a.blur(); } catch (_) { /* ignore */ } try { el.focus({ preventScroll: true }); } catch (_) { el.focus(); } }
  }
  document.addEventListener('focusin', (e) => { if (isLocked && e.target !== el) grab(); }, true);
  window.addEventListener('blur', () => { if (isLocked) setTimeout(grab, 0); });   // focus went into an app iframe
  ['contextmenu', 'wheel', 'touchmove', 'dragstart', 'drop'].forEach((t) =>
    window.addEventListener(t, (e) => { if (isLocked) { if (e.cancelable) e.preventDefault(); e.stopImmediatePropagation(); } }, { capture: true, passive: false }));

  const mmss = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  };
  function lock(end) {
    build();
    if (!isLocked) {
      isLocked = true;
      tipEl.textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
      el.hidden = false;
      mount();
      setInert(true);
      root.classList.add('hub-break-on');
      grab();
      // anything added to <body> during the break (pop-ups, notes) is inert too, and the lock stays last
      if (window.MutationObserver && !mo) {
        mo = new MutationObserver(() => { if (isLocked) { mount(); setInert(true); } });
        mo.observe(document.body, { childList: true });
      }
    }
    timeEl.textContent = mmss(end - Date.now());
    el.setAttribute('aria-label', 'Time for a break, ' + timeEl.textContent + ' left');
  }
  function unlock() {
    if (!isLocked) return;
    isLocked = false;
    if (mo) { mo.disconnect(); mo = null; }
    setInert(false);
    if (el) { el.hidden = true; if (document.activeElement === el) el.blur(); }
    root.classList.remove('hub-break-on');
  }

  /* ---------- timer ---------- */
  let timer = 0;
  function tick() {
    const now = Date.now();
    const end = num('breakEnd');
    if (end && now < end) { lock(end); seenMark(now); return; }
    if (end) {   // the break is over: next work period
      put('breakEnd', '');
      unlock();
      if (on()) put('breakStart', now);
    } else unlock();
    if (!on()) { put('breakStart', ''); put('breakSeen', ''); stopTimer(); return; }
    const seen = num('breakSeen');
    let start = num('breakStart');
    // first run, a start in the future (clock change) or a long gap (Hub closed / asleep for a break length) = fresh period
    if (!start || start > now || (seen && now - seen >= len() * MIN)) { start = now; put('breakStart', now); }
    seenMark(now);
    if (now - start >= work() * MIN) startBreak(len() * MIN);
  }
  function seenMark(now) { if (now - num('breakSeen') >= SEEN_EVERY) put('breakSeen', now); }
  function startBreak(ms) {
    const now = Date.now();
    put('breakEnd', now + ms);
    put('breakStart', '');
    put('breakSeen', now);
    lock(now + ms);
    ensureTimer();
  }
  function ensureTimer() { if (!timer) timer = setInterval(tick, 1000); }
  function stopTimer() { if (timer) { clearInterval(timer); timer = 0; } }
  function apply() {
    if (on() || num('breakEnd')) { ensureTimer(); tick(); } else { stopTimer(); unlock(); put('breakStart', ''); put('breakSeen', ''); }
  }
  function locked() { const e = num('breakEnd'); return !!e && Date.now() < e; }
  function state() {
    const now = Date.now(), s = num('breakStart'), e = num('breakEnd');
    return { on: on(), work: work(), len: len(), locked: locked(),
      breakEndsIn: e && now < e ? e - now : 0,
      nextBreakIn: on() && !locked() && s ? Math.max(0, s + work() * MIN - now) : null };
  }

  window.HubBreak = { apply, state, locked, canTurnOff: () => !locked(), work, len,
    start: (sec) => startBreak(sec > 0 ? sec * 1000 : len() * MIN) };
  apply();   // at load: a reload during a break locks again at once
  // settings from Settings / another tab / a synced profile, or a break started / ended by another Hub tab
  // (not breakStart / breakSeen: every open tab works those out itself, so tabs never ping-pong)
  window.addEventListener('storage', (e) => { if (!e.key || e.key.indexOf(P + 'break') === 0 || e.key === S + 'breakEnd') apply(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) apply(); });
})();
