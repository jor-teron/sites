/**
 * Photo Collage — Bounded 30-step Undo/Redo history stack (core/pc_history.js)
 */
(function (root, factory) {
  var storage = (typeof require === 'function' && typeof module === 'object')
    ? require('./pc_storage.js')
    : (root.PhotoCollageCore && root.PhotoCollageCore.storage);
  var api = factory(storage);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.PhotoCollageCore = root.PhotoCollageCore || {};
  root.PhotoCollageCore.history = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (storage) {
  'use strict';

  var MAX_HISTORY = 30;

  function createHistoryManager(hooks) {
    var undoStack = [];
    var redoStack = [];
    var getState = hooks && hooks.getState ? hooks.getState : function () { return null; };
    var onApplied = hooks && hooks.onApplied ? hooks.onApplied : function () {};
    var onChanged = hooks && hooks.onChanged ? hooks.onChanged : function () {};

    function createSnapshot(st) {
      return storage.serializeState(st);
    }

    function restoreSnapshot(snap, targetState) {
      return storage.deserializeState(snap, targetState);
    }

    function pushHistory(st) {
      var s = st || getState();
      var snap = createSnapshot(s);
      if (!snap) return;
      undoStack.push(snap);
      if (undoStack.length > MAX_HISTORY) {
        undoStack.shift();
      }
      redoStack = [];
      onChanged();
    }

    function undo() {
      var currentState = getState();
      if (!currentState || undoStack.length === 0) return false;
      var currentSnap = createSnapshot(currentState);
      redoStack.push(currentSnap);
      if (redoStack.length > MAX_HISTORY) {
        redoStack.shift();
      }
      var prevSnap = undoStack.pop();
      restoreSnapshot(prevSnap, currentState);
      onApplied();
      onChanged();
      return true;
    }

    function redo() {
      var currentState = getState();
      if (!currentState || redoStack.length === 0) return false;
      var currentSnap = createSnapshot(currentState);
      undoStack.push(currentSnap);
      if (undoStack.length > MAX_HISTORY) {
        undoStack.shift();
      }
      var nextSnap = redoStack.pop();
      restoreSnapshot(nextSnap, currentState);
      onApplied();
      onChanged();
      return true;
    }

    function clearHistory() {
      undoStack = [];
      redoStack = [];
      onChanged();
    }

    function getHistoryState() {
      return {
        undoCount: undoStack.length,
        redoCount: redoStack.length
      };
    }

    return {
      createSnapshot: createSnapshot,
      restoreSnapshot: restoreSnapshot,
      pushHistory: pushHistory,
      undo: undo,
      redo: redo,
      clearHistory: clearHistory,
      getHistoryState: getHistoryState
    };
  }

  return {
    MAX_HISTORY: MAX_HISTORY,
    createHistoryManager: createHistoryManager
  };
});
