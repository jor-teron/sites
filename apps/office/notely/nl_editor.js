/* Notely — nl_editor.js: the textarea — autosave, counts, undo-friendly inserts. NL2: fixed 16 px text (config fontSize), word wrap on; 'notely-font' ignored
   (A− / A+ parked in parked/nl_fontsize.js). */
NL.editor = (function () {
  const C = NL.config, S = NL.store;
  let ta, status, timer = 0;

  function save() { clearTimeout(timer); timer = 0; S.set(C.keys.text, ta.value); }
  function count() {
    const v = ta.value;
    const words = (v.match(/\S+/g) || []).length;
    const chars = Array.from(v).length;
    status.textContent = words + (words === 1 ? ' word' : ' words') + ' · ' + chars + (chars === 1 ? ' character' : ' characters');
  }
  function changed() { count(); clearTimeout(timer); timer = setTimeout(save, C.autosaveMs); }

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
      if (old) S.set(C.keys.text, old);
      S.set(C.keys.imported, '1');
    }
    ta.value = S.get(C.keys.text) || '';
    ta.style.fontSize = C.fontSize + 'px';
    ta.wrap = 'soft';
    ta.addEventListener('input', changed);
    window.addEventListener('pagehide', () => { if (timer) save(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && timer) save(); });
    count();
  }

  return {
    init, insert, replaceAll, save,
    get value() { return ta.value; },
    get el() { return ta; },
  };
})();
