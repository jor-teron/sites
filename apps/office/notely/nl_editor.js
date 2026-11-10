/* Notely — nl_editor.js: the textarea — autosave, counts, undo-friendly inserts. NL2: fixed 16 px text (config fontSize), word wrap on; 'notely-font' ignored
   (A− / A+ parked in parked/nl_fontsize.js). */
NL.editor = (function () {
  const C = NL.config, S = NL.store;
  let ta, status, timer = 0, dirty = false;

  function report(ok) {
    const N = window.OfficeNotify;
    if (!N) return;
    if (ok) { if (N.saveOk) N.saveOk('notely'); }
    else if (N.saveProblem) N.saveProblem('notely', S.lastError);
  }
  function save() {
    clearTimeout(timer); timer = 0;
    if (!ta) return false;
    /* (before HO2) S.set(...) and the false return was ignored. */
    const ok = S.set(C.keys.text, ta.value);
    if (ok) dirty = false;
    report(ok);
    return ok;
  }
  function count() {
    const v = ta.value;
    const words = (v.match(/\S+/g) || []).length;
    const chars = Array.from(v).length;
    status.textContent = words + (words === 1 ? ' word' : ' words') + ' · ' + chars + (chars === 1 ? ' character' : ' characters');
  }
  function changed() { dirty = true; count(); clearTimeout(timer); timer = setTimeout(save, C.autosaveMs); }

  // Insert at the caret through the browser's undo stack when possible.
  function insert(text) {
    ta.focus();
    let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch (_) { ok = false; }
    if (!ok) { ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end'); changed(); }
  }
  // Replace everything (Open / Undo clear), undo-friendly where supported.
  function replaceAll(text) {
    ta.focus();
    ta.select();
    let ok = false;
    try { ok = text ? document.execCommand('insertText', false, text) : document.execCommand('delete'); } catch (_) { ok = false; }
    if (!ok || ta.value !== text) ta.value = text;
    ta.setSelectionRange(0, 0);
    ta.scrollTop = 0;
    changed();
    save();
  }

  function init() {
    ta = document.getElementById('text');
    status = document.getElementById('status');
    // one-time import from the old Notepad (read only)
    if (S.get(C.keys.text) == null && !S.get(C.keys.imported)) {
      const old = S.get(C.keys.notepadText);
      if (old && !S.set(C.keys.text, old)) report(false);
      else S.set(C.keys.imported, '1');
    }
    /* (before HO2) ta.value = S.get(C.keys.text) || ''; — an empty or blocked read wiped restored text. */
    const stored = S.get(C.keys.text);
    if (stored) ta.value = stored;
    else if (!ta.value) ta.value = stored || '';
    ta.style.fontSize = C.fontSize + 'px';
    ta.wrap = 'soft';
    ta.addEventListener('input', changed);
    /* (before HO2) only flushed when a timer was still waiting, so a failed save was not retried on close. */
    window.addEventListener('pagehide', () => { if (dirty || timer) save(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && (dirty || timer)) save(); });
    count();
  }

  return {
    init, insert, replaceAll, save,
    get value() { return ta.value; },
    get el() { return ta; },
  };
})();
