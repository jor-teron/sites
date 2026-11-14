/* Clock Reading CR5 — time maths and words (no drawing). A time is t = minutes since midnight (0..1439).
   CR.words(t) gives British-style kid wording: "seven o'clock", "five past nine", "quarter past three", "half past twelve",
   "twenty to five", "seven minutes past two". CR.utcNow() is the real time in GMT (UTC). CR3: no quizzes any more.
   CR5: pure hand-drag maths (no DOM) for dragging the hands: CR.dragMinute / CR.dragHour / CR.pickHand. */
window.CR = window.CR || {};
(() => {
  const C = window.CR;
  const NUM = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen',
    'quarter', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  const num = n => n <= 20 ? NUM[n] : 'twenty-' + NUM[n - 20];
  C.norm = t => ((Math.round(t) % 1440) + 1440) % 1440;
  C.h24 = t => Math.floor(C.norm(t) / 60);
  C.min = t => C.norm(t) % 60;
  C.h12 = t => (C.h24(t) % 12) || 12;
  C.pad = n => (n < 10 ? '0' : '') + n;
  C.fmt12 = (t, ampm) => C.h12(t) + ':' + C.pad(C.min(t)) + (ampm ? (C.h24(t) < 12 ? ' AM' : ' PM') : '');
  C.fmt24 = t => C.pad(C.h24(t)) + ':' + C.pad(C.min(t));
  C.words = t => {
    const m = C.min(t), h = C.h12(t), next = (h % 12) + 1;
    if (m === 0) return NUM[h] + ' o\u2019clock';
    if (m === 30) return 'half past ' + NUM[h];
    const n = m < 30 ? m : 60 - m, unit = n === 15 || n % 5 === 0 ? '' : n === 1 ? ' minute' : ' minutes';
    return num(n) + unit + (m < 30 ? ' past ' + NUM[h] : ' to ' + NUM[next]);
  };
  C.part = t => { const h = C.h24(t); return h < 5 ? 'at night' : h < 12 ? 'in the morning' : h < 17 ? 'in the afternoon' : h < 21 ? 'in the evening' : 'at night'; };

  // ---------- CR5: dragging the hands (angles in degrees, 0 = 12 o'clock, clockwise) ----------
  C.normDeg = a => ((a % 360) + 360) % 360;
  C.angDist = (a, b) => { const d = Math.abs(C.normDeg(a) - C.normDeg(b)); return Math.min(d, 360 - d); };
  C.hourAngle = t => (C.h24(t) % 12) * 30 + C.min(t) * 0.5;
  C.minAngle = t => C.min(t) * 6;
  // Minute hand: snaps to whole minutes. Passing 12 clockwise adds an hour, anticlockwise takes one off (23:59 -> 0:00 wraps).
  // wrap=false (the first touch) only sets the minutes inside the current hour.
  C.dragMinute = (t, angle, wrap) => {
    const m0 = C.min(t), m = Math.round(C.normDeg(angle) / 6) % 60; let h = C.h24(t);
    if (wrap !== false) { const d = m - m0; if (d > 30) h -= 1; else if (d < -30) h += 1; }
    return C.norm(h * 60 + m);
  };
  // Hour hand: sets the time inside the current AM / PM half (the minutes come along, half a degree each).
  // Passing 12 flips AM <-> PM, so 11 PM -> 12 AM -> 1 AM goes on round; wrap=false on the first touch.
  C.dragHour = (t, angle, wrap) => {
    const n = C.norm(t), half0 = n % 720, half = Math.round(C.normDeg(angle) * 2) % 720; let base = n - half0;
    if (wrap !== false) { const d = half - half0; if (d > 360) base -= 720; else if (d < -360) base += 720; }
    return C.norm(base + half);
  };
  // Which hand a touch at (angle, radius r on a 98-unit face) grabs: null, 'hour' or 'minute'. hourLen / minLen are the hand lengths.
  C.pickHand = (t, angle, r, hourLen, minLen, hasMinute) => {
    if (!(r >= 6) || r > (hasMinute ? minLen : hourLen) + 14) return null;
    const tol = r < 22 ? 40 : 22, dh = C.angDist(angle, C.hourAngle(t)), dm = hasMinute ? C.angDist(angle, C.minAngle(t)) : 999;
    const okH = dh <= tol && r <= hourLen + 14, okM = dm <= tol;
    if (okH && okM) return r <= hourLen + 4 ? (dh <= dm + 8 ? 'hour' : 'minute') : 'minute';
    return okH ? 'hour' : okM ? 'minute' : null;
  };
  C.utcNow = () => { const d = new Date(); return { t: d.getUTCHours() * 60 + d.getUTCMinutes(), s: d.getUTCSeconds() }; };
})();
