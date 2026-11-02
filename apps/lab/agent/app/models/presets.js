/* Agent — app/models/presets.js (AG12): the provider tabs, in order, and the OpenAI-compatible presets. HR.presets.
   ORDER: browser, ollama, gemini, groq, openrouter, xai, deepseek, deepinfra, openai, custom.
   OA: OpenAI-compatible ids that reuse app/models/openai.js (registered once per id) with a fixed base URL;
   'custom' (LM Studio, vLLM…) uses setting customBase (else the Hub's openai_base). hub = Hub key name ('' = none yet,
   DeepInfra: local key only). byHost(base) -> preset id for a base URL ('' when none; used by app/core/migrate.js). */
HR.presets = (function () {
  var OA = [
    { id: 'groq', label: 'Groq', base: 'https://api.groq.com/openai/v1', hub: 'groq', eg: 'llama-3.3-70b-versatile' },
    { id: 'openrouter', label: 'OpenRouter', base: 'https://openrouter.ai/api/v1', hub: 'openrouter', eg: 'openai/gpt-4o-mini' },
    { id: 'xai', label: 'xAI', base: 'https://api.x.ai/v1', hub: 'xai', eg: 'grok-4' },
    { id: 'deepseek', label: 'DeepSeek', base: 'https://api.deepseek.com/v1', hub: 'deepseek', eg: 'deepseek-chat' },
    { id: 'deepinfra', label: 'DeepInfra', base: 'https://api.deepinfra.com/v1/openai', hub: '', eg: 'meta-llama/Llama-3.3-70B-Instruct' },
    { id: 'openai', label: 'OpenAI', base: 'https://api.openai.com/v1', hub: 'openai_key', eg: 'gpt-4o-mini' },
    { id: 'custom', label: 'Custom', base: '', hub: '', eg: 'local model name' }];
  var ORDER = ['browser', 'ollama', 'gemini'].concat(OA.map(function (p) { return p.id; }));
  function host(u) { try { return new URL(u).host; } catch (e) { return ''; } }
  function get(id) { return OA.filter(function (p) { return p.id === id; })[0] || null; }
  function byHost(b) { var h = host(b); var p = h && OA.filter(function (x) { return x.base && host(x.base) === h; })[0]; return p ? p.id : ''; }
  return { OA: OA, ORDER: ORDER, get: get, byHost: byHost, host: host };
})();
if (HR.migrate && HR.migrate.ag12) HR.migrate.ag12();   /* AG12: old 'openai' + base -> its tab */
