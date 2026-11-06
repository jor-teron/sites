/* Agent — app/gui/provider.js: Settings → Provider (HR6). Ollama (default) | OpenAI-compatible | Gemini.
   OpenAI-compatible: base URL (presets OpenAI / Groq / OpenRouter), API key, optional model name. Gemini: API key, model.
   Keys live in localStorage 'agent.keys' per host (this device only; sent only to that provider). Changes reload models.
   AG2: Browser (built-in Story Mini, app/models/browser.js) has no fields here; its status / free-storage button are in app/gui/browsercard.js (Advanced).
   Panels follow the chosen provider, not a session fallback. AG5: this is the default for new chats (HR.models.def());
   changing it here also moves the open chat to it. AG9: rows using a Hub key show "From Hub ✓" (app/gui/hubrows.js).
   AG10: lives in the Settings → Model card; inside the Hub its key / base fields are hidden (one "Keys come from Hub" line).
   AG12: one tab per provider (app/models/presets.js); the base URL field only shows for Custom (setting customBase); the
   key field shows for every online tab, and inside the Hub too when that tab has no Hub key slot (DeepInfra). */
HR.provider = (function () {
  var dirty = false, $ = function (id) { return document.getElementById(id); };
  function draw() {
    var p = HR.models.def(), on = p !== 'ollama' && p !== 'browser', b = HR.models.base(p), pr = HR.presets.get(p);
    $('provOllama').hidden = p !== 'ollama'; $('provOnline').hidden = !on;
    $('provOA').hidden = p !== 'custom';
    if (!on) { HR.hubRows.paint(); return; }
    $('setOABase').value = HR.set.get('customBase') || '';
    $('setKey').value = b ? HR.models.localKey(p, b) : '';   /* AG9: never show a Hub key */
    $('setKey').placeholder = (pr ? pr.label : 'Gemini') + ' API key' + (p === 'custom' ? ' (if needed)' : '');
    $('setModelName').value = HR.set.get(p + 'Model') || '';
    $('setModelName').placeholder = 'Model (optional, else pick from the list) e.g. ' + (p === 'gemini' ? 'gemini-2.5-flash' : pr.eg);
    $('keyNote').textContent = '🔒 Your API key is stored only in this browser on this device (localStorage) and is sent only to ' + (HR.presets.host(b) || 'the base URL above') + '. Clear the field to remove it.';
    HR.hubRows.paint();
    if (p !== 'gemini' || !HR.models.hubName(p, b)) { $('setKey').hidden = false; $('keyNote').hidden = false; if (p === 'custom') $('setOABase').hidden = false; }   /* AG24: keep local image keys editable; svc credentials are never exposed. */
    if ((p === 'deepinfra' || p === 'openrouter') && HR.models.service(p, b)) $('keyNote').textContent += ' Chat uses the matching Hub provider. Images still need this Agent-local key: HubAPI has no image-generation method yet.';
  }
  function saveBase(v) { v = String(v || '').trim().replace(/\/+$/, ''); if (v && !/^https?:\/\//.test(v)) v = 'http://' + v; if (v !== HR.set.get('customBase')) { HR.set.put('customBase', v); dirty = true; } }
  function init() {
    $('setOABase').addEventListener('change', function () { saveBase(this.value); draw(); });
    $('setKey').addEventListener('change', function () { var p = HR.models.def(), b = HR.models.base(p); if (!b) return; HR.models.setKey(p, b, this.value.trim()); dirty = true; });
    $('setModelName').addEventListener('change', function () { HR.set.put(HR.models.def() + 'Model', this.value.trim()); dirty = true; });
    $('btnSet').addEventListener('click', draw);
    $('settings').addEventListener('close', function () { if (dirty) { dirty = false; HR.model.load(); } });
  }
  return { init: init, draw: draw, changed: function () { HR.models.setChat('', ''); if (HR.chats.picked) HR.chats.picked(); draw(); HR.model.load(); } };
})();
