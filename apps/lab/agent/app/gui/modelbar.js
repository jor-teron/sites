/* Agent — app/gui/modelbar.js: AG18 Provider + Model dropdowns in the top row. HR.modelbar.
   #barProv: ready providers (HR.models.all() + HR.models.ready, same rules as the picker tabs; the one in use always).
   #barModel: that provider's chat models from HR.model.list() (already chat-only, no extra fetch) — optgroup '🕘 Recent'
   (HR.pickGroups.recent) first, then HR.pickGroups.groups; 'Loading…' / 'Can’t load models' / 'Add an API key' as a disabled
   option while HR.model's own cards explain the error. Changing Provider -> HR.model.pickProvider (loads, picks its
   remembered model); changing Model -> HR.model.pickModel (same as a tap in the dialog, updates Recent). 🔍 (#btnPick)
   opens the old picker dialog with search; both stay in sync through HR.model.onChange. */
HR.modelbar = (function () {
  var ps, ms, $ = function (id) { return document.getElementById(id); };
  function opt(box, v, t, dis) { var o = document.createElement('option'); o.value = v; o.textContent = t; o.disabled = !!dis; box.appendChild(o); return o; }
  function paint() {
    var id = HR.models.id(); ps.innerHTML = '';
    HR.models.all().forEach(function (a) { if (HR.models.ready(a.id) || a.id === id) opt(ps, a.id, a.label); });
    ps.value = id; ps.title = 'Provider: ' + HR.model.label(id);
    var st = HR.model.state(), l = HR.model.list(), cur = HR.model.current(); ms.innerHTML = '';
    if (st !== 'ok' || !l.length) {
      var t = st === 'loading' ? 'Loading…' : st === 'nokey' ? 'Add an API key ⚙' : st === 'empty' ? 'No models' : 'Can’t load models';
      opt(ms, '', t, true).selected = true; ms.disabled = st === 'loading'; ms.title = t; return;
    }
    ms.disabled = false;
    var G = HR.pickGroups, by = {}; l.forEach(function (m) { by[m.name] = m; });
    var rec = G.recent(id).filter(function (n) { return by[n]; });
    var grp = function (name, items) { var g = document.createElement('optgroup'); g.label = name; items.forEach(function (m) { opt(g, m.name, m.label || m.name); }); ms.appendChild(g); };
    if (rec.length) grp('🕘 Recent', rec.map(function (n) { return by[n]; }));
    G.groups(id, l).forEach(function (g) { if (g.name || rec.length) grp(g.name || 'All models', g.items); else g.items.forEach(function (m) { opt(ms, m.name, m.label || m.name); }); });
    ms.value = cur; ms.title = 'Model: ' + cur;
  }
  function init() {
    ps = $('barProv'); ms = $('barModel');
    ps.onchange = function () { HR.model.pickProvider(ps.value); };
    ms.onchange = function () { if (ms.value) HR.model.pickModel(ms.value); };
    $('btnPick').onclick = function () { HR.model.openPicker(); };
    HR.model.onChange(paint); if (HR.hubKeys) HR.hubKeys.onChange(paint); paint();
  }
  return { init: init, paint: paint };
})();
