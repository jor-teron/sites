/*
 * Project: keyboard (Lab)
 * File: keyboard_type.js
 * Role: Demo typing into this page's text box (synthetic key events do not type, so the
 * page does it): characters, Enter, Tab, Backspace, Delete, arrows, Home / End
 * (Shift = extend the selection), Ctrl+A / Ctrl+Z / Ctrl+Y. Uses execCommand so undo works,
 * with setRangeText as fallback.
 * API: LabKeyboard.typeKey(textarea, key, {shift, ctrl, alt}) → true when handled.
 */
(function () {
  'use strict';

  function insert(ta, text) {
    let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch (_) { ok = false; }
    if (!ok) {
      ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function del(ta, forward) {
    const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
    if (s === e && (forward ? e >= v.length : s <= 0)) return;
    let ok = false;
    try { ok = document.execCommand(forward ? 'forwardDelete' : 'delete', false); } catch (_) { ok = false; }
    if (ok) return;
    if (s !== e) ta.setRangeText('', s, e, 'end');
    else if (forward) ta.setRangeText('', s, s + (/[\uD800-\uDBFF]/.test(v[s]) ? 2 : 1), 'end');
    else ta.setRangeText('', s - (s > 1 && /[\uDC00-\uDFFF]/.test(v[s - 1]) ? 2 : 1), s, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function lineStart(v, p) { return v.lastIndexOf('\n', p - 1) + 1; }
  function lineEnd(v, p) { const i = v.indexOf('\n', p); return i < 0 ? v.length : i; }

  /** New caret position for a movement key (from the moving end of the selection). */
  function moveTo(ta, key, from) {
    const v = ta.value;
    if (key === 'ArrowLeft') return Math.max(0, from - 1);
    if (key === 'ArrowRight') return Math.min(v.length, from + 1);
    if (key === 'Home') return lineStart(v, from);
    if (key === 'End') return lineEnd(v, from);
    const col = from - lineStart(v, from);
    if (key === 'ArrowUp') {
      const ls = lineStart(v, from);
      if (ls === 0) return 0;
      const ps = lineStart(v, ls - 1);
      return Math.min(ps + col, ls - 1);
    }
    // ArrowDown
    const le = lineEnd(v, from);
    if (le >= v.length) return v.length;
    return Math.min(le + 1 + col, lineEnd(v, le + 1));
  }

  function move(ta, key, shift) {
    const s = ta.selectionStart, e = ta.selectionEnd;
    const back = ta.selectionDirection === 'backward';
    if (!shift) {
      // collapse a selection to its edge for ← / →, like a real text box
      if (s !== e && key === 'ArrowLeft') return ta.setSelectionRange(s, s);
      if (s !== e && key === 'ArrowRight') return ta.setSelectionRange(e, e);
      const p = moveTo(ta, key, back ? s : e);
      return ta.setSelectionRange(p, p);
    }
    const anchor = back ? e : s;
    const head = moveTo(ta, key, back ? s : e);
    if (head < anchor) ta.setSelectionRange(head, anchor, 'backward');
    else ta.setSelectionRange(anchor, head, 'forward');
  }

  const MOVE = { ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1, Home: 1, End: 1 };

  function typeKey(ta, key, mods) {
    if (!ta) return false;
    if (document.activeElement !== ta) ta.focus({ preventScroll: true });
    if (mods.ctrl && !mods.alt) {
      const k = key.toLowerCase();
      if (k === 'a') { ta.select(); return true; }
      if (k === 'z') { try { document.execCommand(mods.shift ? 'redo' : 'undo'); } catch (_) { /* ignore */ } return true; }
      if (k === 'y') { try { document.execCommand('redo'); } catch (_) { /* ignore */ } return true; }
      if (MOVE[key]) { move(ta, key, mods.shift); return true; }
      return false;
    }
    if (mods.alt) return false;
    if (MOVE[key]) { move(ta, key, mods.shift); return true; }
    if (key === 'Backspace' || key === 'Delete') { del(ta, key === 'Delete'); return true; }
    if (key === 'Enter') { insert(ta, '\n'); return true; }
    if (key === 'Tab') { insert(ta, '\t'); return true; }
    if (key.length === 1) { insert(ta, key); return true; }
    return false;
  }

  window.LabKeyboard = window.LabKeyboard || {};
  window.LabKeyboard.typeKey = typeKey;
})();
