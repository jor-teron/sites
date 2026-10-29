/*
 * Day / night schedule (hub/core/hub_daynight.js), H63. A small shared helper for anything that
 * switches by the time of day: H63 Eye comfort now, H64 Auto theme later (same day / night times).
 * Times are 'HH:MM' strings in the device's local time. A range may run over midnight
 * (from '19:00' to '06:00' = evening + night). from === to = never on.
 * No storage of its own: callers pass their times in.
 *
 * API: window.HubDayNight
 *   .DEF            { from: '19:00', to: '06:00' } the default night
 *   .parse(t, d)    'HH:MM' → minutes after midnight (0..1439); bad input → parse(d) (or null)
 *   .fmt(min)       minutes → 'HH:MM'
 *   .inRange(from, to, now?)   true when now (Date, default new Date()) is inside [from, to)
 *   .lastChange(from, to, now?) Date of the latest start or end at or before now (the current period's start)
 *   .nextChange(from, to, now?) Date of the next start or end after now (null when from === to)
 *   .periodId(from, to, now?)  a string naming the current period ('2026-10-29T19:00|on'), so a manual
 *                              override can last 'until the next scheduled change'
 *   .watch(fn)      calls fn() at every whole minute and when the page becomes visible again (tab back,
 *                   phone unlocked: timers may have slept). Returns a stop function.
 *   .now()          new Date(); tests may replace HubDayNight.now to fake the clock.
 */
(function () {
  'use strict';
  const DEF = { from: '19:00', to: '06:00' };
  const DayNight = { DEF };
  DayNight.now = () => new Date();
  const at = (now) => (now instanceof Date ? now : DayNight.now());

  function parse(t, d) {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(t == null ? '' : t));
    if (m && +m[1] < 24 && +m[2] < 60) return +m[1] * 60 + +m[2];
    return d == null ? null : parse(d);
  }
  const pad = (n) => (n < 10 ? '0' : '') + n;
  const fmt = (min) => pad(Math.floor(min / 60) % 24) + ':' + pad(min % 60);
  const minsOf = (d) => d.getHours() * 60 + d.getMinutes();

  function inRange(from, to, now) {
    const f = parse(from, DEF.from), t = parse(to, DEF.to), n = minsOf(at(now));
    if (f === t) return false;
    return f < t ? (n >= f && n < t) : (n >= f || n < t);   // f > t: over midnight
  }
  /* a Date on now's day (+ dayOff) at minute m, local time */
  function dayAt(now, dayOff, m) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOff, 0, 0, 0, 0);
    d.setMinutes(m);
    return d;
  }
  function edges(from, to, now) {
    const f = parse(from, DEF.from), t = parse(to, DEF.to), out = [];
    for (let k = -1; k <= 1; k++) { out.push(dayAt(now, k, f), dayAt(now, k, t)); }
    return out.sort((a, b) => a - b);
  }
  function lastChange(from, to, now) {
    now = at(now);
    if (parse(from, DEF.from) === parse(to, DEF.to)) return null;
    let best = null;
    edges(from, to, now).forEach((d) => { if (d <= now) best = d; });
    return best;
  }
  function nextChange(from, to, now) {
    now = at(now);
    if (parse(from, DEF.from) === parse(to, DEF.to)) return null;
    return edges(from, to, now).find((d) => d > now) || null;
  }
  function periodId(from, to, now) {
    now = at(now);
    const l = lastChange(from, to, now);
    if (!l) return 'never';
    return l.getFullYear() + '-' + pad(l.getMonth() + 1) + '-' + pad(l.getDate()) + 'T' + fmt(minsOf(l)) +
      '|' + (inRange(from, to, now) ? 'on' : 'off');
  }

  function watch(fn) {
    let timer = 0, stopped = false;
    const tick = () => { try { fn(); } catch (e) { console.warn('HubDayNight', e); } };
    const arm = () => {
      clearTimeout(timer);
      if (stopped) return;
      const n = new Date();
      timer = setTimeout(() => { tick(); arm(); }, 60000 - (n.getSeconds() * 1000 + n.getMilliseconds()) + 50);
    };
    const vis = () => { if (document.visibilityState !== 'hidden') { tick(); arm(); } };
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('focus', vis);
    arm();
    return () => {
      stopped = true; clearTimeout(timer);
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('focus', vis);
    };
  }

  Object.assign(DayNight, { parse, fmt, inRange, lastChange, nextChange, periodId, watch });
  window.HubDayNight = DayNight;
})();
