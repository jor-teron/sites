/* Cooking Timer — ct_timers.js: endAt countdown, pause/resume, localStorage persistence. CT1 */
(function (root) {
  var CT = root.CT = root.CT || {};
  var KEY = 'cookingTimer.timers';

  function clamp(n, lo, hi) {
    n = Number(n);
    if (!isFinite(n)) n = 0;
    if (n < lo) n = lo;
    if (n > hi) n = hi;
    return Math.floor(n);
  }

  /** Remaining display: MM:SS, or H:MM:SS when an hour or more. */
  function formatTime(ms) {
    var total = Math.max(0, Math.ceil(Number(ms) / 1000));
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    if (h > 0) {
      return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function remainingMs(t, now) {
    if (t.finished) return 0;
    if (t.running) return Math.max(0, t.endAt - now);
    return Math.max(0, t.remainingMs || 0);
  }

  function create(label, minutes, seconds, now) {
    var mins = clamp(minutes, 0, 120);
    var secs = clamp(seconds, 0, 59);
    var total = (mins * 60 + secs) * 1000;
    if (total <= 0) return null;
    var text = (label && String(label).trim()) || 'Timer';
    return {
      id: String(now) + '-' + Math.random().toString(36).slice(2, 8),
      label: text,
      totalMs: total,
      remainingMs: total,
      endAt: now + total,
      running: true,
      finished: false
    };
  }

  function pause(t, now) {
    if (!t || !t.running || t.finished) return t;
    t.remainingMs = remainingMs(t, now);
    t.running = false;
    t.endAt = null;
    return t;
  }

  function resume(t, now) {
    if (!t || t.running || t.finished) return t;
    t.endAt = now + Math.max(0, t.remainingMs || 0);
    t.running = true;
    return t;
  }

  /** Mark finished if due. Returns true when this tick newly finished it. */
  function tickOne(t, now) {
    if (!t || t.finished || !t.running) return false;
    if (remainingMs(t, now) > 0) return false;
    t.remainingMs = 0;
    t.running = false;
    t.finished = true;
    t.endAt = null;
    return true;
  }

  function toJSON(t) {
    return {
      id: t.id,
      label: t.label,
      totalMs: t.totalMs,
      remainingMs: t.remainingMs,
      endAt: t.endAt,
      running: !!t.running,
      finished: !!t.finished
    };
  }

  function fromJSON(raw, now) {
    var t = {
      id: String(raw.id),
      label: raw.label || 'Timer',
      totalMs: Number(raw.totalMs) || 0,
      remainingMs: Number(raw.remainingMs) || 0,
      endAt: raw.endAt == null ? null : Number(raw.endAt),
      running: !!raw.running,
      finished: !!raw.finished
    };
    if (t.finished) {
      t.remainingMs = 0;
      t.running = false;
      t.endAt = null;
      return t;
    }
    if (t.running && t.endAt != null && t.endAt <= now) {
      t.remainingMs = 0;
      t.running = false;
      t.finished = true;
      t.endAt = null;
      return t;
    }
    if (t.running && t.endAt != null) {
      t.remainingMs = Math.max(0, t.endAt - now);
    }
    return t;
  }

  function load(storage, now) {
    try {
      var raw = storage.getItem(KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.map(function (r) { return fromJSON(r, now); });
    } catch (e) {
      return [];
    }
  }

  function save(storage, timers) {
    try {
      storage.setItem(KEY, JSON.stringify(timers.map(toJSON)));
    } catch (e) { /* quota / private mode */ }
  }

  CT.Timers = {
    KEY: KEY,
    clamp: clamp,
    formatTime: formatTime,
    remainingMs: remainingMs,
    create: create,
    pause: pause,
    resume: resume,
    tickOne: tickOne,
    toJSON: toJSON,
    fromJSON: fromJSON,
    load: load,
    save: save
  };
})(typeof window !== 'undefined' ? window : global);
