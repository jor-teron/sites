/* Agent — app/gui/meter.js: token / context meter above the composer (AG5). HR.meter.update(), HR.meter.sys (system prompt chars).
   Used = the last model call's real counts (prompt_eval_count + eval_count from Ollama, OpenAI usage, Gemini usageMetadata;
   kept on the assistant message as usage {p, o}) plus ~chars/4 of anything added after it; with no real counts the whole
   history (+ system prompt) is estimated as chars/4 and shown with "≈". Max = the model's context from the provider
   (Ollama /api/show context_length, Gemini inputTokenLimit, OpenRouter / Groq context_length / context_window), else
   Settings → Context size (default 8192). Amber from 75 %, red from 90 % with a "start a new chat" hint (tap = ＋ New chat).
   Settings → Display → Token meter (default On). */
HR.meter = (function () {
  var box, fill, text, ctx = {}, asking = {};
  function k(n) { return n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n); }
  function chars(m) { return (m.content || '').length + (m.tool_calls ? JSON.stringify(m.tool_calls).length : 0); }
  function used() {
    var l = HR.msgs.all().filter(function (m) { return !m.error; }), i, after = 0;
    for (i = l.length - 1; i >= 0; i--) { var m = l[i]; if (m.role === 'assistant' && m.usage && m.usage.p) return { n: m.usage.p + (m.usage.o || 0) + Math.ceil(after / 4), real: true }; after += chars(m); }
    var n = HR.msgs.toApi().reduce(function (s, m) { return s + chars(m); }, 0) + (api.sys || 0);
    return { n: Math.ceil(n / 4), real: false };
  }
  function max() {
    var p = HR.models.id(), m = HR.model.current(), info = HR.model.info(), key = p + '|' + HR.models.base() + '|' + m;
    if (info && info.ctx) return info.ctx;
    if (ctx[key]) return ctx[key];
    if (p === 'ollama' && m && !asking[key]) {
      asking[key] = 1;
      HR.ollama.ctx(HR.models.base(), m).then(function (n) { if (n) { ctx[key] = n; update(); } }, function () {});
    }
    return HR.set.ctxMax();
  }
  function update() {
    if (!box) return;
    var on = HR.set.get('tokenMeter') !== 'off' && !!HR.model.current() && HR.msgs.all().length > 0;
    box.hidden = !on; if (!on) return;
    var u = used(), mx = max(), pct = Math.min(100, Math.round(u.n / mx * 100));
    fill.style.width = pct + '%';
    box.classList.toggle('amber', pct >= 75 && pct < 90); box.classList.toggle('red', pct >= 90);
    text.textContent = (u.real ? '' : '≈') + k(u.n) + ' / ' + k(mx) + ' tokens · ' + pct + '%' + (pct >= 90 ? ' · nearly full — tap to start a new chat' : pct >= 75 ? ' · getting long — consider a new chat' : '');
    box.title = (u.real ? 'Counted by the provider' : 'Estimated as characters / 4') + '; context ' + mx + ' tokens';
  }
  function init() {
    box = document.getElementById('meter'); fill = document.getElementById('meterFill'); text = document.getElementById('meterText');
    box.onclick = function () { if (box.classList.contains('red') || box.classList.contains('amber')) HR.chats.newChat(); };
    update();
  }
  var api = { init: init, update: update, sys: 0 };
  return api;
})();
