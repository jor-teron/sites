/*
 * Eye comfort (hub/core/hub_eye.js), H63. Like Night Light / Night Shift: a warm orange layer over the
 * whole Hub (windows, app iframes, taskbar, menus, Phone mode bars, pop-ups), so the screen looks warmer.
 * The layer #hub-eye is position:fixed, inset 0, the top z-index and pointer-events:none: every tap,
 * click, scroll and key goes straight through to what is under it. It multiplies (mix-blend-mode:
 * multiply), so white turns warm instead of grey; a browser without blend modes gets a plain thin
 * orange tint. It fades in / out over a few seconds when the schedule or the 🌙 button turns it on / off,
 * and follows the Warmth slider quickly. A webpage cannot change the real screen colour, so the phone's
 * status bar, other tabs and other apps are not warmed.
 *
 * localStorage keys (Settings › Look › Eye comfort; Shared group of Send profile, hub_profile.js):
 *   sites-hub.eyeWarm  warmth 0..100; '' = 50 (default), '0' = Off (no layer even when on)
 *   sites-hub.eyeMode  '' = Off (default) | 'always' | 'sched' (between eyeFrom and eyeTo)
 *   sites-hub.eyeFrom  'HH:MM' start, '' = 19:00      sites-hub.eyeTo 'HH:MM' end, '' = 06:00
 *   sites-hub.eyeNow   🌙 manual override, '1@<period>' = on / '0@<period>' = off; it only counts while
 *                      the schedule is still in that period (HubDayNight.periodId), so it lasts until the
 *                      next scheduled change (or a change of Mode). Not synced (hub_profile.js SYNC_SKIP).
 *   sites-hub.barEye   Hub bar 🌙 button, '1' = shown (default hidden; hub_prefs.js BAR, sec_hubbar.js)
 * Schedule checks: every whole minute and when the page becomes visible again (HubDayNight.watch), plus
 * every HubPrefs.apply() (Settings changes, storage events from other tabs).
 * API: window.HubEye { apply(), toggle(), isOn(), level() (0..1 layer opacity), state() }
 */
(function () {
  'use strict';
  const P = 'sites-hub.';
  const DN = window.HubDayNight;
  const root = document.documentElement;
  const get = (k) => { try { return localStorage.getItem(P + k) || ''; } catch (_) { return ''; } };
  const put = (k, v) => { try { if (v) localStorage.setItem(P + k, v); else localStorage.removeItem(P + k); } catch (_) { /* blocked */ } };
  const MAX = 0.6;            // layer opacity at Very warm (100)
  const FADE = 3;             // s, schedule / 🌙 on-off fade
  const QUICK = 0.25;         // s, slider changes

  const css = document.createElement('style');
  css.id = 'hub-eye-css';
  css.textContent =
    '#hub-eye{position:fixed;inset:0;z-index:2147483647;pointer-events:none;opacity:0;' +
    'background:rgb(255,150,50);mix-blend-mode:multiply;transition:opacity ' + FADE + 's ease}' +
    '#hub-eye[hidden]{display:none}' +
    '@supports not (mix-blend-mode:multiply){#hub-eye{background:rgb(255,120,0);mix-blend-mode:normal}}' +
    'html.hub-motion-off #hub-eye{transition:none}' +
    '.eye-btn{position:relative;min-width:40px;font-size:20px;line-height:1}' +
    '.wm-tray .eye-btn{min-width:var(--tb-btn);font-size:calc(var(--wm-task-h) * 0.42)}' +
    '.eye-btn .eye-ico{display:inline-block;filter:grayscale(.85);opacity:.75;transition:filter .3s,opacity .3s}' +
    '.eye-btn.on .eye-ico{filter:none;opacity:1;text-shadow:0 0 8px rgba(255,170,60,.9)}';
  document.head.appendChild(css);
  const blend = !(window.CSS && CSS.supports) || CSS.supports('mix-blend-mode', 'multiply');

  let layer = null, lastOn = null, lastWarm = null;
  function ensure() {
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'hub-eye';
    layer.setAttribute('aria-hidden', 'true');
    layer.hidden = true;
    layer.addEventListener('transitionend', () => { if (layer && +layer.style.opacity === 0) layer.hidden = true; });
    (document.body || root).appendChild(layer);
    return layer;
  }

  const warm = () => { const v = get('eyeWarm'); if (v === '') return 50; const n = Math.round(+v); return isFinite(n) ? Math.max(0, Math.min(100, n)) : 50; };
  const mode = () => { const m = get('eyeMode'); return m === 'always' || m === 'sched' ? m : ''; };
  const from = () => get('eyeFrom') || DN.DEF.from;
  const to = () => get('eyeTo') || DN.DEF.to;
  const now = () => DN.now();
  function scheduled() {
    const m = mode();
    return m === 'always' || (m === 'sched' && DN.inRange(from(), to(), now()));
  }
  const period = () => (mode() === 'sched' ? DN.periodId(from(), to(), now()) : (mode() || 'off'));
  /* the 🌙 override, or null when there is none (or it belonged to an earlier period: then it is dropped) */
  function override() {
    const v = get('eyeNow');
    if (!v) return null;
    const m = /^([01])@(.+)$/.exec(v);
    if (m && m[2] === period()) return m[1] === '1';
    put('eyeNow', '');
    return null;
  }
  function isOn() { const o = override(); return (o == null ? scheduled() : o) && warm() > 0; }
  const level = () => (isOn() ? (warm() / 100) * (blend ? MAX : MAX * 0.5) : 0);

  function apply() {
    const on = isOn(), w = warm(), lv = level();
    const btn = document.getElementById('eye-btn');
    if (btn) {
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.title = on ? 'Eye comfort: on (click to turn off)' : 'Eye comfort: off (click to turn on)';
    }
    root.classList.toggle('hub-eye-on', on);
    if (!on && !layer) { lastOn = on; lastWarm = w; return; }
    const el = ensure();
    // on / off = slow fade; only the warmth changed (slider) = quick
    // (nothing changed, e.g. the same change seen twice via apply() + the storage event: keep the running fade)
    if (lastOn === null) el.style.transitionDuration = '0s';   // page load: no fade
    else if (lastOn !== on) el.style.transitionDuration = '';
    else if (lastWarm !== w) el.style.transitionDuration = QUICK + 's';
    if (on) {
      if (el.hidden) { el.hidden = false; void el.offsetWidth; }   // start the fade from 0
      el.style.opacity = String(Math.round(lv * 1000) / 1000);
    } else {
      el.style.opacity = '0';
      if (root.classList.contains('hub-motion-off') || el.hidden) el.hidden = true;
    }
    lastOn = on; lastWarm = w;
  }
  /** 🌙: turn on / off now; lasts until the next scheduled change (or a change of Mode) */
  function toggle() {
    const want = !isOn();
    if (want && warm() === 0) put('eyeWarm', '');   // slider at Off: 🌙 on uses the default warmth
    put('eyeNow', want === (scheduled() && warm() > 0) ? '' : (want ? '1' : '0') + '@' + period());
    apply();
    return want;
  }
  function state() {
    return { on: isOn(), warm: warm(), mode: mode(), from: from(), to: to(), override: override(), scheduled: scheduled(),
      next: mode() === 'sched' ? DN.nextChange(from(), to(), now()) : null, level: level() };
  }

  window.HubEye = { apply, toggle, isOn, level, state };
  const wire = () => {
    const btn = document.getElementById('eye-btn');
    if (btn && !btn.dataset.eye) { btn.dataset.eye = '1'; btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(); }); }
    apply();
  };
  if (document.body) wire(); else document.addEventListener('DOMContentLoaded', wire);
  DN.watch(apply);
  window.addEventListener('storage', (e) => { if (!e.key || e.key.indexOf(P + 'eye') === 0) apply(); });
})();
