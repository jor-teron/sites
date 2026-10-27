/* Harness — app/storage/logs.js: daily Markdown chat logs in the granted folder (HR4).
   harness/chats/YYYY_MM/YYYY_MM_DD.md: "# user — HH:MM", "## assistant — HH:MM", tool steps as short "> 🔧 …" blockquotes,
   HR5 shell runs as "> 💻" + a fenced output block (first ~1500 chars).
   Only when a folder is connected and Settings → Save chats to folder is on (default). Appends are queued one at a time;
   a failed write shows one notice card and logging carries on. */
HR.logs = (function () {
  var q = Promise.resolve(), warned = false;
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function path(d) { var y = d.getFullYear(), m = pad(d.getMonth() + 1); return 'harness/chats/' + y + '_' + m + '/' + y + '_' + m + '_' + pad(d.getDate()) + '.md'; }
  function on() { return HR.fs.ready() && HR.set.get('saveChats') !== 'off'; }
  function one(s, n) { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; }
  function put(text) {
    if (!on()) return q;
    var d = new Date(), p = path(d);
    q = q.then(function () { return HR.fs.append(p, text.replace(/\{t\}/g, hm(d))); }).catch(function (e) {
      if (!warned) { warned = true; HR.notify({ icon: '📁', title: 'Harness', text: 'Could not save chat log: ' + (e && e.message || e) }); }
    });
    return q;
  }
  function user(text) { return put('\n# user — {t}\n\n' + text + '\n'); }
  function assistant(m, note) {
    var body = (m.content || '').trim(), tc = (m.tool_calls || []).length;
    if (!body && !note) return q;
    return put('\n## assistant — {t}' + (m.model ? ' · ' + m.model : '') + (note ? ' · ' + note : '') + '\n\n' + (body || '_(no text' + (tc ? ', ' + tc + ' tool call' + (tc > 1 ? 's' : '') : '') + ')_') + '\n');
  }
  function tool(name, args, ok, text, ms) {
    return put('\n> 🔧 ' + name + '(' + one(JSON.stringify(args || {}), 120) + ') ' + (ok ? '✓' : '✕') + ' ' + Math.round(ms) + ' ms → ' + one(text, 200) + '\n');
  }
  function shell(cmd, cwd, r) {
    var out = ((r.stdout || '') + (r.stderr ? '\n[stderr]\n' + r.stderr : '')).replace(/```/g, "'''"), cap = out.length > 1500 ? out.slice(0, 1500) + '\n…' : out;
    return put('\n> 💻 `' + one(cmd, 300).replace(/`/g, "'") + '`' + (cwd ? ' in ' + one(cwd, 100) : '') + ' → exit ' + r.code + ', ' + r.ms + ' ms\n\n```text\n' + (cap || '(no output)') + '\n```\n');
  }
  function note(text) { return put('\n> ℹ ' + one(text, 200) + '\n'); }
  return { path: path, user: user, assistant: assistant, tool: tool, shell: shell, note: note, enabled: on };
})();
