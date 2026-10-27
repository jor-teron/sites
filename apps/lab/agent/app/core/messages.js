/* Agent — app/core/messages.js: the open chat's history (HR.msgs). AG4: one list per chat; HR.chats loads it with set(list)
   and save() asks HR.chats to write the chat file (debounced). The old sessionStorage 'agent.history' is only read once
   by legacy() so a pre-AG4 tab's chat becomes the first saved chat. Message: {role:'user'|'assistant'|'tool', content, at,
   thinking, stats, error, model, tool_calls (assistant, HR2), tool_name / tool_call_id / args / ok / ms (tool result, HR2/HR6)}.
   toApi(): recent turns in full (about RECENT chars, always from the last user turn), older turns as one short trimmed
   system note (each line ≤ LINE chars, the note ≤ OLDCAP chars, newest kept) — plain truncation, no extra model call.
   splitThink(text) moves <think>…</think> (also an unclosed <think> while streaming) out of the visible text. */
window.HR = window.HR || {};
HR.msgs = (function () {
  var list = [], RECENT = 6000, LINE = 160, OLDCAP = 1500;
  function legacy() { try { var l = JSON.parse(sessionStorage.getItem('agent.history') || '[]'); sessionStorage.removeItem('agent.history'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
  function save() { if (HR.chats && HR.chats.dirty) HR.chats.dirty(); }
  function add(m) { if (!m.at) m.at = new Date().toISOString().slice(0, 16); list.push(m); save(); return m; }
  function set(l) { list = Array.isArray(l) ? l : []; }
  function clear() { list = []; save(); }
  function all() { return list; }
  function size(o) { return (o.content || '').length + (o.tool_calls ? JSON.stringify(o.tool_calls).length : 0) + 20; }
  function cut(t, n) { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
  /* What the model sees: role + content only, no failed/empty replies; old turns trimmed to a char budget */
  function toApi() {
    var arr = list.filter(function (m) { return !m.error && (m.role !== 'assistant' || m.content || (m.tool_calls && m.tool_calls.length)); })
      .map(function (m) {
        var o = { role: m.role, content: m.content || '' };
        if (m.tool_calls && m.tool_calls.length) o.tool_calls = m.tool_calls;
        if (m.role === 'tool') { o.tool_name = m.tool_name; if (m.tool_call_id) o.tool_call_id = m.tool_call_id; }
        return o;
      });
    var lastUser = -1, i, sum = 0, from = 0;
    for (i = arr.length - 1; i >= 0; i--) if (arr[i].role === 'user') { lastUser = i; break; }
    for (i = arr.length - 1; i >= 0; i--) { sum += size(arr[i]); if (sum > RECENT) { from = i + 1; break; } }
    while (from < arr.length && arr[from].role !== 'user') from++;      /* start at a user turn: tool pairs stay whole */
    if (lastUser >= 0 && from > lastUser) from = lastUser;
    if (from <= 0) return arr;
    var lines = arr.slice(0, from).map(function (m) {
      return m.role === 'tool' ? '- tool ' + m.tool_name + ' → ' + cut(m.content, LINE)
        : '- ' + m.role + ': ' + cut(m.content || (m.tool_calls ? '(called ' + m.tool_calls.map(function (c) { return c.function && c.function.name; }).join(', ') + ')' : ''), LINE);
    }), note = '';
    for (i = lines.length - 1; i >= 0 && note.length + lines[i].length < OLDCAP; i--) note = lines[i] + '\n' + note;
    return [{ role: 'system', content: 'Earlier in this chat (trimmed' + (i >= 0 ? ', oldest dropped' : '') + '):\n' + note.trim() }].concat(arr.slice(from));
  }
  function splitThink(text) {
    var think = '', out = '', s = String(text || ''), re = /<think>([\s\S]*?)(<\/think>|$)/g, last = 0, m;
    while ((m = re.exec(s))) { out += s.slice(last, m.index); think += (think ? '\n' : '') + m[1]; last = re.lastIndex; if (!m[2]) break; }
    out += s.slice(last);
    return { content: out.replace(/^\s+/, ''), thinking: think.trim(), open: /<think>(?![\s\S]*<\/think>)/.test(s) };
  }
  return { add: add, set: set, clear: clear, all: all, save: save, legacy: legacy, toApi: toApi, splitThink: splitThink };
})();
