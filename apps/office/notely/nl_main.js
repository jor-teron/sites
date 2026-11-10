/* Notely — nl_main.js: wires the toolbar (Open, Download) and starts everything.
   NL4: the same two buttons also go to the Hub window bar (nl_hubbar.js). */
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
    /* (before NL4) these clicks were the only Open and Download controls.
       They stay so standalone keeps working. The Hub window bar calls the same actions. */
    const on = (id, fn) => document.getElementById(id).addEventListener('click', fn);
    on('btn-open', () => NL.files.open());
    on('btn-download', () => NL.files.download());
    if (NL.hubbar) NL.hubbar.init();
  }
  return { init, flash };
})();
NL.main.init();
