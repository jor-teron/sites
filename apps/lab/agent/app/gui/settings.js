/* Agent — app/gui/settings.js: settings in localStorage 'agent.settings' and the Settings dialog.
   theme 'dark' (default) | 'light' | 'system' (follows the Hub's Dark / Light live via shared/theme/hub_theme.js);
   written as html[data-ht] so hub_theme.js (class / data-theme / color-scheme) never fights it; Hub accent used when set.
   baseUrl (default http://localhost:11434), model (last picked), think 'auto' | 'on' | 'off' (Ollama "think" field),
   tools 'on' (default) | 'off' (HR2: offer tools to the model), maxSteps 1–30 model calls per turn (default 8),
   saveChats 'on' (default) | 'off' (HR4: daily Markdown logs in the folder),
   helper 'off' (default) | 'on', helperUrl, helperToken (HR5 bash helper; see app/gui/helperset.js),
   provider 'ollama' (default) | 'openai' | 'gemini', openaiBase, openaiModel / geminiModel, model_<provider> (HR6, app/gui/provider.js). */
HR.set = (function () {
  var KEY = 'agent.settings', DEF = { theme: 'dark', baseUrl: 'http://localhost:11434', model: '', think: 'auto', tools: 'on', maxSteps: 8, saveChats: 'on', helper: 'off', helperUrl: 'http://127.0.0.1:11500', helperToken: '', provider: 'ollama', openaiBase: 'https://api.openai.com/v1' };
  function all() { var s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { s = {}; } return Object.assign({}, DEF, s); }
  function get(k) { return all()[k]; }
  function put(k, v) { var s = all(); s[k] = v; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* memory only */ } }
  function eff() { var t = get('theme'); return t === 'system' ? (window.HubTheme ? HubTheme.hub() : 'dark') : (t === 'light' ? 'light' : 'dark'); }
  function applyTheme() {
    var t = eff(); document.documentElement.dataset.ht = t;
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = t === 'light' ? '#f4f5f8' : '#111318';
  }
  if (window.HubTheme) HubTheme.onChange(applyTheme);
  function seg(id, key, opts, after) {
    var box = document.getElementById(id); box.innerHTML = '';
    opts.forEach(function (o) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'hb'; b.textContent = o[1]; b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', get(key) === o[0] ? 'true' : 'false');
      b.onclick = function () { put(key, o[0]); seg(id, key, opts, after); if (after) after(); };
      box.appendChild(b);
    });
  }
  function draw() {
    seg('setProv', 'provider', [['ollama', 'Ollama'], ['openai', 'OpenAI-compatible'], ['gemini', 'Gemini']], function () { HR.provider.changed(); });
    seg('setTheme', 'theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], applyTheme);
    seg('setThink', 'think', [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']]);
    seg('setTools', 'tools', [['on', 'On'], ['off', 'Off']]);
    seg('setSave', 'saveChats', [['on', 'On'], ['off', 'Off']]);
    seg('setHelper', 'helper', [['on', 'On'], ['off', 'Off']], function () { HR.helper.test(); });
    document.getElementById('setSteps').value = maxSteps();
    var u = document.getElementById('setBase'); u.value = get('baseUrl');
    document.getElementById('setOrigin').textContent = location.origin === 'null' ? 'file:// (use "*" or serve over http)' : location.origin;
  }
  function maxSteps() { var v = parseInt(get('maxSteps'), 10); return Math.max(1, Math.min(30, isNaN(v) ? 8 : v)); }
  function init() {
    var st = document.getElementById('setSteps');
    st.addEventListener('change', function () { put('maxSteps', Math.max(1, Math.min(30, parseInt(st.value, 10) || 8))); st.value = maxSteps(); });
    var dlg = document.getElementById('settings'), u = document.getElementById('setBase');
    document.getElementById('btnSet').onclick = function () { draw(); dlg.showModal(); };
    document.getElementById('setClose').onclick = function () { dlg.close(); };
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', function () {
      var v = u.value.trim().replace(/\/+$/, '') || DEF.baseUrl; if (!/^https?:\/\//.test(v)) v = 'http://' + v;
      if (v !== get('baseUrl')) { put('baseUrl', v); HR.model.load(); }
    });
  }
  return { get: get, put: put, redraw: draw, maxSteps: maxSteps, applyTheme: applyTheme, init: init };
})();
