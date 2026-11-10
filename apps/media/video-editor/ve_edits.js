/* Video Editor — ve_edits.js: kept segments, cut/keep, undo/redo. VD1
   Pure helpers (no DOM). Segments are {start, end} in source time, sorted,
   non-overlapping, each with end > start. */
(function (root) {
  'use strict';

  function copySegs(segs) {
    return (segs || []).map(function (s) {
      return { start: s.start, end: s.end };
    });
  }

  function mergeNormalize(segs) {
    var list = (segs || []).filter(function (s) {
      return s && isFinite(s.start) && isFinite(s.end) && s.end > s.start;
    }).map(function (s) {
      return { start: Number(s.start), end: Number(s.end) };
    }).sort(function (a, b) { return a.start - b.start; });

    var out = [];
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (!out.length || s.start > out[out.length - 1].end) {
        out.push({ start: s.start, end: s.end });
      } else if (s.end > out[out.length - 1].end) {
        out[out.length - 1].end = s.end;
      }
    }
    return out;
  }

  function initialSegments(duration) {
    var d = Number(duration);
    if (!isFinite(d) || d <= 0) return [];
    return [{ start: 0, end: d }];
  }

  /** Remove [a, b] from kept segments. */
  function cutRange(segments, a, b) {
    a = Number(a);
    b = Number(b);
    if (!isFinite(a) || !isFinite(b) || b <= a) return mergeNormalize(segments);
    var out = [];
    (segments || []).forEach(function (s) {
      if (s.end <= a || s.start >= b) {
        out.push({ start: s.start, end: s.end });
        return;
      }
      if (s.start < a) out.push({ start: s.start, end: Math.min(s.end, a) });
      if (s.end > b) out.push({ start: Math.max(s.start, b), end: s.end });
    });
    return mergeNormalize(out);
  }

  /** Keep only the intersection of current segments with [a, b]. */
  function keepRange(segments, a, b) {
    a = Number(a);
    b = Number(b);
    if (!isFinite(a) || !isFinite(b) || b <= a) return [];
    var out = [];
    (segments || []).forEach(function (s) {
      var start = Math.max(s.start, a);
      var end = Math.min(s.end, b);
      if (end > start) out.push({ start: start, end: end });
    });
    return mergeNormalize(out);
  }

  function removedRanges(segments, duration) {
    var dur = Number(duration);
    if (!isFinite(dur) || dur <= 0) return [];
    var segs = mergeNormalize(segments);
    var out = [];
    var t = 0;
    for (var i = 0; i < segs.length; i++) {
      if (segs[i].start > t) out.push({ start: t, end: segs[i].start });
      t = Math.max(t, segs[i].end);
    }
    if (t < dur) out.push({ start: t, end: dur });
    return out;
  }

  function keptDuration(segments) {
    var t = 0;
    (segments || []).forEach(function (s) {
      var d = s.end - s.start;
      if (d > 0) t += d;
    });
    return t;
  }

  /** If t is inside a kept segment (end exclusive, except at the very last end), return it. */
  function containingSegment(t, segments) {
    var segs = segments || [];
    var last = segs.length ? segs[segs.length - 1] : null;
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (t >= s.start && t < s.end) return s;
    }
    if (last && t === last.end) return last;
    return null;
  }

  /**
   * If t is already in a kept segment, return t.
   * Otherwise return the start of the next kept segment, or null if none.
   */
  function nextKeptTime(t, segments) {
    var segs = segments || [];
    if (containingSegment(t, segs)) return t;
    for (var i = 0; i < segs.length; i++) {
      if (segs[i].start >= t) return segs[i].start;
    }
    return null;
  }

  function previousKeptTime(t, segments) {
    var segs = segments || [];
    if (containingSegment(t, segs)) return t;
    for (var i = segs.length - 1; i >= 0; i--) {
      if (segs[i].end <= t) return segs[i].end;
    }
    return segs.length ? segs[0].start : null;
  }

  /** Map a source time to a time on the edited (kept-only) timeline. */
  function sourceToEdited(t, segments) {
    var acc = 0;
    var segs = segments || [];
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (t < s.start) return acc;
      if (t <= s.end) return acc + (t - s.start);
      acc += s.end - s.start;
    }
    return acc;
  }

  /** Map an edited-timeline time back to a source time. */
  function editedToSource(et, segments) {
    var acc = 0;
    var segs = segments || [];
    var t = Number(et);
    if (!isFinite(t) || t <= 0) {
      return segs.length ? segs[0].start : 0;
    }
    for (var i = 0; i < segs.length; i++) {
      var d = segs[i].end - segs[i].start;
      if (t <= acc + d) return segs[i].start + (t - acc);
      acc += d;
    }
    if (!segs.length) return 0;
    return segs[segs.length - 1].end;
  }

  /**
   * Kept duration already finished, plus how far into the current source time
   * we are in segment `index`. Used for export progress.
   */
  function exportedSoFar(segments, index, currentTime) {
    var t = 0;
    var segs = segments || [];
    for (var i = 0; i < index && i < segs.length; i++) {
      t += segs[i].end - segs[i].start;
    }
    var s = segs[index];
    if (s) {
      var cur = Number(currentTime);
      if (!isFinite(cur)) cur = s.start;
      t += Math.max(0, Math.min(s.end, cur) - s.start);
    }
    return t;
  }

  function sameSegs(a, b) {
    a = a || [];
    b = b || [];
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i].start !== b[i].start || a[i].end !== b[i].end) return false;
    }
    return true;
  }

  /** Undo/redo stack around a current segment list. */
  function createHistory(initial) {
    var current = mergeNormalize(initial || []);
    var past = [];
    var future = [];

    function get() { return copySegs(current); }

    function set(segs, record) {
      var next = mergeNormalize(segs);
      if (record && !sameSegs(current, next)) {
        past.push(copySegs(current));
        future = [];
      }
      current = next;
      return get();
    }

    function reset(segs) {
      current = mergeNormalize(segs);
      past = [];
      future = [];
      return get();
    }

    function undo() {
      if (!past.length) return false;
      future.push(copySegs(current));
      current = past.pop();
      return get();
    }

    function redo() {
      if (!future.length) return false;
      past.push(copySegs(current));
      current = future.pop();
      return get();
    }

    function canUndo() { return past.length > 0; }
    function canRedo() { return future.length > 0; }

    return {
      get: get,
      set: set,
      reset: reset,
      undo: undo,
      redo: redo,
      canUndo: canUndo,
      canRedo: canRedo
    };
  }

  var api = {
    mergeNormalize: mergeNormalize,
    initialSegments: initialSegments,
    cutRange: cutRange,
    keepRange: keepRange,
    removedRanges: removedRanges,
    keptDuration: keptDuration,
    containingSegment: containingSegment,
    nextKeptTime: nextKeptTime,
    previousKeptTime: previousKeptTime,
    sourceToEdited: sourceToEdited,
    editedToSource: editedToSource,
    exportedSoFar: exportedSoFar,
    sameSegs: sameSegs,
    createHistory: createHistory
  };

  root.VEEdits = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
