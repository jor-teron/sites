/* Video Trimmer — vt_helpers.js: time format/parse, clamp/no-cross, pixel↔time. VT1 */
(function (root) {
  'use strict';

  var MIN_GAP = 0.1;

  /** Format seconds as mm:ss.s (always one decimal). */
  function formatTime(seconds) {
    var t = Number(seconds);
    if (!isFinite(t) || t < 0) t = 0;
    var mins = Math.floor(t / 60);
    var secs = t - mins * 60;
    var s = secs.toFixed(1);
    if (Number(s) >= 60) {
      mins += 1;
      s = '0.0';
    }
    if (s.indexOf('.') === 1) s = '0' + s;
    return mins + ':' + s;
  }

  /**
   * Parse mm:ss.s / m:ss / ss.s / plain seconds into a number.
   * Returns NaN when the string is not a usable time.
   */
  function parseTime(str) {
    var s = String(str == null ? '' : str).trim();
    if (!s) return NaN;
    if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    var m = s.match(/^(\d+):(\d{1,2})(?:\.(\d+))?$/);
    if (!m) return NaN;
    var mins = parseInt(m[1], 10);
    var secs = parseInt(m[2], 10);
    if (secs >= 60) return NaN;
    var frac = m[3] ? parseFloat('0.' + m[3]) : 0;
    return mins * 60 + secs + frac;
  }

  /**
   * Keep start/end inside [0, duration] with a minimum gap.
   * which: 'start' | 'end' | 'both' — which side the user just moved.
   */
  function clampRange(start, end, duration, minGap, which) {
    var gap = minGap == null ? MIN_GAP : Number(minGap);
    if (!isFinite(gap) || gap < 0) gap = MIN_GAP;
    var dur = Number(duration);
    if (!isFinite(dur) || dur < 0) dur = 0;
    var a = Number(start);
    var b = Number(end);
    if (!isFinite(a)) a = 0;
    if (!isFinite(b)) b = dur;
    if (dur === 0) return { start: 0, end: 0 };
    if (gap > dur) gap = dur;

    a = Math.max(0, Math.min(dur, a));
    b = Math.max(0, Math.min(dur, b));

    if (which === 'start') {
      if (a > b - gap) a = Math.max(0, b - gap);
    } else if (which === 'end') {
      if (b < a + gap) b = Math.min(dur, a + gap);
    } else {
      if (b < a + gap) {
        if (a + gap <= dur) b = a + gap;
        else {
          b = dur;
          a = Math.max(0, b - gap);
        }
      }
    }
    return { start: a, end: b };
  }

  function timeToRatio(t, duration) {
    var dur = Number(duration);
    if (!isFinite(dur) || dur <= 0) return 0;
    var v = Number(t);
    if (!isFinite(v)) v = 0;
    return Math.max(0, Math.min(1, v / dur));
  }

  function ratioToTime(ratio, duration) {
    var dur = Number(duration);
    if (!isFinite(dur) || dur <= 0) return 0;
    var r = Number(ratio);
    if (!isFinite(r)) r = 0;
    r = Math.max(0, Math.min(1, r));
    return r * dur;
  }

  /** Map an x pixel on a track of width w to a time. */
  function pixelToTime(px, trackWidth, duration) {
    var w = Number(trackWidth);
    if (!isFinite(w) || w <= 0) return 0;
    return ratioToTime(Number(px) / w, duration);
  }

  function timeToPixel(t, trackWidth, duration) {
    var w = Number(trackWidth);
    if (!isFinite(w) || w <= 0) return 0;
    return timeToRatio(t, duration) * w;
  }

  var api = {
    MIN_GAP: MIN_GAP,
    formatTime: formatTime,
    parseTime: parseTime,
    clampRange: clampRange,
    timeToRatio: timeToRatio,
    ratioToTime: ratioToTime,
    pixelToTime: pixelToTime,
    timeToPixel: timeToPixel
  };

  root.VTHelpers = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
