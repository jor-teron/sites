/* Agent — app/storage/threadfmt.js: one chat as Markdown (AG4), same text in the folder and in IndexedDB.
   Header lines start with ':' (": agent chat", ": id", ": title"). Turns: "# user — <iso>", "## assistant — <iso> · model",
   "### tool — name ✓|✕ · ms". Meta lines right under a heading: ": tool_calls <json>", ": args <json>", ": id <tool_call_id>".
   Body lines starting with '#', ':' or '\' are written with a leading '\' so they never look like headings (read strips it).
   toMd(meta, list) -> text; parse(text) -> {meta, list}. Failed replies (m.error) are not kept. */
HR.threadfmt = (function () {
  function esc(t) { return String(t || '').split('\n').map(function (l) { return /^[#:\\]/.test(l) ? '\\' + l : l; }).join('\n'); }
  function unesc(t) { return t.split('\n').map(function (l) { return l.charAt(0) === '\\' ? l.slice(1) : l; }).join('\n'); }
  function one(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function toMd(meta, list) {
    var out = [': agent chat', ': id ' + meta.id, ': title ' + one(meta.title), ''];
    list.forEach(function (m) {
      if (m.error) return;
      var t = m.at || '';
      if (m.role === 'user') out.push('# user — ' + t);
      else if (m.role === 'assistant') { out.push('## assistant — ' + t + (m.model ? ' · ' + one(m.model) : '')); if (m.tool_calls && m.tool_calls.length) out.push(': tool_calls ' + JSON.stringify(m.tool_calls)); }
      else if (m.role === 'tool') { out.push('### tool — ' + one(m.tool_name) + ' ' + (m.ok === false ? '✕' : '✓') + ' · ' + (m.ms || 0)); out.push(': args ' + JSON.stringify(m.args || {})); if (m.tool_call_id) out.push(': id ' + m.tool_call_id); }
      else return;
      out.push('', esc(m.content), '');
    });
    return out.join('\n');
  }
  function parse(text) {
    var meta = {}, list = [], cur = null, body = [], head = true;
    function flush() { if (cur) { cur.content = unesc(body.join('\n')).replace(/^\n+|\n+$/g, ''); list.push(cur); } cur = null; body = []; }
    String(text || '').split('\n').forEach(function (l) {
      var h = /^(#{1,3}) (user|assistant|tool) — ?(.*)$/.exec(l), mm;
      if (h) {
        flush(); head = true; var rest = h[3];
        if (h[2] === 'user') cur = { role: 'user', at: rest.trim() };
        else if (h[2] === 'assistant') { var i = rest.indexOf(' · '); cur = { role: 'assistant', at: (i < 0 ? rest : rest.slice(0, i)).trim(), model: i < 0 ? undefined : rest.slice(i + 3) }; }
        else { mm = /^(\S+) ([✓✕]) · (\d+)/.exec(rest) || []; cur = { role: 'tool', tool_name: mm[1] || '?', ok: mm[2] !== '✕', ms: +mm[3] || 0 }; }
        return;
      }
      if (head && l.charAt(0) === ':') {
        mm = /^: (\S+) ?(.*)$/.exec(l); if (!mm) return;
        try {
          if (!cur) { if (mm[1] === 'id' || mm[1] === 'title') meta[mm[1]] = mm[2]; }
          else if (mm[1] === 'tool_calls') cur.tool_calls = JSON.parse(mm[2]);
          else if (mm[1] === 'args') cur.args = JSON.parse(mm[2]);
          else if (mm[1] === 'id') cur.tool_call_id = mm[2];
        } catch (e) { /* bad meta line: skip */ }
        return;
      }
      head = false; if (cur) body.push(l);
    });
    flush();
    return { meta: meta, list: list };
  }
  return { toMd: toMd, parse: parse };
})();
