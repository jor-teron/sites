/* Notely — nl_clear.js: Clear (confirm) with a 5-second Undo bar. */
NL.clear = (function () {
  const C = NL.config;
  let bar, kept = null, timer = 0;
  function hide() { clearTimeout(timer); bar.hidden = true; kept = null; }
  function clear() {
    if (!NL.editor.value) return;
    if (!window.confirm('Clear all text?')) return;
    kept = NL.editor.value;
    NL.editor.replaceAll('');
    bar.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(hide, C.undoMs);
  }
  function undo() {
    if (kept == null) return;
    const t = kept;
    hide();
    NL.editor.replaceAll(t);
  }
  function init() {
    bar = document.getElementById('undo-bar');
    document.getElementById('btn-undo').addEventListener('click', undo);
  }
  return { init, clear, undo };
})();
