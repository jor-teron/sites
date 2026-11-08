/* Agent — app/gui/summaryview.js: the "🧾 Earlier summary" chip under the chat and its small dialog (AG32). HR.sumView.
   Chip shows only when the Assist model is on or this chat has a summary: "🧾 Summary · N" (ok), "· stale", "· working…".
   Dialog: status line, editable text (Save keeps it as the summary of the current older turns), Update now (one Assist
   call), Reset (clears the summary only; the chat is kept). Status says where it is saved (chat folder or this browser only). Also wires: chat switch / Stop -> HR.summary.cancel(),
   reply done -> HR.summary.maybe() (from chat.js). */
HR.sumView = (function () {
  var chip, dlg, txt, stat;
  function $(id) { return document.getElementById(id); }
  function paint() {
    if (!chip) return; var s = HR.summary.state();
    chip.hidden = !s.id || (!HR.assist.on() && !s.rec);
    chip.textContent = '🧾 Summary' + (s.busy ? ' · working…' : s.ok ? ' · ' + s.rec.n : s.rec ? ' · stale' : ' · none');
    if (dlg && dlg.open) stat.textContent = (s.status ? s.status + ' ' : '') + (s.ok ? '(covers ' + s.rec.n + ' messages' + (s.rec.edited ? ', edited' : '') + (s.part ? ', a long turn in progress' : '') + '; saved in ' + (s.where === 'folder' ? 'the chat folder' : 'this browser only') + ')'
      : s.rec ? '(stale: the chat changed; trimmed history is used until updated)' : HR.assist.on() ? '(none yet: made once older turns pass ~' + HR.summary.THRESH + ' chars)' : '(Assist model Off: trimmed history is used)');
  }
  function openDlg() { var s = HR.summary.state(); txt.value = s.rec ? s.rec.text : ''; dlg.showModal(); paint(); }
  function init() {
    chip = $('sumChip'); dlg = $('sumDlg'); txt = $('sumText'); stat = $('sumStat'); if (!chip) return;
    txt.maxLength = HR.summary.MAX;
    chip.onclick = openDlg;
    $('sumSave').onclick = function () { HR.summary.edit(txt.value).then(paint); };
    $('sumNow').onclick = function () { HR.summary.now().then(function () { var s = HR.summary.state(); if (s.rec) txt.value = s.rec.text; }); };
    $('sumReset').onclick = function () { HR.summary.reset().then(paint); txt.value = ''; };
    $('sumClose').onclick = function () { dlg.close(); };
    HR.summary.onChange(paint);
    if (HR.fs && HR.fs.onChange) HR.fs.onChange(function () { if (!HR.summary.state().busy) HR.summary.open(HR.chats.id()); });   /* folder picked / reconnected */
    paint(); setInterval(paint, 4000);   /* cheap: catches chat switches and Settings changes */
  }
  return { init: init, paint: paint };
})();
