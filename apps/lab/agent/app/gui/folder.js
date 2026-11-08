/* Agent — app/gui/folder.js: folder chip in the top bar + Folder section in Settings (HR3).
   Chip: '📁 Pick folder' | '📁 Reconnect <name>' | '📁 <name>' (tap = pick another) | hidden when unsupported.
   Settings: status line, Pick folder, Reconnect folder, and a clear "not supported in this browser" note (Android / Firefox). */
HR.folder = (function () {
  var chip, stat, bPick, bRe;
  function paint() {
    var s = HR.fs.state(), n = HR.fs.name();
    chip.hidden = s === 'unsupported';
    /* AG39: the chip shows the real folder name from the granted handle (HR.fs.name()), 'Folder' when there is none.
       Long names are cut with … in CSS; the full name is in title and aria-label. AG39 Legacy: '📁 Reconnect' / '📁 Pick folder'. */
    var has = (s === 'ready' || s === 'need') && n;
    chip.textContent = '📁 ' + (has ? n : 'Folder');
    chip.className = 'chip tb-folder ' + s; chip.title = s === 'ready' ? 'Folder: ' + n + ' (tap to pick another)' : s === 'need' ? 'Folder ' + (n || '') + ' needs permission again: tap to reconnect' : 'No folder connected: tap to pick one';
    chip.setAttribute('aria-label', chip.title);
    stat.textContent = s === 'unsupported' ? 'Folder access is not supported in this browser (Android browsers, Firefox, Safari). Use desktop Chrome or Edge. Chat still works without a folder.'
      : s === 'ready' ? 'Connected: ' + n + ' — tools list_dir, read_file, write_file (asks first), search.'
      : s === 'need' ? 'Folder “' + n + '” remembered — tap Reconnect folder to allow access again.' : 'No folder. Pick one to let the agent list, read, search and (with your approval) write files.';
    stat.classList.toggle('warn', s === 'unsupported' || s === 'need');
    bPick.hidden = bRe.hidden = s === 'unsupported'; bRe.hidden = bRe.hidden || s !== 'need';
  }
  function fail(e) { if (e && e.name === 'AbortError') return; HR.notify({ icon: '📁', title: 'Agent', text: 'Folder: ' + (e && e.message || e) }); }
  function pick() { HR.fs.pick().catch(fail); }
  function reconnect() { HR.fs.reconnect().catch(fail); }
  function init() {
    chip = document.getElementById('btnFolder'); stat = document.getElementById('folderStat');
    bPick = document.getElementById('btnPick'); bRe = document.getElementById('btnReconnect');
    chip.onclick = function () { HR.fs.state() === 'need' ? reconnect() : pick(); };
    bPick.onclick = pick; bRe.onclick = reconnect;
    HR.fs.onChange(paint); paint();
    HR.fs.onChange(function (s) { if (s === 'ready') { HR.migrate.folder(); if (HR.move) HR.move.ensureDirs().catch(function () {}); } });   /* AG40: workspace/ user/ trash/ */
    return HR.fs.init().catch(function () {}).then(paint);
  }
  return { init: init };
})();
