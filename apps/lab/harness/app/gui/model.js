/* Harness — app/gui/model.js: model picker for the current provider (HR6: via HR.models adapter.models()).
   Keeps the saved choice per provider (else the first model); a model typed in Settings is added on top and wins when the
   list can't be fetched. ↻ reloads. Unreachable / no key / empty -> error card in the chat. */
HR.model = (function () {
  var sel, models = [];
  function fill(l, want) {
    models = l; sel.innerHTML = ''; sel.disabled = !l.length;
    l.forEach(function (m) { var o = document.createElement('option'); o.value = m.name; o.textContent = m.label || m.name; sel.appendChild(o); });
    if (l.length) { sel.value = l.some(function (m) { return m.name === want; }) ? want : l[0].name; HR.set.put(HR.models.modelKey(), sel.value); }
  }
  function load() {
    var a = HR.models.current(), c = HR.models.cfg(), want = c.typed || HR.set.get(HR.models.modelKey());
    sel.innerHTML = '<option value="">Loading models…</option>'; sel.disabled = true;
    if (a.needsKey && !c.key) { fill([]); sel.innerHTML = '<option value="">Add API key ⚙</option>'; HR.chat.errorCard({ kind: 'nokey' }); return Promise.resolve(); }
    function typed(l) { return c.typed && !l.some(function (m) { return m.name === c.typed; }) ? [{ name: c.typed, label: c.typed + ' (typed)' }].concat(l) : l; }
    return a.models(c).then(function (l) {
      l = typed(l); fill(l, want);
      if (!l.length) { sel.innerHTML = '<option value="">No models</option>'; HR.chat.errorCard({ kind: 'empty' }); return; }
      HR.chat.clearErrors();
    }, function (e) {
      if (c.typed) { fill(typed([]), want); HR.chat.clearErrors(); return; }
      fill([]); sel.innerHTML = '<option value="">' + a.label + ' offline</option>'; HR.chat.errorCard(e);
    });
  }
  function init() {
    sel = document.getElementById('model');
    sel.onchange = function () { HR.set.put(HR.models.modelKey(), sel.value); };
    document.getElementById('btnModels').onclick = load;
    load();
  }
  function current() { return sel && !sel.disabled ? sel.value : ''; }
  return { init: init, load: load, current: current, list: function () { return models; } };
})();
