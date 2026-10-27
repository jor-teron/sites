/* Agent — app/gui/model.js: model chip + picker (HR6 list via adapter.models(); AG5 per-chat). HR.model.
   Top-bar chip "Provider · model" (#modelChip). Tap -> picker dialog (#pick): provider buttons, big model rows, ↻ reload,
   "Make default for new chats". A pick is for the open chat only (HR.models.setChat + HR.chats.picked -> chat index);
   the Settings default (provider + model_<provider>) is used for new chats. A model typed in Settings is added on top
   and wins when the list can't be fetched. Unreachable / no key -> AG2: Browser for this session (fall(e)); empty /
   other errors -> error card. Browser provider -> HR.bcard.check() shows the download card until the model is cached.
   List rows may carry ctx (context window, AG5 token meter). */
HR.model = (function () {
  var chip, dlg, listEl, models = [], cur = '', state = 'loading', $ = function (id) { return document.getElementById(id); };
  function label(p) { var a = HR.models.all().filter(function (x) { return x.id === p; })[0]; return a ? a.label : p; }
  function short(p) { return { ollama: 'Ollama', openai: 'OpenAI', gemini: 'Gemini', browser: 'Browser' }[p] || label(p); }
  function paintChip() {
    var p = HR.models.id(), t = state === 'loading' ? 'Loading…' : state === 'nokey' ? 'Add API key ⚙' : state === 'empty' ? 'No models' : state === 'off' ? 'offline' : cur;
    chip.textContent = short(p) + ' · ' + t; chip.title = 'Model for this chat: ' + label(p) + ' · ' + t + ' (tap to change)';
    chip.classList.toggle('warn', state !== 'ok' && state !== 'loading');
    if (HR.meter) HR.meter.update();
  }
  function drawList() {
    if (!dlg || !dlg.open) return;
    var ps = $('pickProv'); ps.innerHTML = '';
    HR.models.all().forEach(function (a) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'hb'; b.textContent = short(a.id); b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', HR.models.id() === a.id ? 'true' : 'false');
      b.onclick = function () { HR.models.setChat(a.id, ''); HR.chats.picked(); load(); drawList(); };
      ps.appendChild(b);
    });
    listEl.innerHTML = '';
    if (!models.length) { var n = document.createElement('p'); n.className = 'hint'; n.textContent = state === 'loading' ? 'Loading models…' : state === 'nokey' ? 'Add an API key in Settings ⚙ → Provider.' : 'No models from ' + label(HR.models.id()) + '. Tap ↻ to retry.'; listEl.appendChild(n); }
    models.forEach(function (m) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'pk-row' + (m.name === cur ? ' on' : ''); b.textContent = m.label || m.name;
      b.onclick = function () { cur = m.name; HR.models.setChat(HR.models.id(), m.name); HR.chats.picked(); paintChip(); dlg.close(); };
      listEl.appendChild(b);
    });
  }
  function fill(l, want) { models = l; cur = l.length ? (l.some(function (m) { return m.name === want; }) ? want : l[0].name) : ''; state = l.length ? 'ok' : 'empty'; paintChip(); drawList(); }
  /* chosen provider unusable -> Browser for now; true when it took over */
  function fall(e) {
    if (!e || (e.kind !== 'unreachable' && e.kind !== 'nokey') || HR.models.id() === 'browser' || !HR.models.fallback(true)) return false;
    var p = HR.models.chosen(), t = e.kind === 'nokey' ? '🔑 ' + label(p) + ' has no API key — using the Browser model for now. Add the key in Settings ⚙.'
      : '🔌 ' + label(p) + ' isn\'t reachable (' + HR.models.base(p) + ') — using the Browser model for now. ↻ tries ' + label(p) + ' again.';
    HR.chat.clearErrors(); [].forEach.call(document.querySelectorAll('#log .note.fb'), function (n) { n.remove(); });
    HR.view.note(t, 'fb'); HR.steps.note(t);
    load(true); return true;
  }
  function load(keep) {
    if (keep !== true) HR.models.fallback(false);
    var a = HR.models.current(), c = HR.models.cfg(), want = HR.models.chatModel() || c.typed || HR.set.get(HR.models.modelKey());
    models = []; cur = ''; state = 'loading'; paintChip(); drawList();
    if (a.id !== 'browser' && HR.bcard) HR.bcard.hide();
    if (a.needsKey && !c.key) { if (fall({ kind: 'nokey' })) return Promise.resolve(); fill([]); state = 'nokey'; paintChip(); HR.chat.errorCard({ kind: 'nokey' }); return Promise.resolve(); }
    function typed(l) { return c.typed && !l.some(function (m) { return m.name === c.typed; }) ? [{ name: c.typed, label: c.typed + ' (typed)' }].concat(l) : l; }
    return a.models(c).then(function (l) {
      l = typed(l); fill(l, want);
      if (!l.length) { HR.chat.errorCard({ kind: 'empty' }); return; }
      HR.chat.clearErrors();
      if (a.id === 'browser' && HR.bcard) HR.bcard.check();
    }, function (e) {
      if (c.typed) { fill(typed([]), want); HR.chat.clearErrors(); return; }
      if (fall(e)) return;
      fill([]); state = 'off'; paintChip(); HR.chat.errorCard(e);
    });
  }
  function makeDefault() {
    var p = HR.models.id(); if (!cur || HR.models.fallen()) return;
    HR.set.put('provider', p); HR.set.put(HR.models.modelKey(), cur);
    HR.chat.note('Default for new chats: ' + label(p) + ' · ' + cur); dlg.close();
  }
  function init() {
    chip = $('modelChip'); dlg = $('pick'); listEl = $('pickList');
    chip.onclick = function () { dlg.showModal(); drawList(); };
    $('btnModels').onclick = function () { load(); };
    $('pickClose').onclick = function () { dlg.close(); };
    $('pickDef').onclick = makeDefault;
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    load();
  }
  function current() { return state === 'ok' ? cur : ''; }
  function info() { var n = cur; return models.filter(function (m) { return m.name === n; })[0] || null; }
  return { init: init, load: load, fall: fall, current: current, info: info, list: function () { return models; } };
})();
