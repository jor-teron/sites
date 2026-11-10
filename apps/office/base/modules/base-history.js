/*
 * base-history.js  (BS5)
 * In-memory undo / redo for the current Base database (not saved). About 100 steps.
 * Snapshots are a JSON clone of BASE.db plus the current row / sort / query, so a later
 * undo cannot leave the tables and the view out of step.
 *   Deleting a whole table (and Reset) call BaseHistory.clear() — those cannot be undone.
 *   Cell edits share one step from first change to blur (BaseHistory.begin / .commit).
 * API: BaseHistory.push(label), .begin(), .commit(label), .undo(), .redo(),
 *      .canUndo(), .canRedo(), .clear(), .capture(), .eachSnap(fn), .stack()
 * The .stack() helper (pure, no BASE) is what the Node tests use.
 */
(function (root) {
  var LIMIT = 100;

  function clone(x) {
    return JSON.parse(JSON.stringify(x));
  }

  /* Pure stack, used by tests and by the BASE-aware wrapper. */
  function stack(limit) {
    limit = limit || LIMIT;
    var past = [], future = [];
    return {
      push: function (snap, label) {
        past.push({ label: label || "", snap: snap });
        if (past.length > limit) past.shift();
        future = [];
      },
      undo: function (current) {
        if (!past.length) return null;
        var step = past.pop();
        future.push({ label: step.label, snap: current });
        return step;
      },
      redo: function (current) {
        if (!future.length) return null;
        var step = future.pop();
        past.push({ label: step.label, snap: current });
        return step;
      },
      canUndo: function () { return past.length > 0; },
      canRedo: function () { return future.length > 0; },
      clear: function () { past = []; future = []; },
      length: function () { return past.length; },
      futureLength: function () { return future.length; },
      snaps: function () { return past.map(function (s) { return s.snap; }).concat(future.map(function (s) { return s.snap; })); },
      labels: function () { return past.map(function (s) { return s.label; }); }
    };
  }

  var S = stack(LIMIT), paused = false, open = null;

  function capture() {
    return {
      db: clone(BASE.db),
      selRow: BASE.selRow,
      sort: BASE.sort ? clone(BASE.sort) : null,
      formIndex: BASE.formIndex,
      query: BASE.query ? clone(BASE.query) : null
    };
  }
  function restore(s) {
    paused = true;
    BASE.db = clone(s.db);
    BASE.selRow = s.selRow;
    BASE.sort = s.sort ? clone(s.sort) : null;
    BASE.formIndex = s.formIndex || 0;
    BASE.query = s.query ? clone(s.query) : null;
    paused = false;
    try { if (typeof BaseStore !== "undefined") BaseStore.save(); } catch (e) {}
    try { if (typeof BaseUI !== "undefined" && BaseUI.render) BaseUI.render(); } catch (e) {}
    refresh();
    try { if (typeof BasePics !== "undefined" && BasePics.gc) BasePics.gc(); } catch (e) {}
  }
  function refresh() {
    try { if (typeof OfficeQuick !== "undefined" && OfficeQuick.refresh) OfficeQuick.refresh(); } catch (e) {}
  }
  function toast(m) {
    try { if (typeof OfficeNotify !== "undefined") OfficeNotify.show(m, 1800); } catch (e) {}
  }

  function push(label) {
    if (paused) return;
    open = null;
    S.push(capture(), label);
    refresh();
  }
  /* Start a cell-edit session: snapshot now; first real change calls commit(). */
  function begin() {
    if (paused) return;
    open = capture();
  }
  function commit(label) {
    if (paused || !open) return;
    S.push(open, label || "Edit");
    open = null;
    refresh();
  }
  function cancel() { open = null; }

  function undo() {
    if (paused || !S.canUndo()) return false;
    open = null;
    var step = S.undo(capture());
    if (!step) return false;
    restore(step.snap);
    toast(step.label ? "Undo " + step.label : "Undo");
    return true;
  }
  function redo() {
    if (paused || !S.canRedo()) return false;
    open = null;
    var step = S.redo(capture());
    if (!step) return false;
    restore(step.snap);
    toast(step.label ? "Redo " + step.label : "Redo");
    return true;
  }
  function clear() { open = null; S.clear(); refresh(); }
  function eachSnap(fn) {
    try { fn(capture()); } catch (e) {}
    S.snaps().forEach(function (s) { try { fn(s); } catch (e) {} });
  }

  var api = {
    LIMIT: LIMIT, stack: stack,
    push: push, begin: begin, commit: commit, cancel: cancel,
    undo: undo, redo: redo, canUndo: function () { return S.canUndo(); },
    canRedo: function () { return S.canRedo(); },
    clear: clear, capture: capture, eachSnap: eachSnap,
    paused: function () { return paused; }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BaseHistory = api;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
