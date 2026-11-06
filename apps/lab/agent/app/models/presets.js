/* Agent — app/models/presets.js: provider company tabs and default endpoints.
   AG24: these ids are UI choices, never Hub key-slot names. Custom uses only
   Agent's customBase. Visible Hub services are matched through metadata. */
HR.presets = (function () {
  var OA = [
    { id: 'groq', label: 'Groq', base: 'https://api.groq.com/openai/v1', eg: 'llama-3.3-70b-versatile' },
    { id: 'openrouter', label: 'OpenRouter', base: 'https://openrouter.ai/api/v1', eg: 'openai/gpt-4o-mini' },
    { id: 'xai', label: 'xAI', base: 'https://api.x.ai/v1', eg: 'grok-4' },
    { id: 'deepseek', label: 'DeepSeek', base: 'https://api.deepseek.com/v1', eg: 'deepseek-chat' },
    { id: 'deepinfra', label: 'DeepInfra', base: 'https://api.deepinfra.com/v1/openai', eg: 'meta-llama/Llama-3.3-70B-Instruct' },
    { id: 'openai', label: 'OpenAI', base: 'https://api.openai.com/v1', eg: 'gpt-4o-mini' },
    { id: 'custom', label: 'Custom', base: '', eg: 'local model name' }];
  var ORDER = ['browser', 'ollama', 'gemini'].concat(OA.map(function (p) { return p.id; }));
  function host(u) { try { return new URL(u).host; } catch (e) { return ''; } }
  function get(id) { return OA.filter(function (p) { return p.id === id; })[0] || null; }
  function byHost(b) { var h = host(b); var p = h && OA.filter(function (x) { return x.base && host(x.base) === h; })[0]; return p ? p.id : ''; }
  return { OA: OA, ORDER: ORDER, get: get, byHost: byHost, host: host };
})();
if (HR.migrate && HR.migrate.ag12) HR.migrate.ag12();   /* AG12: old 'openai' + base -> its tab */
