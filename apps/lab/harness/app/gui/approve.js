/* Harness — app/gui/approve.js: Approve / Deny card in the chat for risky tool calls (HR3: write_file).
   HR.approve(info, signal) -> Promise<boolean>. Shows path, size (new / replaces N bytes) and a text preview (no diff).
   Stop (signal abort) counts as Deny. Buttons lock after the choice; the card stays as a record. */
HR.approve = function (info, signal) {
  var V = HR.view, el = V.el;
  return new Promise(function (resolve) {
    var c = el('div', 'acard'), t = el('div', 'ac-t', '✍️ Write file?'), meta = el('div', 'ac-m');
    meta.append(el('code', null, info.path), ' · ' + info.size + ' bytes · ' + (info.exists ? 'replaces existing (' + info.oldSize + ' bytes)' : 'new file'));
    var pv = String(info.preview || ''), pre = el('pre', 'ac-p', pv.length > 1500 ? pv.slice(0, 1500) + '\n…' : pv || '(empty file)');
    var row = el('div', 'ec-row'), yes = el('button', 'hb wide ok', 'Approve'), no = el('button', 'hb wide', 'Deny'), done = false;
    yes.type = no.type = 'button';
    function fin(v) {
      if (done) return; done = true; yes.disabled = no.disabled = true;
      c.classList.add(v ? 'yes' : 'no'); t.textContent = (v ? '✅ Approved: write ' : '🚫 Denied: write ') + info.path;
      if (signal) signal.removeEventListener('abort', onAbort); resolve(v);
    }
    function onAbort() { fin(false); }
    yes.onclick = function () { fin(true); }; no.onclick = function () { fin(false); };
    if (signal) { if (signal.aborted) return resolve(false); signal.addEventListener('abort', onAbort); }
    row.append(yes, no); c.append(t, meta, pre, row);
    document.getElementById('log').appendChild(c); V.bottom(true);
    HR.notify({ icon: '✍️', title: 'Harness', text: 'Approve writing ' + info.path + '?', onClick: function () { window.focus(); yes.focus(); } });
    yes.focus();
  });
};
