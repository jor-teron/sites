/* Video Editor — ve_helpers.js: time format/parse, clamp, pixel↔time, names. VD1 */
(function (root) {
  'use strict';

  var MIN_GAP = 0.1;
  var MIN_EXPORT = 0.5;
  var DEFAULT_FPS = 30;

  function pad2(n) {
    n = String(n);
    return n.length < 2 ? '0' + n : n;
  }

  /** Format seconds as m:ss.s, or h:mm:ss.s when >= 1 hour. Always one decimal. */
  function formatTime(seconds) {
    var t = Number(seconds);
    if (!isFinite(t) || t < 0) t = 0;
    var hours = Math.floor(t / 3600);
    var rest = t - hours * 3600;
    var mins = Math.floor(rest / 60);
    var secs = rest - mins * 60;
    var s = secs.toFixed(1);
    if (Number(s) >= 60) {
      mins += 1;
      s = '0.0';
    }
    if (mins >= 60) {
      hours += 1;
      mins = 0;
    }
    if (s.indexOf('.') === 1) s = '0' + s;
    if (hours > 0) return hours + ':' + pad2(mins) + ':' + s;
    return mins + ':' + s;
  }

  /**
   * Parse h:mm:ss.s / m:ss.s / m:ss / ss.s / plain seconds.
   * Returns NaN when the string is not a usable time.
   */
  function parseTime(str) {
    var s = String(str == null ? '' : str).trim();
    if (!s) return NaN;
    if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    var m = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?(?:\.(\d+))?$/);
    if (!m) return NaN;
    var a = parseInt(m[1], 10);
    var b = parseInt(m[2], 10);
    var frac = m[4] ? parseFloat('0.' + m[4]) : 0;
    if (m[3] != null && m[3] !== '') {
      var c = parseInt(m[3], 10);
      if (b >= 60 || c >= 60) return NaN;
      return a * 3600 + b * 60 + c + frac;
    }
    if (b >= 60) return NaN;
    return a * 60 + b + frac;
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

  function frameStep(fps) {
    var f = Number(fps);
    if (!isFinite(f) || f <= 0) f = DEFAULT_FPS;
    return 1 / f;
  }

  /** "clip.mp4" + webm mime → "clip_edited.webm" */
  function exportName(fileName, mimeType) {
    var base = String(fileName == null ? '' : fileName).trim();
    base = base.split(/[\\/]/).pop() || '';
    if (!base) base = 'video';
    base = base.replace(/\.[^.]+$/, '');
    if (!base) base = 'video';
    var mp4 = String(mimeType || '').indexOf('mp4') >= 0;
    return base + '_edited' + (mp4 ? '.mp4' : '.webm');
  }

  function isVideoFile(file) {
    if (!file) return false;
    if (file.type && file.type.indexOf('video/') === 0) return true;
    return /\.(mp4|webm|mkv|mov|ogv|ogg|avi|m4v|3gp|mpeg|mpg|wmv)$/i.test(file.name || '');
  }

  var api = {
    MIN_GAP: MIN_GAP,
    MIN_EXPORT: MIN_EXPORT,
    DEFAULT_FPS: DEFAULT_FPS,
    formatTime: formatTime,
    parseTime: parseTime,
    clampRange: clampRange,
    timeToRatio: timeToRatio,
    ratioToTime: ratioToTime,
    pixelToTime: pixelToTime,
    timeToPixel: timeToPixel,
    frameStep: frameStep,
    exportName: exportName,
    isVideoFile: isVideoFile
  };

  root.VEHelpers = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
