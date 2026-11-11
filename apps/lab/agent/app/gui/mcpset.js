/* Agent — app/gui/mcpset.js: Settings → MCP Servers (AG44). HR.mcpSet.
   Add / edit / delete a remote server (name, URL, optional bearer key), an on/off switch, a status dot
   (connected / error with a short reason / off) and a tap that shows that server's tools.
   Refresh and the on/off switch call HR.mcp.sync(). Delete asks with HR.confirm (app/gui/confirm.js).
   The key is a password field and is saved only in localStorage with the server list. No browser alert,
   confirm or prompt. Missing markup (image.html) makes init a no-op. */
HR.mcpSet = (function () {
  var listEl, editing = '', openId = '';
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function subText(s) {
    if (!s.on || s.state === 'off') return 'Off';
    if (s.state === 'wait') return 'Checking…';
    if (s.state === 'err') return s.reason || 'Not connected';
    var n = (s.tools && s.tools.length) || 0;
    return 'Connected · ' + n + ' tool' + (n === 1 ? '' : 's') + (s.always ? ' · always allow' : '');
  }
  function toolsBox(s) {
    var box = el('div', 'mcp-tools');
    if (!s.tools || !s.tools.length) {
      box.appendChild(el('p', 'hint', s.state === 'ok' ? 'This server has no tools.' : 'No tool list yet.'));
      return box;
    }
    var ul = document.createElement('ul');
    s.tools.forEach(function (t) {
      var li = document.createElement('li'), b = document.createElement('b');
      b.textContent = t.name || '';
      li.appendChild(b);
      if (t.description) li.appendChild(document.createTextNode(' — ' + t.description));
      ul.appendChild(li);
    });
    box.appendChild(ul);
    return box;
  }
  function askDel(s) {
    if (!HR.confirm) return;
    HR.confirm('Delete MCP server "' + s.name + '"?', { danger: true, okText: 'Delete' }).then(function (yes) {
      if (!yes) return;
      if (openId === s.id) openId = '';
      HR.mcp.remove(s.id);
      HR.mcp.sync();
    });
  }
  function row(s) {
    var wrap = el('div', 'mcp-item'), line = el('div', 'mcp-row');
    var dot = el('span', 'mcp-dot' + (s.state === 'ok' ? ' ok' : s.state === 'err' ? ' err' : ''));
    dot.title = s.state === 'ok' ? 'Connected' : s.state === 'err' ? (s.reason || 'Error') : s.state === 'wait' ? 'Checking' : 'Off';
    var main = el('button', 'mcp-main');
    main.type = 'button';
    main.appendChild(el('div', 'mcp-name', s.name));
    main.appendChild(el('div', 'mcp-sub', subText(s)));
    main.setAttribute('aria-expanded', openId === s.id ? 'true' : 'false');
    main.onclick = function () { openId = openId === s.id ? '' : s.id; paint(); };
    var sw = el('button', 'tg');
    sw.type = 'button';
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', s.on ? 'true' : 'false');
    sw.setAttribute('aria-label', (s.on ? 'Turn off ' : 'Turn on ') + s.name);
    sw.onclick = function () { HR.mcp.setOn(s.id, !s.on); HR.mcp.sync(); };
    var edit = el('button', 'hb', 'Edit');
    edit.type = 'button';
    edit.onclick = function () { openForm(s); };
    var del = el('button', 'hb', 'Delete');
    del.type = 'button';
    del.onclick = function () { askDel(s); };
    line.appendChild(dot); line.appendChild(main); line.appendChild(sw); line.appendChild(edit); line.appendChild(del);
    wrap.appendChild(line);
    if (openId === s.id) wrap.appendChild(toolsBox(s));
    return wrap;
  }
  function paint() {
    if (!listEl || !HR.mcp) return;
    var rows = HR.mcp.servers();
    while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
    var stat = document.getElementById('mcpStat');
    if (!rows.length) {
      if (stat) stat.textContent = 'No MCP servers. Add one to use its tools. Chat works normally with none.';
      return;
    }
    if (stat) stat.textContent = 'Tools join the agent while the server is on and connected. Each call asks first, unless Always allow is on for that server.';
    rows.forEach(function (s) { listEl.appendChild(row(s)); });
  }
  function close() {
    var d = document.getElementById('mcpDlg');
    try { if (d && d.open) d.close(); } catch (e) {}
  }
  function openForm(s) {
    var d = document.getElementById('mcpDlg'); if (!d) return;
    editing = s ? s.id : '';
    document.getElementById('mcpTitle').textContent = s ? 'Edit MCP server' : 'Add MCP server';
    document.getElementById('mcpName').value = s ? s.name : '';
    document.getElementById('mcpUrl').value = s ? s.url : '';
    var full = s && HR.mcp.get ? HR.mcp.get(s.id) : null;
    document.getElementById('mcpKey').value = full && full.key ? full.key : '';
    document.getElementById('mcpAlways').setAttribute('aria-checked', full && full.always ? 'true' : 'false');
    document.getElementById('mcpFormHint').textContent = '';
    d.showModal();
    document.getElementById('mcpName').focus();
  }
  function save(e) {
    if (e && e.preventDefault) e.preventDefault();
    var name = document.getElementById('mcpName').value.trim();
    var url = document.getElementById('mcpUrl').value.trim();
    var key = document.getElementById('mcpKey').value.trim();
    var hint = document.getElementById('mcpFormHint');
    if (!name) { hint.textContent = 'Add a name.'; return; }
    if (!/^https?:\/\//i.test(url)) { hint.textContent = 'URL must start with http:// or https://.'; return; }
    try {
      var u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('bad');
    } catch (err) { hint.textContent = 'That URL is not valid.'; return; }
    var prev = editing && HR.mcp.get ? HR.mcp.get(editing) : null;
    var always = document.getElementById('mcpAlways').getAttribute('aria-checked') === 'true';
    HR.mcp.upsert({ id: editing || '', name: name, url: url, key: key, on: prev ? prev.on : true, always: always });
    close();
    HR.mcp.sync();
  }
  function init() {
    listEl = document.getElementById('mcpList');
    if (!listEl || !HR.mcp) return;
    document.getElementById('btnMcpAdd').onclick = function () { openForm(null); };
    document.getElementById('btnMcpRefresh').onclick = function () {
      var b = document.getElementById('btnMcpRefresh');
      b.disabled = true;
      Promise.resolve(HR.mcp.sync()).then(function () { b.disabled = false; }, function () { b.disabled = false; });
    };
    document.getElementById('mcpForm').onsubmit = save;
    document.getElementById('mcpCancel').onclick = close;
    document.getElementById('mcpAlways').onclick = function () {
      var b = document.getElementById('mcpAlways');
      b.setAttribute('aria-checked', b.getAttribute('aria-checked') === 'true' ? 'false' : 'true');
    };
    var dlg = document.getElementById('mcpDlg');
    dlg.addEventListener('click', function (ev) { if (ev.target === dlg) close(); });
    HR.mcp.onChange(function () {
      var b = document.getElementById('btnMcpRefresh');
      if (b) b.disabled = false;
      paint();
    });
    var btn = document.getElementById('btnSet');
    if (btn) btn.addEventListener('click', paint);
    paint();
    HR.mcp.sync();
  }
  return { init: init, paint: paint };
})();
