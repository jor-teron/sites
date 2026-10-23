/*
 * Terminal editor (apps/system/terminal/terminal_edit.js), T3 — `edit <file>`: a small full-screen text editor
 * that covers the Terminal (same green-on-dark look). window.TermEdit.open({ path, text, isNew, limit, save })
 * -> Promise<{ saved, bytes }>, resolved when the editor is closed. save(text) writes the file and returns the
 * byte count (it throws an Error with the reason). The text only ever goes through textarea.value, never
 * innerHTML. Keys: Ctrl+S (or Cmd+S) save, Ctrl+X or Esc exit (asks "unsaved changes, exit anyway?" when the
 * text changed: y / n or the two buttons), Tab inserts a tab. The buttons Save / Exit are for the phone.
 * Line endings are saved as LF (the textarea normalises them).
 */
(function () {
  'use strict';
  let current = null;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  function open(o) {
    if (current) return Promise.resolve({ saved: false, bytes: 0 });
    return new Promise((resolve) => {
      const root = el('div', 'ed'), bar = el('div', 'ed-bar'), foot = el('div', 'ed-foot');
      root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Editor ' + o.path);
      const path = el('span', 'ed-path', o.path + (o.isNew ? ' (new file)' : ''));
      const mod = el('span', 'ed-mod', '');
      const msg = el('span', 'ed-msg', '');
      const bSave = el('button', 'ed-btn ed-save', 'Save'), bExit = el('button', 'ed-btn ed-exit', 'Exit');
      bSave.type = bExit.type = 'button';
      bSave.title = 'Ctrl+S'; bExit.title = 'Ctrl+X or Esc';
      const ta = el('textarea', 'ed-text');
      ta.setAttribute('spellcheck', 'false'); ta.setAttribute('autocapitalize', 'off'); ta.setAttribute('autocorrect', 'off');
      ta.setAttribute('aria-label', 'File text'); ta.autocomplete = 'off';
      ta.value = o.text || '';
      let orig = ta.value, saved = false, bytes = 0, busy = false, confirming = false;
      const ask = el('div', 'ed-ask'), askText = el('span', '', 'Unsaved changes, exit anyway? (y/n)');
      const bYes = el('button', 'ed-btn ed-yes', 'Yes, exit'), bNo = el('button', 'ed-btn ed-no', 'No, keep editing');
      bYes.type = bNo.type = 'button';
      ask.append(askText, bYes, bNo); ask.hidden = true;
      const pos = el('span', 'ed-pos', '');
      foot.append(el('span', 'ed-keys', '^S save   ^X / Esc exit   Tab = tab'), pos);
      bar.append(path, mod, msg, bSave, bExit);
      root.append(bar, ask, ta, foot);

      const dirty = () => ta.value !== orig;
      function status(text, bad) { msg.textContent = text || ''; msg.className = 'ed-msg' + (bad ? ' bad' : ''); }
      function refresh() {
        mod.textContent = dirty() ? '[modified]' : '';
        const v = ta.value, p = ta.selectionStart == null ? 0 : ta.selectionStart;
        const before = v.slice(0, p), line = before.split('\n').length, col = p - (before.lastIndexOf('\n') + 1) + 1;
        pos.textContent = 'Ln ' + line + ', Col ' + col + '   ' + v.length + ' chars';
      }
      async function save() {
        if (busy) return false;
        const v = ta.value;
        if (new Blob([v]).size > (o.limit || 1048576)) { status('Too large to save (limit 1 MB)', true); return false; }
        busy = true; status('Saving \u2026');
        try {
          const n = await o.save(v);
          orig = v; saved = true; bytes = typeof n === 'number' ? n : new Blob([v]).size;
          status('Saved (' + bytes + ' bytes)');
          return true;
        } catch (e) { status('Not saved: ' + (e && e.message ? e.message : 'error'), true); return false; } finally { busy = false; refresh(); }
      }
      function close() {
        document.removeEventListener('keydown', onKey, true);
        root.remove(); current = null;
        const line = document.getElementById('in'); if (line) { try { line.focus({ preventScroll: true }); } catch (_) { line.focus(); } }
        resolve({ saved, bytes });
      }
      function showAsk(on) {
        confirming = on; ask.hidden = !on;
        if (on) bNo.focus(); else ta.focus();
      }
      function exit() {
        if (confirming) return;
        if (dirty()) showAsk(true); else close();
      }
      function onKey(e) {
        if (confirming) {
          const k = (e.key || '').toLowerCase();
          if (k === 'y') { e.preventDefault(); close(); }
          else if (k === 'n' || k === 'escape') { e.preventDefault(); showAsk(false); }
          else if (k === 'tab') { /* buttons stay reachable */ } else if (e.target === ta) e.preventDefault();
          return;
        }
        const k = e.key, ctrl = e.ctrlKey || e.metaKey;
        if (ctrl && !e.altKey && (k === 's' || k === 'S')) { e.preventDefault(); save(); }
        else if (ctrl && !e.altKey && (k === 'x' || k === 'X')) { e.preventDefault(); exit(); }
        else if (k === 'Escape') { e.preventDefault(); exit(); }
        else if (k === 'Tab' && !e.shiftKey && !ctrl && !e.altKey && e.target === ta) { e.preventDefault(); ta.setRangeText('\t', ta.selectionStart, ta.selectionEnd, 'end'); refresh(); }
      }
      document.addEventListener('keydown', onKey, true);
      bSave.addEventListener('click', () => { save(); if (!confirming) ta.focus(); });
      bExit.addEventListener('click', exit);
      bYes.addEventListener('click', close);
      bNo.addEventListener('click', () => showAsk(false));
      ['input', 'keyup', 'click', 'select', 'focus'].forEach((t) => ta.addEventListener(t, refresh));
      ta.addEventListener('input', () => { if (msg.textContent && !busy) status(''); });
      document.body.appendChild(root);
      current = { root, ta, save, exit };
      refresh();
      ta.focus();
      ta.setSelectionRange(0, 0);
    });
  }
  window.TermEdit = { open, isOpen: () => !!current, _t: () => current };
})();
