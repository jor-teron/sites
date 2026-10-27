/* Harness — app/tools/memory.js: memory_read / memory_append over harness/memory.md (HR4). Folder needed.
   Append needs no approval (it shows as a step and a chip); each note is one line "- YYYY-MM-DD HH:MM note" (~500 chars max). */
(function () {
  var avail = function () { return HR.fs.ready(); };
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  HR.tools.register({ name: 'memory_read', available: avail, description: 'Read all saved memory notes (harness/memory.md).',
    parameters: { type: 'object', properties: {} },
    run: async function () {
      try { var t = (await HR.fs.read(HR.prompt.MEM)).text; } catch (e) { return '(no memory notes yet)'; }
      return t.length > 20000 ? '…' + t.slice(-20000) : (t.trim() || '(no memory notes yet)');
    } });
  HR.tools.register({ name: 'memory_append', available: avail, description: 'Save one short durable note to memory (a fact, preference or ongoing task). Not for secrets.',
    parameters: { type: 'object', properties: { note: { type: 'string', description: 'The note, one or two sentences' } }, required: ['note'] },
    run: async function (a) {
      var n = String(a.note || '').replace(/\s+/g, ' ').trim().slice(0, 500), d = new Date();
      if (!n) throw new Error('Empty note');
      var st = await HR.fs.stat(HR.prompt.MEM), line = '- ' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ' ' + n + '\n';
      await HR.fs.append(HR.prompt.MEM, (st.exists ? '' : '# Memory\n\n') + line);
      return 'Saved to memory: ' + n;
    } });
})();
