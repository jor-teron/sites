/* Agent — app/gui/provider.js: Settings → Provider (HR6). Ollama (default) | OpenAI-compatible | Gemini.
   OpenAI-compatible: base URL (presets OpenAI / Groq / OpenRouter), API key, optional model name. Gemini: API key, model.
   Keys live in localStorage 'agent.keys' per host (this device only; sent only to that provider). Changes reload models. */
HR.provider = (function () {
  var PRE = [['OpenAI', 'https://api.openai.com/v1', 'gpt-4o-mini'], ['Groq', 'https://api.groq.com/openai/v1', 'llama-3.3-70b-versatile'],
    ['OpenRouter', 'https://openrouter.ai/api/v1', 'openai/gpt-4o-mini']];
  var dirty = false, $ = function (id) { return document.getElementById(id); };
  function host(b) { try { return new URL(b).host; } catch (e) { return b; } }
  function draw() {
    var p = HR.models.id(), on = p !== 'ollama', b = HR.models.base(p);
    $('provOllama').hidden = on; $('provOnline').hidden = !on;
    $('provOA').hidden = p !== 'openai';
    if (!on) return;
    $('setOABase').value = HR.set.get('openaiBase') || PRE[0][1];
    $('setKey').value = HR.models.getKey(p, b);
    $('setModelName').value = HR.set.get(p + 'Model') || '';
    $('setModelName').placeholder = 'Model (optional, else pick from the list) e.g. ' + (p === 'gemini' ? 'gemini-2.5-flash' : (PRE.filter(function (x) { return x[1] === b; })[0] || PRE[0])[2]);
    $('keyNote').textContent = '🔒 Your API key is stored only in this browser on this device (localStorage) and is sent only to ' + host(b) + '. Clear the field to remove it.';
  }
  function saveBase(v) { v = String(v || '').trim().replace(/\/+$/, '') || PRE[0][1]; if (!/^https?:\/\//.test(v)) v = 'https://' + v; if (v !== HR.set.get('openaiBase')) { HR.set.put('openaiBase', v); dirty = true; } }
  function init() {
    var box = $('provPresets');
    PRE.forEach(function (x) { var b = document.createElement('button'); b.type = 'button'; b.className = 'hb wide'; b.textContent = x[0];
      b.onclick = function () { saveBase(x[1]); draw(); }; box.appendChild(b); });
    $('setOABase').addEventListener('change', function () { saveBase(this.value); draw(); });
    $('setKey').addEventListener('change', function () { var p = HR.models.id(); HR.models.setKey(p, HR.models.base(p), this.value.trim()); dirty = true; });
    $('setModelName').addEventListener('change', function () { HR.set.put(HR.models.id() + 'Model', this.value.trim()); dirty = true; });
    $('btnSet').addEventListener('click', draw);
    $('settings').addEventListener('close', function () { if (dirty) { dirty = false; HR.model.load(); } });
  }
  return { init: init, draw: draw, changed: function () { draw(); HR.model.load(); } };
})();
