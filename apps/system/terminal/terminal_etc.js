/*
 * Terminal /etc (apps/system/terminal/terminal_etc.js), T5 — the read-only /etc the BusyBox commands see.
 * window.TermEtc = { files: { name: text }, text(name) }. terminal_bb.js copies these into the BusyBox
 * memory file system before every run (as /etc/<name>, mode 0444); anything a command writes there is
 * thrown away afterwards, so /etc stays read-only. No storage, no network.
 */
(function () {
  'use strict';
  const files = {
    hostname: 'hub\n',
    motd: 'Welcome to the Hub Terminal.\n' +
      'BusyBox commands run on your /drive files: ls, cat, grep, sed, awk, sort, ... (ls /bin).\n' +
      "Type 'help' for the Terminal's own commands.\n",
    'os-release': 'NAME="Hub"\nPRETTY_NAME="Hub Terminal (BusyBox 1.36.1, WebAssembly)"\nID=hub\n' +
      'VERSION_ID="T5"\nHOME_URL="https://github.com/jor-teron/sites"\n',
  };
  window.TermEtc = { files, text: (n) => (Object.prototype.hasOwnProperty.call(files, n) ? files[n] : null) };
})();
