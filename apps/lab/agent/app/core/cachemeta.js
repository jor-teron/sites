/* Agent — app/core/cachemeta.js: provider-reported prompt-cache reads (AG35 stage 2). HR.cacheMeta.
   Reads HubAPI chatAdvanced res.usage.cache = {cached_input_tokens, source} (Hub H141; publish pending). Accepted only when:
   cached_input_tokens is a safe integer ≥ 0 (0 is a real reported zero), source is one of the fixed Hub source strings,
   and the same reply carries a real provider prompt count (res.prompt_eval_count, safe integer) with cached ≤ prompt.
   Anything else (absent, malformed, unknown source, estimated prompt count) -> null = unknown. Never inferred from timing
   or local prompt comparison; no cache-write or money figures. Cached tokens are a part of the input count, not extra. */
HR.cacheMeta = (function () {
  var SOURCES = ['usage.prompt_tokens_details.cached_tokens', 'x_groq.usage.prompt_tokens_details.cached_tokens', 'usage.prompt_cache_hit_tokens', 'usageMetadata.cachedContentTokenCount'];
  function read(res) {
    var c = res && res.usage && res.usage.cache, p = res && res.prompt_eval_count;
    if (!c || typeof c !== 'object') return null;
    var n = c.cached_input_tokens;
    if (!Number.isSafeInteger(n) || n < 0 || SOURCES.indexOf(c.source) < 0) return null;
    if (!Number.isSafeInteger(p) || p <= 0 || n > p) return null;
    return { cached: n, prompt: p, source: c.source };
  }
  return { read: read, SOURCES: SOURCES };
})();
