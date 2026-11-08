/* Agent — app/gui/conview.js: Settings › Folder & Memory › Consolidation status, Run now, Review dialog (AG36). HR.conView.
   Review lists this chat's proposed notes: editable text, target (This chat's session notes by default; About you / Agent
   notes only when picked), Save to memory, Dismiss. Undo last save restores the exact earlier files or explains why not. */
HR.conView = (function () {
  var stat, dlg, list, dstat;
  function $(id) { return document.getElementById(id); }
  function line() {
    var s = HR.consol.state();
    if (!s.on) return 'Off: no automatic helper calls. Run now still works once (one Assist call).';
    var t = s.busy ? 'Working…' : (s.status || s.gate || 'Waiting for the chat to be idle.');
    return t + (s.queue.length ? ' · ' + s.queue.length + ' to review' : '') + ' · Runs only while this tab is open.';
  }
  function paint() {
    if (!stat) return; var s = HR.consol.state();
    stat.textContent = line(); $('btnConReview').textContent = 'Review' + (s.queue.length ? ' (' + s.queue.length + ')' : '');
    if (dlg && dlg.open) draw();
  }
  function fail(e) { dstat.textContent = String(e && e.message || e); }
  function draw() {
    var s = HR.consol.state(); list.innerHTML = '';
    dstat.textContent = (s.status ? s.status + ' ' : '') + (s.queue.length ? '' : 'Nothing to review.');
    $('conUndo').disabled = !s.undo;
    s.queue.forEach(function (q) {
      var row = document.createElement('div'), ta = document.createElement('textarea'), sel = document.createElement('select'), src = document.createElement('small');
      row.className = 'know-row'; ta.className = 'inp'; ta.rows = 2; ta.maxLength = 300; ta.value = q.text; ta.setAttribute('aria-label', 'Proposed note');
      ta.onchange = function () { HR.consol.edit(q.id, ta.value); };
      [['session', 'This chat (session notes)'], ['user', 'About you (all chats)'], ['assistant', 'Agent notes (all chats)']].forEach(function (o) { var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; sel.appendChild(op); });
      sel.className = 'inp'; sel.setAttribute('aria-label', 'Save to');
      src.textContent = 'From this chat\'s user turns (' + q.src.users + ')' + (q.src.ctx ? ' + summary' : '') + ' · ' + q.at + (q.edited ? ' · edited' : '');
      var ok = document.createElement('button'), no = document.createElement('button');
      ok.type = no.type = 'button'; ok.className = no.className = 'hb'; ok.textContent = 'Save to memory'; no.textContent = 'Dismiss';
      ok.onclick = function () { HR.consol.approve(q.id, sel.value, ta.value).then(paint, fail); };
      no.onclick = function () { HR.consol.reject(q.id).then(paint); };
      var bar = document.createElement('div'); bar.className = 'ec-row start'; bar.append(sel, ok, no);
      row.append(ta, src, bar); list.appendChild(row);
    });
  }
  function init() {
    stat = $('conStat'); dlg = $('conDlg'); list = $('conList'); dstat = $('conDlgStat'); if (!stat || !dlg) return;
    $('btnConRun').onclick = function () { HR.consol.now().then(paint, function (e) { stat.textContent = String(e && e.message || e); }); };
    $('btnConReview').onclick = function () { dlg.showModal(); draw(); };
    $('conUndo').onclick = function () { HR.consol.undo().then(paint, fail); };
    $('conClose').onclick = function () { dlg.close(); };
    HR.consol.onChange(paint); paint(); setInterval(paint, 5000);
  }
  return { init: init, paint: paint };
})();
