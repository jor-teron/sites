/* Agent — app/tools/memory.js: memory_read / memory_append over HR.mem (agent/memory/, AG4; HR4 started it). Folder needed.
   target: user (facts about the user, default) | assistant (your own notes) | session (this chat's ongoing work) |
   topic (+ name) | date (monthly diary, read only; name = YYYY_MM). Append needs no approval (shows as a step and a chip). */
(function () {
  var avail = function () { return HR.fs.ready(); };
  var T = { type: 'string', enum: ['user', 'assistant', 'session', 'topic', 'date'], description: 'user = facts about the user; assistant = your notes; session = what this chat is working on; topic = a named topic file; date = monthly diary' };
  var N = { type: 'string', description: 'Topic name for target topic (e.g. "garden"); YYYY_MM for target date' };
  HR.tools.register({ name: 'memory_read', available: avail, description: 'Read saved memory. target: user | assistant | session | topic (needs name; no name lists topics) | date.',
    parameters: { type: 'object', properties: { target: T, name: N } },
    run: async function (a) {
      var tg = a.target || 'user';
      if (tg === 'topic' && !a.name) { var l = await HR.mem.topics(); return l.length ? 'Topics: ' + l.join(', ') : '(no topics yet)'; }
      var t = await HR.mem.read(tg, a.name);
      if (t == null || !t.trim()) return '(no ' + tg + ' notes yet)';
      return t.length > 20000 ? '…' + t.slice(-20000) : t.trim();
    } });
  HR.tools.register({ name: 'memory_append', available: avail, description: 'Save one short durable note (fact, preference or ongoing task) to memory. target: user | assistant | session | topic (needs name). Not for secrets.',
    parameters: { type: 'object', properties: { note: { type: 'string', description: 'The note, one or two sentences' }, target: { type: 'string', enum: ['user', 'assistant', 'session', 'topic'], description: T.description }, name: N }, required: ['note'] },
    run: async function (a) {
      var tg = a.target || 'user'; if (tg === 'date') throw new Error('The diary is written automatically; pick user, assistant, session or topic');
      var p = await HR.mem.append(tg, a.note, a.name);
      return 'Saved to ' + p.replace(/^agent\//, '') + ': ' + String(a.note).replace(/\s+/g, ' ').trim().slice(0, 500);
    } });
})();
