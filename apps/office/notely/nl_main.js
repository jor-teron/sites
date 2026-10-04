/* Notely — nl_main.js: wires the toolbar and starts everything. */
NL.main = (function () {
  let flashTimer = 0;
  function flash(msg) {
    const s = document.getElementById('status');
    clearTimeout(flashTimer);
    s.dataset.msg = msg;
    s.classList.add('flash');
    flashTimer = setTimeout(() => { s.classList.remove('flash'); delete s.dataset.msg; }, 2500);
  }
  function init() {
    NL.theme.init();
    NL.editor.init();
    NL.files.init();
    NL.clear.init();
    NL.keys.init();
    const on = (id, fn) => document.getElementById(id).addEventListener('click', fn);
    on('btn-open', () => NL.files.open());
    on('btn-download', () => NL.files.download());
    on('btn-clear', () => NL.clear.clear());
    on('btn-smaller', () => NL.editor.smaller());
    on('btn-bigger', () => NL.editor.bigger());
    on('btn-theme', () => NL.theme.toggle());
  }
  return { init, flash };
})();
NL.main.init();
