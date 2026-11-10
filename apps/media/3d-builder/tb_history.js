/* 3D Builder — tb_history.js: snapshot undo/redo stack, cap 100. TD1 */

export const HISTORY_LIMIT = 100;

function clone(s) {
  return JSON.parse(JSON.stringify(s));
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * @param {{getState:Function, setState:Function}} api
 */
export function createHistory(api) {
  let past = [];
  let future = [];
  let current = clone(api.getState());
  const listeners = [];

  function notify() {
    for (let i = 0; i < listeners.length; i++) {
      try { listeners[i](); } catch (e) { /* app bug */ }
    }
  }

  return {
    onChange: function (fn) {
      if (typeof fn === 'function') listeners.push(fn);
    },
    canUndo: function () { return past.length > 0; },
    canRedo: function () { return future.length > 0; },
    depth: function () { return past.length; },
    push: function () {
      const now = clone(api.getState());
      if (same(now, current)) return false;
      past.push(current);
      if (past.length > HISTORY_LIMIT) past.shift();
      future = [];
      current = now;
      notify();
      return true;
    },
    undo: function () {
      if (!past.length) return false;
      future.push(current);
      current = past.pop();
      api.setState(clone(current));
      notify();
      return true;
    },
    redo: function () {
      if (!future.length) return false;
      past.push(current);
      current = future.pop();
      api.setState(clone(current));
      notify();
      return true;
    },
    reset: function () {
      past = [];
      future = [];
      current = clone(api.getState());
      notify();
    }
  };
}
