/* Agent — app/gui/model.js: model picker for the current provider (HR6: via HR.models adapter.models()).
   Keeps the saved choice per provider (else the first model); a model typed in Settings is added on top and wins when the
   list can't be fetched. ↻ reloads (and retries the chosen provider). Unreachable / no key -> AG2: fall back to the
   Browser provider for this session with a quiet note (fall(e)); empty / other errors -> error card in the chat.
   Browser provider -> HR.bcard.check() shows the tap-to-download card until the model is in the cache. */
HR.model = (function () {
  var sel, models = [];
  function fill(l, want) {
    models = l; sel.innerHTML = ''; sel.disabled = !l.length;
    l.forEach(function (m) { var o = document.createElement('option'); o.value = m.name; o.textContent = m.label || m.name; sel.appendChild(o); });
    if (l.length) { sel.value = l.some(function (m) { return m.name === want; }) ? want : l[0].name; HR.set.put(HR.models.modelKey(), sel.value); }
  }
  function label(p) { var a = HR.models.all().filter(function (x) { return x.id === p; })[0]; return a ? a.label : p; }
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
    var a = HR.models.current(), c = HR.models.cfg(), want = c.typed || HR.set.get(HR.models.modelKey());
    sel.innerHTML = '<option value="">Loading models…</option>'; sel.disabled = true;
    if (a.id !== 'browser' && HR.bcard) HR.bcard.hide();
    if (a.needsKey && !c.key) { if (fall({ kind: 'nokey' })) return Promise.resolve(); fill([]); sel.innerHTML = '<option value="">Add API key ⚙</option>'; HR.chat.errorCard({ kind: 'nokey' }); return Promise.resolve(); }
    function typed(l) { return c.typed && !l.some(function (m) { return m.name === c.typed; }) ? [{ name: c.typed, label: c.typed + ' (typed)' }].concat(l) : l; }
    return a.models(c).then(function (l) {
      l = typed(l); fill(l, want);
      if (!l.length) { sel.innerHTML = '<option value="">No models</option>'; HR.chat.errorCard({ kind: 'empty' }); return; }
      HR.chat.clearErrors();
      if (a.id === 'browser' && HR.bcard) HR.bcard.check();
    }, function (e) {
      if (c.typed) { fill(typed([]), want); HR.chat.clearErrors(); return; }
      if (fall(e)) return;
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
  return { init: init, load: load, fall: fall, current: current, list: function () { return models; } };
})();
