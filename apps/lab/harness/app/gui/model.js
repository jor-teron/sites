/* Harness — app/gui/model.js: model picker. load() lists models from <baseUrl>/api/tags into #model,
   keeps the saved choice (else the first model), ↻ reloads. Unreachable / empty -> error card in the chat. */
HR.model = (function () {
  var sel, models = [];
  function gb(n) { return n ? (n / 1073741824).toFixed(n < 1073741824 * 10 ? 1 : 0) + ' GB' : ''; }
  function load() {
    sel.innerHTML = '<option value="">Loading models…</option>'; sel.disabled = true;
    var base = HR.set.get('baseUrl');
    return HR.ollama.tags(base).then(function (l) {
      models = l; sel.innerHTML = ''; sel.disabled = !l.length;
      if (!l.length) { sel.innerHTML = '<option value="">No models</option>'; HR.chat.errorCard({ kind: 'empty' }); return; }
      l.forEach(function (m) {
        var o = document.createElement('option'); o.value = m.name;
        o.textContent = m.name + (m.details.parameter_size ? ' · ' + m.details.parameter_size : '') + (m.size ? ' · ' + gb(m.size) : '');
        sel.appendChild(o);
      });
      var want = HR.set.get('model'); sel.value = l.some(function (m) { return m.name === want; }) ? want : l[0].name;
      HR.set.put('model', sel.value); HR.chat.clearErrors();
    }, function (e) {
      models = []; sel.innerHTML = '<option value="">Ollama offline</option>'; sel.disabled = true;
      HR.chat.errorCard(e);
    });
  }
  function init() {
    sel = document.getElementById('model');
    sel.onchange = function () { HR.set.put('model', sel.value); };
    document.getElementById('btnModels').onclick = load;
    load();
  }
  function current() { return sel && !sel.disabled ? sel.value : ''; }
  return { init: init, load: load, current: current, list: function () { return models; } };
})();
