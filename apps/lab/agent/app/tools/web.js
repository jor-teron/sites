/* Agent — app/tools/web.js: web tools through Tavily (AG6). HR.web + tools web_search / web_fetch.
   web_search(query, max_results 1–10 default 5) -> POST https://api.tavily.com/search -> [{title, url, snippet}].
   web_fetch(url) -> POST /extract -> readable text of one page, trimmed to ~8k chars.
   Depth: Settings → Web → basic (1 credit) | advanced (2 credits); extract = 1 / 2 credits per call (up to 5 URLs, we send 1).
   Read-only: no approval card, but every call shows in Steps / the diary like other tools.
   Offered only when a Tavily key is set and Allow web is on (HR.web.ready(); also HR.perms). Tavily allows browser
   CORS (Access-Control-Allow-Origin: *, checked AG6). Credits used go to HR.usage.credits('tavily', n) (Settings → Usage).
   401 / 429 / 432 / 433 -> a clear error card in the chat (HR.view.infoCard) and an error result for the model. */
HR.web = (function () {
  var API = 'https://api.tavily.com', LIMIT = 8000;
  function key() { return (HR.hubKeys && HR.hubKeys.val('tavily')) || String(HR.set.get('tavilyKey') || '').trim(); }   /* AG9: Hub key first */
  function ready() { return !!key() && HR.set.get('allowWeb') !== 'off'; }
  function depth() { return HR.set.get('webDepth') === 'advanced' ? 'advanced' : 'basic'; }
  function card(st, msg) {
    var t = st === 401 || st === 403 ? '🔑 Tavily key rejected (' + st + ')' : st === 429 ? '⏳ Tavily rate limit (429)' : st === 432 || st === 433 ? '🪫 Tavily credits used up (' + st + ')' : '⚠️ Tavily error' + (st ? ' (' + st + ')' : '');
    var b = st === 401 || st === 403 ? 'Check the key in Settings ⚙ → Web (get one at tavily.com).' : st === 429 ? 'Too many requests right now; wait a minute and try again.'
      : st === 432 || st === 433 ? 'This month\'s plan credits (free: 1,000) are gone. Wait for the reset, upgrade at tavily.com, or turn Allow web off.' : (msg || '');
    try { HR.view.infoCard(t, b + (msg && b !== msg ? ' — ' + msg : '')); } catch (e) {}
    return t + ': ' + b;
  }
  async function call(path, body, signal) {
    var r;
    try { r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key() }, body: JSON.stringify(body), signal: signal }); }
    catch (e) { if (e && e.name === 'AbortError') throw e; throw new Error('Can\'t reach api.tavily.com (' + (e && e.message || e) + ')'); }
    var j = await r.json().catch(function () { return null; });
    if (!r.ok) {
      var d = j && j.detail, m = d && (d.error || (typeof d === 'string' ? d : '')) || (j && j.error) || r.statusText;
      throw new Error(card(r.status, m));
    }
    return j || {};
  }
  function spent(j, n) { var c = j && j.usage && +j.usage.credits; HR.usage.credits('tavily', c >= 0 && !isNaN(c) ? c : n); }
  async function search(a, ctx) {
    var q = String(a.query || '').trim(); if (!q) throw new Error('query is required');
    var n = Math.max(1, Math.min(10, parseInt(a.max_results, 10) || 5)), dp = depth();
    var j = await call('/search', { query: q, max_results: n, search_depth: dp, include_usage: true }, ctx.signal);
    spent(j, dp === 'advanced' ? 2 : 1);
    var res = (j.results || []).map(function (r) { return { title: r.title || '', url: r.url || '', snippet: String(r.content || '').slice(0, 500) }; });
    return { query: q, depth: dp, results: res };
  }
  async function extract(a, ctx) {
    var u = String(a.url || '').trim(); if (!/^https?:\/\//i.test(u)) throw new Error('url must start with http:// or https://');
    var dp = depth(), j = await call('/extract', { urls: [u], extract_depth: dp, include_usage: true }, ctx.signal);
    var r = (j.results || [])[0];
    if (!r) { var f = (j.failed_results || [])[0]; throw new Error('Could not read ' + u + (f && f.error ? ' (' + f.error + ')' : '')); }
    spent(j, dp === 'advanced' ? 2 : 1);
    var t = String(r.raw_content || '').replace(/\n{3,}/g, '\n\n').trim();
    return 'URL: ' + (r.url || u) + '\n' + (t.length > LIMIT ? t.slice(0, LIMIT) + '\n…[trimmed, ' + t.length + ' chars total]' : t || '(no readable text)');
  }
  return { ready: ready, key: key, depth: depth, search: search, extract: extract };
})();
HR.tools.register({
  name: 'web_search', where: 'browser', available: HR.web.ready,
  description: 'Search the web (Tavily). Returns up to max_results results with title, url and a short snippet. Use web_fetch to read a page.',
  parameters: { type: 'object', properties: { query: { type: 'string', description: 'What to search for' }, max_results: { type: 'integer', description: 'How many results, 1–10 (default 5)' } }, required: ['query'] },
  run: function (a, ctx) { return HR.web.search(a, ctx); }
});
HR.tools.register({
  name: 'web_fetch', where: 'browser', available: HR.web.ready,
  description: 'Read one web page as plain text (Tavily extract), trimmed to about 8000 characters.',
  parameters: { type: 'object', properties: { url: { type: 'string', description: 'Full http(s) URL' } }, required: ['url'] },
  run: function (a, ctx) { return HR.web.extract(a, ctx); }
});
