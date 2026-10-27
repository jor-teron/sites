/* Agent — app/gui/hubrows.js: Settings rows that can use a Hub key (AG9). HR.hubRows.paint() after each Settings draw.
   Row = input id + Hub key name: Ollama base URL (ollama_url), OpenAI-compatible base (openai_base), provider API key
   (gemini / openai_key / groq / openrouter / deepseek / xai, from HR.hubKeys.forProvider), Tavily key (tavily).
   Hub key set -> the field is disabled and left empty (the Hub value is never shown or copied) and a line
   "From Hub ✓ · Change in Hub" appears; inside the Hub without that key -> "Not in Hub keys · Add in Hub" and the local
   field still works as the fallback. Standalone -> nothing extra. Hub changes repaint while Settings is open. */
HR.hubRows = (function () {
  function rows() {
    var p = HR.models.def(), b = HR.models.base(p);
    return [['setBase', 'ollama_url'], ['setOABase', HR.hubKeys.named(HR.set.get('openaiBase') || '') ? '' : 'openai_base'], ['setKey', p === 'ollama' || p === 'browser' ? '' : HR.hubKeys.forProvider(p, b)], ['setTavKey', 'tavily']];
  }
  function paint() {
    var inHub = HR.hubKeys.inHub();
    rows().forEach(function (r) {
      var i = document.getElementById(r[0]); if (!i) return;
      var tag = document.getElementById(r[0] + 'Hub'), n = r[1];
      if (!inHub || !n) { if (tag) tag.hidden = true; if (i.dataset.hub) { i.disabled = false; i.placeholder = i.dataset.ph || i.placeholder; delete i.dataset.hub; } return; }
      if (!tag) { tag = document.createElement('div'); tag.id = r[0] + 'Hub'; tag.className = 'hubrow'; i.insertAdjacentElement('afterend', tag); }
      tag.hidden = false; tag.innerHTML = '';
      var used = HR.hubKeys.has(n), t = document.createElement('span'), btn = document.createElement('button');
      t.textContent = used ? 'From Hub ✓ (' + n + ')' : 'Not in Hub keys (' + n + ') — using this field';
      t.className = used ? 'hub-ok' : 'hub-no';
      btn.type = 'button'; btn.className = 'hb wide hub-open'; btn.textContent = used ? 'Change in Hub' : 'Add in Hub';
      btn.onclick = function () { HR.hubKeys.open(n); };
      tag.append(t, btn);
      if (!i.dataset.hub) i.dataset.ph = i.placeholder;
      if (used) { i.dataset.hub = '1'; i.disabled = true; i.value = ''; i.placeholder = 'Using the Hub value (Settings → API Keys)'; }
      else if (i.dataset.hub) { i.disabled = false; i.placeholder = i.dataset.ph; delete i.dataset.hub; }
    });
  }
  function init() {
    HR.hubKeys.onChange(function (n) {
      var d = document.getElementById('settings'); if (d && d.open) { HR.set.redraw(); HR.provider.draw(); paint(); }
      if (n !== 'tavily') HR.model.load();
    });
  }
  return { init: init, paint: paint };
})();
