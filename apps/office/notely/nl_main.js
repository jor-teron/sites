/* Notely — nl_main.js: wires the toolbar (NL2: Open, Download) and starts everything. */
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
    NL.keys.init();
    NL.handoff.init();
    const on = (id, fn) => document.getElementById(id).addEventListener('click', fn);
    on('btn-open', () => NL.files.open());
    on('btn-download', () => NL.files.download());
  }
  return { init, flash };
})();
NL.main.init();
