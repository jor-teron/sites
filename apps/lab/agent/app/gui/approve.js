/* Agent — app/gui/approve.js: Approve / Deny card in the chat for risky tool calls (HR3: write_file, HR5: run_shell).
   HR.approve(info, signal) -> Promise<boolean>. write: path, size (new / replaces N bytes), text preview (no diff).
   shell (info.kind 'shell'): the full command, working folder and timeout.
   Stop (signal abort) counts as Deny. Buttons lock after the choice; the card stays as a record. */
HR.approve = function (info, signal) {
  var V = HR.view, el = V.el;
  return new Promise(function (resolve) {
    var sh = info.kind === 'shell', what = sh ? 'run command' : 'write ' + info.path;
    var c = el('div', 'acard'), t = el('div', 'ac-t', sh ? '💻 Run command?' : '✍️ Write file?'), meta = el('div', 'ac-m');
    if (sh) meta.append('in ', el('code', null, info.cwd || '(helper root)'), ' · timeout ' + info.timeout + ' s · via helper');
    else meta.append(el('code', null, info.path), ' · ' + info.size + ' bytes · ' + (info.exists ? 'replaces existing (' + info.oldSize + ' bytes)' : 'new file'));
    var pv = String((sh ? info.command : info.preview) || ''), pre = el('pre', 'ac-p', sh ? pv : pv.length > 1500 ? pv.slice(0, 1500) + '\n…' : pv || '(empty file)');
    var row = el('div', 'ec-row'), yes = el('button', 'hb wide ok', 'Approve'), no = el('button', 'hb wide', 'Deny'), done = false;
    yes.type = no.type = 'button';
    function fin(v) {
      if (done) return; done = true; yes.disabled = no.disabled = true;
      c.classList.add(v ? 'yes' : 'no'); t.textContent = (v ? '✅ Approved: ' : '🚫 Denied: ') + what;
      if (signal) signal.removeEventListener('abort', onAbort); resolve(v);
    }
    function onAbort() { fin(false); }
    yes.onclick = function () { fin(true); }; no.onclick = function () { fin(false); };
    if (signal) { if (signal.aborted) return resolve(false); signal.addEventListener('abort', onAbort); }
    row.append(yes, no); c.append(t, meta, pre, row);
    document.getElementById('log').appendChild(c); V.bottom(true);
    HR.notify({ icon: sh ? '💻' : '✍️', title: 'Agent', text: 'Approve: ' + (sh ? pv.slice(0, 80) : 'write ' + info.path) + '?', onClick: function () { window.focus(); yes.focus(); } });
    yes.focus();
  });
};
