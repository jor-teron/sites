/* Agent — app/gui/settings.js: settings in localStorage 'agent.settings' and the Settings dialog.
   theme 'dark' (default) | 'light' | 'system' (follows the Hub's Dark / Light live via shared/theme/hub_theme.js);
   written as html[data-ht] so hub_theme.js (class / data-theme / color-scheme) never fights it; Hub accent used when set.
   baseUrl (default http://localhost:11434), model (last picked), think 'auto' | 'on' | 'off' (Ollama "think" field),
   tools 'on' (default) | 'off' (HR2: offer tools to the model), maxSteps a nonnegative safe whole number of model calls per turn (default 8; 0 = unlimited),
   saveChats 'on' (default) | 'off' (HR4: daily Markdown logs in the folder),
   helper 'off' (default) | 'on', helperUrl, helperToken (HR5 bash helper; see app/gui/helperset.js),
   provider 'ollama' (default) | 'openai' | 'gemini' | 'browser', openaiBase, openaiModel / geminiModel, model_<provider> (HR6, app/gui/provider.js),
   browserModel '' | 'ready' (AG2: Story Mini downloaded, app/models/browser.js).
   AG3 Permissions (app/core/perms.js): autoWrite / autoShell 'off' (default), allowWrite / allowShell / memory 'on' (default).
   AG3 Display: showThink, showSteps, notifyLong 'on' (default); applyDisplay() sets body.no-think / body.no-steps.
   AG5 Display: tokenMeter 'on' (default), ctxMax (context size fallback when the provider doesn't report one).
   AG28: ctxMax default is 128000 only when agent.settings has no ctxMax; a saved ctxMax is kept. Step limit no longer
   clamps to 1–30: 0, 99, 999 and any other safe whole number are stored as typed. Negative, fractional, NaN and
   unsafe values are rejected and the previous saved step limit stays.
   AG7: liveShell 'off' (default; 'on' streams run_shell output via the helper's /run_stream, Stop kills the command),
   AG6 Web: allowWeb 'on' (default; tools still hidden until tavilyKey is set), tavilyKey (localStorage only), webDepth 'basic' | 'advanced'.
   AG9: thinkLive 'on' (default; Thinking box open while thinking streams, folds when the answer starts); showSteps now
   defaults 'off' (only for people with no saved choice — saved values always win via all()).
   AG10: Settings = collapsible cards (Model, Folder & Memory, Permissions, Web, Helper, Display, Usage, Advanced; last open
   card remembered in 'agent.setCard'); on/off settings are big switches (sw()); same keys as before, nothing renamed.
   AG30: the Usage card is not in this dialog anymore (usage.html). agent.setCard and every other card are unchanged.
   If the remembered card was sc_usage, no card has that id, so the dialog keeps the card marked open in the page.
   AG12: provider also 'groq' | 'openrouter' | 'xai' | 'deepseek' | 'deepinfra' | 'custom' ('openai' = api.openai.com now), customBase
   (Custom tab base URL), <id>Model / model_<id> per tab.
   prices {'provider|model': {in, out}} $ per 1M tokens (Usage page, app/gui/usageview.js).
   AG30 Legacy: those price fields were edited in Settings → Usage. The key and the {in, out} shape are the same. */
HR.set = (function () {
  var KEY = 'agent.settings', DEF = { theme: 'dark', baseUrl: 'http://localhost:11434', model: '', think: 'auto', tools: 'on', maxSteps: 8, saveChats: 'on', helper: 'off', helperUrl: 'http://127.0.0.1:11500', helperToken: '', provider: 'ollama', openaiBase: 'https://api.openai.com/v1', customBase: '', browserModel: '',
    autoWrite: 'off', autoShell: 'off', allowWrite: 'on', allowShell: 'on', memory: 'on', showThink: 'on', showSteps: 'off', thinkLive: 'on', notifyLong: 'on', tokenMeter: 'on', ctxMax: 128000, liveShell: 'off', prices: {}, allowWeb: 'on', tavilyKey: '', webDepth: 'basic',
    answerLength: 'normal', assistProvider: '', assistModel: '',
    semProvider: '', semModel: '', semDocPrefix: '', semQueryPrefix: '', consolidate: 'off' };   /* AG36: core/consolidate.js, opt-in */   /* AG34: core/semantic.js */   /* AG31: core/length.js, core/assist.js */
  /* AG28 Legacy: ctxMax default was 8192. maxSteps default stays 8. A stored ctxMax (including an older 8192) still wins. */
  function all() { var s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { s = {}; } return Object.assign({}, DEF, s); }
  function get(k) { return all()[k]; }
  function put(k, v) { var s = all(); s[k] = v; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* memory only */ } }
  function eff() { var t = get('theme'); return t === 'system' ? (window.HubTheme ? HubTheme.hub() : 'dark') : (t === 'light' ? 'light' : 'dark'); }
  function applyTheme() {
    var t = eff(); document.documentElement.dataset.ht = t;
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = t === 'light' ? '#f4f5f8' : '#111318';
  }
  if (window.HubTheme) HubTheme.onChange(applyTheme);
  function applyDisplay() {
    var b = document.body; b.classList.toggle('no-think', get('showThink') === 'off'); b.classList.toggle('no-steps', get('showSteps') === 'off');
    var w = document.getElementById('autoShellWarn'); if (w) w.hidden = get('autoShell') !== 'on';
    if (HR.meter) HR.meter.update();
  }
  /* AG10: big on/off switch (role=switch) for every 'on' | 'off' setting */
  function sw(id, key, after) {
    var box = document.getElementById(id); if (!box) return; box.innerHTML = '';
    var on = get(key) === 'on', b = document.createElement('button'); b.type = 'button'; b.className = 'tg'; b.setAttribute('role', 'switch');
    b.setAttribute('aria-checked', String(on)); var lab = box.parentNode.querySelector('span'); if (lab && lab.firstChild) b.setAttribute('aria-label', lab.firstChild.textContent.trim());
    b.onclick = function () { put(key, on ? 'off' : 'on'); sw(id, key, after); if (after) after(); };
    box.appendChild(b);
  }
  /* AG10: collapsible cards; phone (<760px) keeps one open at a time */
  function cards() {
    var all = [].slice.call(document.querySelectorAll('#settings .scard'));
    all.forEach(function (d) { d.addEventListener('toggle', function () {
      if (d.open && !matchMedia('(min-width:760px)').matches) all.forEach(function (o) { if (o !== d) o.open = false; });
      try { localStorage.setItem('agent.setCard', d.open ? d.id : ''); } catch (e) {}
    }); });
    var last = localStorage.getItem('agent.setCard'); if (last && document.getElementById(last)) { all.forEach(function (o) { o.open = o.id === last; }); }
  }
  function modelNow() { var mn = document.getElementById('modelNow'), cur = HR.model.current(); if (mn) mn.textContent = cur ? '· ' + cur : '· none yet'; }
  function helperBox() { var h = document.getElementById('helperBox'); if (h) h.hidden = get('helper') !== 'on'; }
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
    seg('setProv', 'provider', HR.models.all().map(function (a) { return [a.id, a.label]; }),   /* AG12: every tab, in order */ function () { HR.provider.changed(); });
    seg('setTheme', 'theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], applyTheme);
    seg('setThink', 'think', [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']]);
    sw('setTools', 'tools');
    ['autoWrite', 'autoShell', 'allowWrite', 'allowShell', 'showThink', 'thinkLive', 'showSteps', 'notifyLong', 'tokenMeter', 'liveShell', 'allowWeb'].forEach(function (k) {
      sw('set_' + k, k, applyDisplay);
    });
    applyDisplay();
    sw('set_consolidate', 'consolidate', function () { if (HR.consol) { HR.consol.cancel(); if (HR.conView) HR.conView.paint(); } });   /* AG36 */
    sw('set_memory', 'memory', function () { applyDisplay(); if (HR.consol) HR.consol.cancel(); });
    seg('setWebDepth', 'webDepth', [['basic', 'Basic (1 credit)'], ['advanced', 'Advanced (2 credits)']]);
    document.getElementById('setTavKey').value = get('tavilyKey') || '';
    sw('setSave', 'saveChats');
    sw('setHelper', 'helper', function () { helperBox(); HR.helper.test(); }); helperBox();
    modelNow();
    document.getElementById('setSteps').value = maxSteps(); document.getElementById('setCtx').value = ctxMax();
    var u = document.getElementById('setBase'); u.value = get('baseUrl');
    if (HR.hubRows) HR.hubRows.paint();   /* AG9 */
    document.getElementById('setOrigin').textContent = location.origin === 'null' ? 'file:// (use "*" or serve over http)' : location.origin;
  }
  function ctxMax() { var v = parseInt(get('ctxMax'), 10); return Math.max(512, Math.min(2000000, isNaN(v) ? 128000 : v)); }
  /* AG28: finite nonnegative safe whole numbers. 0 is unlimited and must not fall through to the default. */
  function whole(v) {
    if (typeof v === 'string') { if (!/^(0|[1-9]\d*)$/.test(v.trim())) return null; v = Number(v.trim()); }
    if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isSafeInteger(v) || v < 0) return null;
    return v === 0 ? 0 : v;
  }
  /* AG28 Legacy: function maxSteps() { var v = parseInt(get('maxSteps'), 10); return Math.max(1, Math.min(30, isNaN(v) ? 8 : v)); } */
  function maxSteps() { var v = whole(get('maxSteps')); return v == null ? 8 : v; }
  function init() {
    var st = document.getElementById('setSteps');
    st.addEventListener('change', function () {
      /* AG28 Legacy: put('maxSteps', Math.max(1, Math.min(30, parseInt(st.value, 10) || 8))); st.value = maxSteps(); */
      var v = whole(st.value); if (v == null) { st.value = maxSteps(); return; }
      put('maxSteps', v); st.value = maxSteps();
    });
    var tk = document.getElementById('setTavKey');
    tk.addEventListener('change', function () { put('tavilyKey', tk.value.trim()); });
    var cx = document.getElementById('setCtx');
    /* AG28 Legacy: put('ctxMax', Math.max(512, Math.min(2000000, parseInt(cx.value, 10) || 8192))); */
    cx.addEventListener('change', function () { put('ctxMax', Math.max(512, Math.min(2000000, parseInt(cx.value, 10) || 128000))); cx.value = ctxMax(); applyDisplay(); });
    var dlg = document.getElementById('settings'), u = document.getElementById('setBase');
    document.getElementById('btnSet').onclick = function () { draw(); dlg.showModal(); };
    cards(); document.getElementById('btnModelPick').onclick = function () { document.getElementById('modelChip').click(); };
    new MutationObserver(modelNow).observe(document.getElementById('modelChip'), { childList: true, subtree: true, characterData: true });
    document.getElementById('setClose').onclick = function () { dlg.close(); };
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', function () {
      if (u.disabled || u.hidden) return;   /* AG9/AG10: Hub keys in use, field hidden */
      var v = u.value.trim().replace(/\/+$/, '') || DEF.baseUrl; if (!/^https?:\/\//.test(v)) v = 'http://' + v;
      if (v !== get('baseUrl')) { put('baseUrl', v); HR.model.load(); }
    });
  }
  return { get: get, put: put, redraw: draw, maxSteps: maxSteps, ctxMax: ctxMax, applyTheme: applyTheme, applyDisplay: applyDisplay, init: init };
})();
