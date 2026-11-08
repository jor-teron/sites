/* Agent — app/tools/search_semantic.js: memory_semantic_search tool (AG34) over HR.sem. Offered only when a semantic index
   exists for the current embedding choice, a folder is open, Memory is on and the Hub embedding API is present.
   One query embedding per call (may cost provider credits). Read-only; results are quoted data with path:lines. */
(function () {
  HR.tools.register({ name: 'memory_semantic_search', available: function () { return HR.sem.usable(); },
    description: 'Meaning-based search of saved user/assistant notes, topics and imported knowledge documents (not this chat\'s session notes; use memory_search for those and for exact words). Use when keyword search misses related wording. Returns the closest passages with path:lines, or no match.',
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'What to look for, in plain words' }, limit: { type: 'integer', description: 'Max results, 1-8 (default 4)' } }, required: ['query'] },
    run: async function (a, ctx) { return HR.sem.format(await HR.sem.search(a.query, { limit: a.limit, signal: ctx && ctx.signal })); } });
})();
