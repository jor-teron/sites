/* Agent — app/gui/pickgroups.js (AG12): model picker grouping, search and Recent. HR.pickGroups.
   chatOnly(list) drops non-chat models by name (embedding, whisper / tts / audio, imagen / veo / image / video, moderation, guard).
   groups(provider, list) -> [{name, items}]: Gemini -> Gemini / Gemma / Other; 'maker/model' ids -> by maker (nice names);
   Ollama -> by family (before ':' / first word); fewer than 10 models -> one flat group (name ''). find(list, q) = name matches.
   Recent: localStorage 'agent.recent' {provider: [last 3 picked names]}; recent(p), remember(p, name). */
HR.pickGroups = (function () {
  var NONCHAT = /embed|whisper|tts|audio|transcri|speech|imagen|veo|image-gen|dall-e|gpt-image|video|moderation|guard|rerank|aqa/i;
  var NICE = { openai: 'OpenAI', google: 'Google', 'meta-llama': 'Meta', meta: 'Meta', mistralai: 'Mistral', mistral: 'Mistral', deepseek: 'DeepSeek',
    'deepseek-ai': 'DeepSeek', anthropic: 'Anthropic', qwen: 'Qwen', 'x-ai': 'xAI', xai: 'xAI', microsoft: 'Microsoft', nvidia: 'NVIDIA', cohere: 'Cohere',
    'moonshotai': 'Moonshot', 'z-ai': 'Z.ai', thudm: 'Z.ai', amazon: 'Amazon', perplexity: 'Perplexity', nousresearch: 'Nous', llama: 'Llama', gemma: 'Gemma',
    gemma2: 'Gemma', gemma3: 'Gemma', phi: 'Phi', mixtral: 'Mistral', minimax: 'MiniMax', baidu: 'Baidu', ibm: 'IBM', 'ibm-granite': 'IBM', granite: 'IBM' };
  var RKEY = 'agent.recent';
  function chatOnly(l) { return l.filter(function (m) { return !NONCHAT.test(m.name); }); }
  function nice(k) { var l = k.toLowerCase(); return NICE[l] || (k.charAt(0).toUpperCase() + k.slice(1)); }
  function keyOf(p, n) {
    if (p === 'gemini') return /^gemma/i.test(n) ? 'Gemma' : /^gemini/i.test(n) ? 'Gemini' : 'Other';
    if (n.indexOf('/') > 0) return nice(n.split('/')[0]);
    if (p === 'ollama') { var f = n.split(':')[0].split('/').pop().match(/^[a-z]+/i); return f ? nice(f[0].replace(/\d+$/, '')) : 'Other'; }
    var w = n.match(/^[a-z]+/i); return w ? nice(w[0]) : 'Other';
  }
  function groups(p, l) {
    if (l.length < 10) return [{ name: '', items: l }];
    var map = {}, order = [];
    l.forEach(function (m) { var k = keyOf(p, m.name); if (!map[k]) { map[k] = []; order.push(k); } map[k].push(m); });
    if (p === 'gemini') order.sort(function (a, b) { var o = ['Gemini', 'Gemma', 'Other']; return o.indexOf(a) - o.indexOf(b); });
    else order.sort(function (a, b) { return a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b); });
    return order.map(function (k) { return { name: k, items: map[k] }; });
  }
  function find(l, q) { q = q.trim().toLowerCase(); return l.filter(function (m) { return (m.name + ' ' + (m.label || '')).toLowerCase().indexOf(q) >= 0; }); }
  function all() { try { return JSON.parse(localStorage.getItem(RKEY) || '{}') || {}; } catch (e) { return {}; } }
  function recent(p) { return (all()[p] || []).slice(0, 3); }
  function remember(p, n) { var a = all(), l = (a[p] || []).filter(function (x) { return x !== n; }); l.unshift(n); a[p] = l.slice(0, 3); try { localStorage.setItem(RKEY, JSON.stringify(a)); } catch (e) {} }
  return { chatOnly: chatOnly, groups: groups, find: find, recent: recent, remember: remember, keyOf: keyOf };
})();
