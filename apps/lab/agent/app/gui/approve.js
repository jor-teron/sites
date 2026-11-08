/* Agent — app/gui/approve.js: Approve / Deny card in the chat for risky tool calls (HR3: write_file, HR5: run_shell).
   HR.approve(info, signal) -> Promise<boolean>. write: path, size (new / replaces N bytes), text preview (no diff).
   shell (info.kind 'shell'): the full command, working folder and timeout.
   AG40: trash (info.path, size, reason) and rename (info.path → info.to) cards; write_user = a write into user/.
   Stop (signal abort) counts as Deny. Buttons lock after the choice; the card stays as a record. */
HR.approve = function (info, signal) {
  var V = HR.view, el = V.el;
  return new Promise(function (resolve) {
    var sh = info.kind === 'shell', tr = info.kind === 'trash', rn = info.kind === 'rename', mv = tr || rn;   /* AG40 */
    var what = sh ? 'run command' : tr ? 'move ' + info.path + ' to trash' : rn ? 'rename ' + info.path + ' → ' + info.to : 'write ' + info.path;
    var c = el('div', 'acard'), t = el('div', 'ac-t', sh ? '💻 Run command?' : tr ? '🗑 Move to trash?' : rn ? '✏️ Rename file?' : '✍️ Write file?'), meta = el('div', 'ac-m');
    if (tr) meta.append(el('code', null, info.path), ' · ' + info.size + ' bytes · goes to trash/ (not deleted; logged in trash/trash.md)');
    else if (rn) meta.append(el('code', null, info.path), ' → ', el('code', null, info.to), ' · ' + info.size + ' bytes · will not overwrite');
    else if (info.kind === 'write_user') meta.append(el('code', null, info.path), ' · ' + info.size + ' bytes · in user/ (your shared files) · ' + (info.exists ? 'replaces existing (' + info.oldSize + ' bytes)' : 'new file'));
    else if (sh) meta.append('in ', el('code', null, info.cwd || '(helper root)'), ' · timeout ' + info.timeout + ' s · via helper');
    else meta.append(el('code', null, info.path), ' · ' + info.size + ' bytes · ' + (info.exists ? 'replaces existing (' + info.oldSize + ' bytes)' : 'new file'));
    var pv = String((sh ? info.command : mv ? (tr ? 'Reason: ' + (info.reason || '(none)') : '') : info.preview) || ''), pre = el('pre', 'ac-p', sh || mv ? pv : pv.length > 1500 ? pv.slice(0, 1500) + '\n…' : pv || '(empty file)');
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
    HR.notify({ icon: sh ? '💻' : '✍️', title: 'Agent', text: 'Approve: ' + (sh ? pv.slice(0, 80) : what) + '?', onClick: function () { window.focus(); yes.focus(); } });
    yes.focus();
  });
};
