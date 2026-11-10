/* Video Editor — ve_seq.js: clip sequence, split, reorder, project history. VD2+VD3
   Pure helpers (no DOM). Timing is in playback time (kept source duration / speed). */
(function (root) {
  'use strict';

  var E = root.VEEdits;
  if (!E && typeof require === 'function') {
    try { E = require('./ve_edits.js'); } catch (_) { /* ok */ }
  }
  var F = root.VEFx;
  if (!F && typeof require === 'function') {
    try { F = require('./ve_fx.js'); } catch (_) { /* ok */ }
  }
  var MAX_HISTORY = 40;

  function copySegs(segs) {
    return (segs || []).map(function (s) { return { start: s.start, end: s.end }; });
  }

  function copyClip(c) {
    if (!c) return null;
    return F && F.migrateClip ? F.migrateClip(c) : c;
  }

  function copyClips(clips) {
    return (clips || []).map(copyClip);
  }

  function copyState(state) {
    if (F && F.migrateState) return F.migrateState(state);
    state = state || {};
    var fade = Number(state.fade);
    if (fade !== 0.5 && fade !== 1) fade = 0;
    return { fade: fade, clips: copyClips(state.clips), overlays: [], outputSize: 'auto', version: 3 };
  }

  function clipKept(clip) {
    return clip ? E.keptDuration(clip.segments) : 0;
  }

  function clipPlayDuration(clip) {
    if (F && F.clipPlayDuration) return F.clipPlayDuration(clip);
    return clipKept(clip);
  }

  function sequenceDuration(clips) {
    var t = 0;
    (clips || []).forEach(function (c) { t += clipPlayDuration(c); });
    return t;
  }

  /**
   * Layout of kept content on the global timeline.
   * Each item: { index, id, start, end, duration }.
   */
  function sequenceLayout(clips) {
    var items = [];
    var t = 0;
    (clips || []).forEach(function (c, i) {
      var d = clipPlayDuration(c);
      items.push({ index: i, id: c.id, start: t, end: t + d, duration: d });
      t += d;
    });
    return { total: t, items: items };
  }

  /**
   * Map a global sequence time to a clip and a source time.
   * Times at an item's end belong to the next clip, except the final end.
   */
  function globalToLocal(t, clips) {
    var layout = sequenceLayout(clips);
    if (!layout.items.length) return null;
    var x = Number(t);
    if (!isFinite(x) || x < 0) x = 0;
    if (x >= layout.total) {
      var last = layout.items[layout.items.length - 1];
      var lastClip = clips[last.index];
      var endSpeed = F && F.normalizeSpeed ? F.normalizeSpeed(lastClip.speed) : 1;
      return {
        index: last.index,
        clip: lastClip,
        item: last,
        localEdited: last.duration,
        sourceTime: E.editedToSource(last.duration * endSpeed, lastClip.segments),
        atEnd: true
      };
    }
    for (var i = 0; i < layout.items.length; i++) {
      var it = layout.items[i];
      if (x < it.end || (i === layout.items.length - 1 && x <= it.end)) {
        var local = x - it.start;
        if (local < 0) local = 0;
        if (local > it.duration) local = it.duration;
        var speed = F && F.normalizeSpeed ? F.normalizeSpeed(clips[i].speed) : 1;
        return {
          index: i,
          clip: clips[i],
          item: it,
          localEdited: local,
          sourceTime: E.editedToSource(local * speed, clips[i].segments),
          atEnd: false
        };
      }
    }
    return null;
  }

  function localToGlobal(clipIndex, sourceTime, clips) {
    var layout = sequenceLayout(clips);
    var it = layout.items[clipIndex];
    if (!it || !clips[clipIndex]) return 0;
    var speed = F && F.normalizeSpeed ? F.normalizeSpeed(clips[clipIndex].speed) : 1;
    var local = E.sourceToEdited(sourceTime, clips[clipIndex].segments) / speed;
    return it.start + local;
  }

  /**
   * Split segments at source time t. Returns {left, right} or null if either
   * side would be empty (t not inside a kept part, or at an end).
   */
  function splitSegments(segments, t) {
    t = Number(t);
    if (!isFinite(t)) return null;
    var left = [];
    var right = [];
    (segments || []).forEach(function (s) {
      if (s.end <= t) left.push({ start: s.start, end: s.end });
      else if (s.start >= t) right.push({ start: s.start, end: s.end });
      else {
        if (t - s.start > 1e-4) left.push({ start: s.start, end: t });
        if (s.end - t > 1e-4) right.push({ start: t, end: s.end });
      }
    });
    left = E.mergeNormalize(left);
    right = E.mergeNormalize(right);
    if (!E.keptDuration(left) || !E.keptDuration(right)) return null;
    return { left: left, right: right };
  }

  /**
   * Split one clip into two that share the file. Left keeps clip.id;
   * right.id is newId. Returns {left, right} or null.
   */
  function splitClip(clip, sourceTime, newId) {
    if (!clip) return null;
    var parts = splitSegments(clip.segments, sourceTime);
    if (!parts) return null;
    var left = copyClip(clip);
    left.segments = parts.left;
    var right = copyClip(clip);
    right.id = newId;
    right.segments = parts.right;
    if (!right.id) return null;
    return { left: left, right: right };
  }

  function moveClip(clips, from, to) {
    var next = copyClips(clips);
    var a = Number(from);
    var b = Number(to);
    if (!isFinite(a) || a < 0 || a >= next.length) return next;
    if (!isFinite(b)) return next;
    if (b < 0) b = 0;
    if (b >= next.length) b = next.length - 1;
    if (a === b) return next;
    var item = next.splice(a, 1)[0];
    next.splice(b, 0, item);
    return next;
  }

  function moveBy(clips, index, delta) {
    return moveClip(clips, index, Number(index) + Number(delta));
  }

  function findIndex(clips, id) {
    for (var i = 0; i < (clips || []).length; i++) {
      if (clips[i].id === id) return i;
    }
    return -1;
  }

  /**
   * Opacity of a clip at a local edited time for a fade-through-black.
   * Fades are drawn inside the kept ends (sequence duration unchanged).
   * Fade length is capped at half the clip's kept duration.
   */
  function fadeAlpha(localEdited, keptDur, fade, clipIndex, clipCount) {
    var a = 1;
    var f = Number(fade);
    var d = Number(keptDur);
    var t = Number(localEdited);
    if (!isFinite(f) || f <= 0 || !isFinite(d) || d <= 0) return 1;
    if (!isFinite(t)) t = 0;
    var half = d / 2;
    var fIn = clipIndex > 0 ? Math.min(f, half) : 0;
    var fOut = clipIndex < clipCount - 1 ? Math.min(f, half) : 0;
    if (fIn > 0 && t < fIn) a = Math.min(a, Math.max(0, t / fIn));
    if (fOut > 0 && t > d - fOut) a = Math.min(a, Math.max(0, (d - t) / fOut));
    if (t >= d) a = fOut > 0 ? 0 : a;
    if (t <= 0 && fIn > 0) a = 0;
    return a;
  }

  function sameClip(a, b) {
    if (!a || !b) return false;
    var core = a.id === b.id && a.fileId === b.fileId && a.name === b.name &&
      a.duration === b.duration && E.sameSegs(a.segments, b.segments);
    if (!core) return false;
    if (F && F.sameClipFx) return F.sameClipFx(a, b);
    return true;
  }

  function sameState(a, b) {
    a = a || { fade: 0, clips: [], overlays: [], outputSize: 'auto' };
    b = b || { fade: 0, clips: [], overlays: [], outputSize: 'auto' };
    if (Number(a.fade) !== Number(b.fade)) return false;
    if ((a.outputSize || 'auto') !== (b.outputSize || 'auto')) return false;
    if ((a.clips || []).length !== (b.clips || []).length) return false;
    for (var i = 0; i < a.clips.length; i++) {
      if (!sameClip(a.clips[i], b.clips[i])) return false;
    }
    var oa = a.overlays || [];
    var ob = b.overlays || [];
    if (oa.length !== ob.length) return false;
    for (var j = 0; j < oa.length; j++) {
      if (F && F.sameOverlay && !F.sameOverlay(oa[j], ob[j])) return false;
    }
    return true;
  }

  function createHistory(initial) {
    var current = copyState(initial);
    var past = [];
    var future = [];

    function get() { return copyState(current); }

    function set(state, record) {
      var next = copyState(state);
      if (record && !sameState(current, next)) {
        past.push(copyState(current));
        if (past.length > MAX_HISTORY) past.shift();
        future = [];
      }
      current = next;
      return get();
    }

    function reset(state) {
      current = copyState(state);
      past = [];
      future = [];
      return get();
    }

    function undo() {
      if (!past.length) return false;
      future.push(copyState(current));
      current = past.pop();
      return get();
    }

    function redo() {
      if (!future.length) return false;
      past.push(copyState(current));
      current = future.pop();
      return get();
    }

    function canUndo() { return past.length > 0; }
    function canRedo() { return future.length > 0; }

    function fileIds() {
      var ids = {};
      function add(st) {
        (st.clips || []).forEach(function (c) { if (c.fileId) ids[c.fileId] = true; });
      }
      add(current);
      past.forEach(add);
      future.forEach(add);
      return Object.keys(ids);
    }

    return {
      get: get,
      set: set,
      reset: reset,
      undo: undo,
      redo: redo,
      canUndo: canUndo,
      canRedo: canRedo,
      fileIds: fileIds
    };
  }

  var api = {
    MAX_HISTORY: MAX_HISTORY,
    copyClip: copyClip,
    copyClips: copyClips,
    copyState: copyState,
    clipKept: clipKept,
    clipPlayDuration: clipPlayDuration,
    sequenceDuration: sequenceDuration,
    sequenceLayout: sequenceLayout,
    globalToLocal: globalToLocal,
    localToGlobal: localToGlobal,
    splitSegments: splitSegments,
    splitClip: splitClip,
    moveClip: moveClip,
    moveBy: moveBy,
    findIndex: findIndex,
    fadeAlpha: fadeAlpha,
    sameClip: sameClip,
    sameState: sameState,
    createHistory: createHistory
  };

  root.VESeq = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
