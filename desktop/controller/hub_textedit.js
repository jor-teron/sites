/*
 * Text editing keys for synthetic keyboards (hub/controller/hub_textedit.js, R15) — used by
 * hub/controller/hub-controller.js forwardKey after the key events were dispatched and NOT cancelled by the
 * app (an app's preventDefault skips all of this). Shared by the Hub on-screen keyboard
 * (hub/osk/) and the phone Gamepad keyboard (same forwardKey path).
 * Synthetic key events never move the caret, so this does what a real key would do:
 *   ← → (Ctrl = by word), ↑ ↓ (a line, keeping the column, textarea), Home / End (line;
 *   Ctrl = whole text), PageUp / PageDown (start / end) — Shift extends the selection
 *   (textarea / input: setSelectionRange with a direction; contenteditable: Selection.modify).
 *   Tab: textarea / contenteditable insert a tab character; a one-line input moves focus to the
 *   next field (Shift+Tab: the previous one) like a real Tab.
 *   Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z): execCommand undo / redo (typing goes through
 *   execCommand insertText in hub-controller.js so it is on the undo stack).
 *   Ctrl+C / X: execCommand copy / cut, else navigator.clipboard.writeText (+ delete for cut).
 *   Ctrl+V: navigator.clipboard.readText → inserted; blocked = a short toast.
 * API window.HubTextEdit.key(el, msg) → true when handled; toast(text).
 */
(function () {
  'use strict';
  const WORD = /[\p{L}\p{N}_]/u;
  const isArea = (el) => el.tagName === 'TEXTAREA';

  function toast(text) {
    if (window.HubNotify && HubNotify.notice) { HubNotify.notice({ icon: '📋', title: 'Clipboard', text: String(text) }); return; }
    let t = document.getElementById('hub-te-toast');
    if (!t) {
      t = document.createElement('div'); t.id = 'hub-te-toast'; t.setAttribute('role', 'status');
      Object.assign(t.style, { position: 'fixed', left: '50%', bottom: '90px', transform: 'translateX(-50%)', zIndex: 2147483001,
        padding: '8px 14px', borderRadius: '10px', background: 'rgba(0,0,0,.8)', color: '#fff', font: '14px system-ui, sans-serif', pointerEvents: 'none' });
      document.body.appendChild(t);
    }
    t.textContent = text; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2200);
  }

  function wordLeft(v, p) { while (p > 0 && !WORD.test(v[p - 1])) p--; while (p > 0 && WORD.test(v[p - 1])) p--; return p; }
  function wordRight(v, p) { const n = v.length; while (p < n && !WORD.test(v[p])) p++; while (p < n && WORD.test(v[p])) p++; return p; }
  const lineStart = (v, p) => v.lastIndexOf('\n', p - 1) + 1;
  const lineEnd = (v, p) => { const i = v.indexOf('\n', p); return i < 0 ? v.length : i; };

  /** textarea / input: new caret (focus) position, or null = not a move key. */
  function target(el, key, ctrl, focus, start, end, shift) {
    const v = el.value, multi = isArea(el), collapsed = start === end;
    switch (key) {
      case 'ArrowLeft': return ctrl ? wordLeft(v, focus) : (!shift && !collapsed ? start : Math.max(0, focus - 1));
      case 'ArrowRight': return ctrl ? wordRight(v, focus) : (!shift && !collapsed ? end : Math.min(v.length, focus + 1));
      case 'Home': return ctrl || !multi ? 0 : lineStart(v, focus);
      case 'End': return ctrl || !multi ? v.length : lineEnd(v, focus);
      case 'PageUp': return 0;
      case 'PageDown': return v.length;
      case 'ArrowUp': case 'ArrowDown': {
        if (!multi) return key === 'ArrowUp' ? 0 : v.length;
        const ls = lineStart(v, focus), col = focus - ls;
        if (key === 'ArrowUp') { if (ls === 0) return 0; const ps = lineStart(v, ls - 1); return Math.min(ps + col, ls - 1); }
        const le = lineEnd(v, focus); if (le >= v.length) return v.length;
        const ns = le + 1; return Math.min(ns + col, lineEnd(v, ns));
      }
      default: return null;
    }
  }
  function moveField(el, key, ctrl, shift) {
    let start, end, dir;
    try { start = el.selectionStart; end = el.selectionEnd; dir = el.selectionDirection; } catch (_) { return false; }
    if (typeof start !== 'number') return false;
    const back = dir === 'backward';
    const focus = back ? start : end, anchor = back ? end : start;
    const p = target(el, key, ctrl, focus, start, end, shift);
    if (p == null) return false;
    if (shift) el.setSelectionRange(Math.min(anchor, p), Math.max(anchor, p), p < anchor ? 'backward' : 'forward');
    else el.setSelectionRange(p, p);
    return true;
  }
  const CE = {
    ArrowLeft: ['backward', 'character', 'word'], ArrowRight: ['forward', 'character', 'word'],
    ArrowUp: ['backward', 'line', 'line'], ArrowDown: ['forward', 'line', 'line'],
    Home: ['backward', 'lineboundary', 'documentboundary'], End: ['forward', 'lineboundary', 'documentboundary'],
    PageUp: ['backward', 'documentboundary', 'documentboundary'], PageDown: ['forward', 'documentboundary', 'documentboundary']
  };
  function moveEditable(el, key, ctrl, shift) {
    const m = CE[key]; if (!m) return false;
    const sel = el.ownerDocument.defaultView.getSelection();
    if (!sel || !sel.modify) return false;
    if (!shift && !sel.isCollapsed && (key === 'ArrowLeft' || key === 'ArrowRight') && !ctrl) {
      if (key === 'ArrowLeft') sel.collapseToStart(); else sel.collapseToEnd();
      return true;
    }
    sel.modify(shift ? 'extend' : 'move', m[0], ctrl ? m[2] : m[1]);
    return true;
  }

  function insert(el, text) {
    const doc = el.ownerDocument;
    if (doc.execCommand('insertText', false, text)) return true;
    if (el.isContentEditable) return false;
    const s = el.selectionStart, e = el.selectionEnd;
    el.setRangeText(text, s, e, 'end');
    el.dispatchEvent(new doc.defaultView.InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    return true;
  }
  function selectedText(el) {
    if (el.isContentEditable) return String(el.ownerDocument.defaultView.getSelection() || '');
    try { return el.value.slice(el.selectionStart, el.selectionEnd); } catch (_) { return ''; }
  }
  /** Tab in a one-line input: focus the next / previous focusable field of that document. */
  function tabFocus(el, back) {
    const doc = el.ownerDocument;
    const all = Array.from(doc.querySelectorAll('input, textarea, select, button, a[href], [tabindex], [contenteditable="true"]'))
      .filter((x) => !x.disabled && x.tabIndex >= 0 && x.offsetParent !== null);
    const i = all.indexOf(el);
    const n = all[(i + (back ? -1 : 1) + all.length) % all.length];
    if (n && n !== el) { n.focus(); return true; }
    return false;
  }

  function clip(el, key) {
    const doc = el.ownerDocument;
    const k = key.toLowerCase();
    const nav = (window.navigator && window.navigator.clipboard) || null;
    if (k === 'c' || k === 'x') {
      const text = selectedText(el);
      if (!text) return true;
      let ok = false;
      try { ok = doc.execCommand(k === 'c' ? 'copy' : 'cut'); } catch (_) { ok = false; }
      if (ok) return true;
      if (!nav || !nav.writeText) { toast('Copy is blocked here'); return true; }
      nav.writeText(text).then(() => { if (k === 'x') doc.execCommand('delete') || insert(el, ''); },
        () => toast('Copy is blocked here (clipboard permission)'));
      return true;
    }
    if (k === 'v') {
      if (!nav || !nav.readText) { toast('Paste is blocked here'); return true; }
      nav.readText().then((t) => { if (t) { el.focus(); insert(el, t); } },
        () => toast('Paste is blocked \u2014 allow clipboard access for this site'));
      return true;
    }
    return false;
  }

  function key(el, m) {
    const k = m.key, ctrl = !!m.ctrl, shift = !!m.shift;
    if (m.alt) return false;
    const doc = el.ownerDocument;
    if (ctrl && !shift && (k === 'z' || k === 'Z')) { doc.execCommand('undo'); return true; }
    if (ctrl && ((k === 'y' || k === 'Y') || (shift && (k === 'z' || k === 'Z')))) { doc.execCommand('redo'); return true; }
    if (ctrl && /^[cxvCXV]$/.test(k)) return clip(el, k);
    if (k === 'Tab' && !ctrl) {
      if (isArea(el) || el.isContentEditable) return insert(el, '\t');
      return tabFocus(el, shift);
    }
    if (CE[k]) return el.isContentEditable ? moveEditable(el, k, ctrl, shift) : moveField(el, k, ctrl, shift);
    return false;
  }
  window.HubTextEdit = { key, toast, insert };
})();
