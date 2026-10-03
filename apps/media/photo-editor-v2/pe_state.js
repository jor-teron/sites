/*
 * Photo Editor v2 — pe_state.js
 * The open photo, its non-destructive edit settings and the undo/redo history.
 * The photo pixels are never changed: every edit is a setting (orientation matrix,
 * crop rectangle in original-photo pixels, adjustment values, preset) and the
 * history is a list of snapshots of those settings.
 */
(function (PE) {
  'use strict';

  const S = PE.state = {
    photo: null,   // { bitmap, w, h, origW, origH, scaled, name, type }
    edits: null,   // { m:[a,b,c,d], crop:{x,y,w,h}, adj:{b,c,s,w}, preset }
    history: [],
    index: -1
  };

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // Tiny event bus. Kinds: 'photo' (new photo), 'geom' (rotate/flip/crop),
  // 'adj' (adjustments), 'adjlive' (slider being dragged, not recorded yet), 'history' (undo/redo), 'crop' (crop mode on/off), 'ui'.
  const listeners = [];
  PE.on = (fn) => { listeners.push(fn); };
  PE.emit = (kind) => { for (const fn of listeners) fn(kind); };

  S.defaultEdits = (w, h) => ({
    m: [1, 0, 0, 1],
    crop: { x: 0, y: 0, w: w, h: h },
    adj: { b: 0, c: 0, s: 0, w: 0 },
    preset: 'none'
  });

  S.setPhoto = (photo) => {
    S.photo = photo;
    S.edits = S.defaultEdits(photo.w, photo.h);
    S.history = [clone(S.edits)];
    S.index = 0;
    PE.emit('photo');
  };

  // Record the current edits as a new history step (if anything changed).
  S.commit = (kind) => {
    if (!S.photo) return false;
    if (same(S.history[S.index], S.edits)) return false;
    S.history = S.history.slice(0, S.index + 1);
    S.history.push(clone(S.edits));
    const max = PE.config.historyLimit + 1;
    if (S.history.length > max) S.history.splice(0, S.history.length - max);
    S.index = S.history.length - 1;
    PE.emit(kind || 'geom');
    return true;
  };

  // Change the edits with fn(edits) and record the step.
  S.apply = (fn, kind) => {
    if (!S.photo) return false;
    fn(S.edits);
    return S.commit(kind);
  };

  S.canUndo = () => !!S.photo && S.index > 0;
  S.canRedo = () => !!S.photo && S.index < S.history.length - 1;

  S.undo = () => {
    if (!S.canUndo()) return false;
    S.index--;
    S.edits = clone(S.history[S.index]);
    PE.emit('history');
    return true;
  };

  S.redo = () => {
    if (!S.canRedo()) return false;
    S.index++;
    S.edits = clone(S.history[S.index]);
    PE.emit('history');
    return true;
  };

  // Restore the last recorded step (used to drop un-committed live slider changes).
  S.revert = () => {
    if (!S.photo) return;
    if (!same(S.history[S.index], S.edits)) { S.edits = clone(S.history[S.index]); PE.emit('history'); }
  };

  S.isEdited = () => !!S.photo && !same(S.edits, S.defaultEdits(S.photo.w, S.photo.h));
})(window.PE);
