/* Agent — app/gui/approve.js: Approve / Deny card in the chat for risky tool calls (HR3: write_file, HR5: run_shell).
   HR.approve(info, signal) -> Promise<boolean>. write: path, size (new / replaces N bytes), text preview (no diff).
   shell (info.kind 'shell'): the full command, working folder and timeout.
   AG40: trash (info.path, size, reason) and rename (info.path → info.to) cards; write_user = a write into user/.
   AG44: mcp (info.server, info.tool, info.args / info.preview) for a remote MCP tool call.
   Stop (signal abort) counts as Deny. Buttons lock after the choice; the card stays as a record. */
HR.approve = function (info, signal) {
  function mcpArgs(card) {
    if (card.preview != null && card.preview !== '') return String(card.preview);
    try { return JSON.stringify(card.args || {}, null, 2); } catch (e) { return ''; }
  }
  var V = HR.view, el = V.el;
  return new Promise(function (resolve) {
    /* (before AG44) var sh = info.kind === 'shell', tr = info.kind === 'trash', rn = info.kind === 'rename', mv = tr || rn; */
    var sh = info.kind === 'shell', tr = info.kind === 'trash', rn = info.kind === 'rename', mcp = info.kind === 'mcp', mv = tr || rn;   /* AG40, AG44 */
    /* (before AG44) var what = sh ? 'run command' : tr ? 'move ' + info.path + ' to trash' : rn ? 'rename ' + info.path + ' → ' + info.to : 'write ' + info.path; */
    var what = mcp ? ('call ' + (info.tool || 'tool') + ' on ' + (info.server || 'MCP')) : sh ? 'run command' : tr ? 'move ' + info.path + ' to trash' : rn ? 'rename ' + info.path + ' → ' + info.to : 'write ' + info.path;
    /* (before AG44) var c = el('div', 'acard'), t = el('div', 'ac-t', sh ? '💻 Run command?' : tr ? '🗑 Move to trash?' : rn ? '✏️ Rename file?' : '✍️ Write file?'), meta = el('div', 'ac-m'); */
    var c = el('div', 'acard'), t = el('div', 'ac-t', mcp ? '🔌 Call MCP tool?' : sh ? '💻 Run command?' : tr ? '🗑 Move to trash?' : rn ? '✏️ Rename file?' : '✍️ Write file?'), meta = el('div', 'ac-m');
    if (mcp) meta.append(el('code', null, info.server || 'MCP'), ' · ', el('code', null, info.tool || 'tool'));
    else if (tr) meta.append(el('code', null, info.path), ' · ' + info.size + ' bytes · goes to trash/ (not deleted; logged in trash/trash.md)');
    else if (rn) meta.append(el('code', null, info.path), ' → ', el('code', null, info.to), ' · ' + info.size + ' bytes · will not overwrite');
    else if (info.kind === 'write_user') meta.append(el('code', null, info.path), ' · ' + info.size + ' bytes · in user/ (your shared files) · ' + (info.exists ? 'replaces existing (' + info.oldSize + ' bytes)' : 'new file'));
    else if (sh) meta.append('in ', el('code', null, info.cwd || '(helper root)'), ' · timeout ' + info.timeout + ' s · via helper');
    else meta.append(el('code', null, info.path), ' · ' + info.size + ' bytes · ' + (info.exists ? 'replaces existing (' + info.oldSize + ' bytes)' : 'new file'));
    /* (before AG44) var pv = String((sh ? info.command : mv ? (tr ? 'Reason: ' + (info.reason || '(none)') : '') : info.preview) || ''), pre = el('pre', 'ac-p', sh || mv ? pv : pv.length > 1500 ? pv.slice(0, 1500) + '\n…' : pv || '(empty file)'); */
    var pv = String((mcp ? mcpArgs(info) : sh ? info.command : mv ? (tr ? 'Reason: ' + (info.reason || '(none)') : '') : info.preview) || '');
    var pre = el('pre', 'ac-p', mcp || sh || mv ? (pv.length > 1500 ? pv.slice(0, 1500) + '\n…' : (pv || (mcp ? '(no arguments)' : ''))) : (pv.length > 1500 ? pv.slice(0, 1500) + '\n…' : pv || '(empty file)'));
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
    /* (before AG44) HR.notify({ icon: sh ? '💻' : '✍️', title: 'Agent', text: 'Approve: ' + (sh ? pv.slice(0, 80) : what) + '?', onClick: function () { window.focus(); yes.focus(); } }); */
    HR.notify({ icon: mcp ? '🔌' : sh ? '💻' : '✍️', title: 'Agent', text: 'Approve: ' + (mcp ? what : sh ? pv.slice(0, 80) : what) + '?', onClick: function () { window.focus(); yes.focus(); } });
    yes.focus();
  });
};
