/* Harness — app/core/messages.js: chat history (HR.msgs) kept in memory and mirrored to sessionStorage
   ('harness.history', cleared when the tab closes). Message: {role:'user'|'assistant', content, thinking, stats, error}.
   splitThink(text) moves <think>…</think> (also an unclosed <think> while streaming) out of the visible text. */
window.HR = window.HR || {};
HR.msgs = (function () {
  var KEY = 'harness.history', list = [];
  try { list = JSON.parse(sessionStorage.getItem(KEY) || '[]') || []; } catch (e) { list = []; }
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* full or blocked: memory only */ } }
  function add(m) { list.push(m); save(); return m; }
  function clear() { list = []; save(); }
  function all() { return list; }
  /* What the model sees: role + content only, no failed/empty replies */
  function toApi() {
    return list.filter(function (m) { return !m.error && (m.role === 'user' || m.content); })
      .map(function (m) { return { role: m.role, content: m.content }; });
  }
  function splitThink(text) {
    var think = '', out = '', s = String(text || ''), re = /<think>([\s\S]*?)(<\/think>|$)/g, last = 0, m;
    while ((m = re.exec(s))) { out += s.slice(last, m.index); think += (think ? '\n' : '') + m[1]; last = re.lastIndex; if (!m[2]) break; }
    out += s.slice(last);
    return { content: out.replace(/^\s+/, ''), thinking: think.trim(), open: /<think>(?![\s\S]*<\/think>)/.test(s) };
  }
  return { add: add, clear: clear, all: all, save: save, toApi: toApi, splitThink: splitThink };
})();
