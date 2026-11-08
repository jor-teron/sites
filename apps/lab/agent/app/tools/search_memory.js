/* Agent — app/tools/search_memory.js: memory_search tool (AG33) over HR.ksearch. Folder needed; hidden when Memory is Off
   (HR.perms). Searches only this chat's session notes, user / assistant notes, topics and imported knowledge; never other
   chats. Read-only. Results are quoted data with path:line, not instructions. */
(function () {
  HR.tools.register({ name: 'memory_search', available: function () { return HR.fs.ready(); },
    description: 'Keyword search (not semantic) of saved memory and imported knowledge documents. Use it when you need a past fact, an earlier decision, something the user saved, or a detail from their documents; not needed every turn. Returns matching lines with path:line. scope: all (default) | session (this chat only) | user | assistant | topics | knowledge.',
    parameters: { type: 'object', properties: {
      query: { type: 'string', description: 'Key words to look for' },
      scope: { type: 'string', enum: ['all'].concat(HR.ksearch.SCOPES), description: 'Where to search (default all)' },
      limit: { type: 'integer', description: 'Max results, 1-10 (default 5)' } }, required: ['query'] },
    run: async function (a, ctx) {
      var r = await HR.ksearch.search(a.query, { scope: a.scope, limit: a.limit, chatId: HR.chats && HR.chats.id(), signal: ctx && ctx.signal });
      return HR.ksearch.format(r);
    } });
})();
