/* Agent — app/gui/modelbar.js: AG18 Provider + Model dropdowns in the top row. HR.modelbar.
   #barProv: ready providers (HR.models.all() + HR.models.ready, same rules as the picker tabs; the one in use always).
   #barModel: that provider's chat models from HR.model.list() (already chat-only, no extra fetch) — optgroup '🕘 Recent'
   (HR.pickGroups.recent) first, then HR.pickGroups.groups; 'Loading…' / 'Can’t load models' / 'Add an API key' as a disabled
   option while HR.model's own cards explain the error. Changing Provider -> HR.model.pickProvider (loads, picks its
   remembered model); changing Model -> HR.model.pickModel (same as a tap in the dialog, updates Recent). 🔍 (#btnPick)
   opens the old picker dialog with search; both stay in sync through HR.model.onChange.
   AG21: ☆/★ (#barFav) stars the current model per provider (setting `chatFav_<id>`, same shape as the Image page's
   `imageFav_<id>`); '⭐ Favourites' optgroup first, then Recent and the groups without the starred ones repeated in Recent. */
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
      opt(ms, '', t, true).selected = true; ms.disabled = st === 'loading'; ms.title = t; favUi(); return;
    }
    ms.disabled = false;
    var G = HR.pickGroups, by = {}; l.forEach(function (m) { by[m.name] = m; });
    var fv = favs(id).filter(function (n) { return by[n]; }), rec = G.recent(id).filter(function (n) { return by[n] && fv.indexOf(n) < 0; });
    var grp = function (name, items) { var g = document.createElement('optgroup'); g.label = name; items.forEach(function (m) { opt(g, m.name, m.label || m.name); }); ms.appendChild(g); };
    if (fv.length) grp('⭐ Favourites', fv.map(function (n) { return by[n]; }));
    if (rec.length) grp('🕘 Recent', rec.map(function (n) { return by[n]; }));
    G.groups(id, l).forEach(function (g) { if (g.name || rec.length || fv.length) grp(g.name || 'All models', g.items); else g.items.forEach(function (m) { opt(ms, m.name, m.label || m.name); }); });
    ms.value = cur; ms.title = 'Model: ' + cur; favUi();
  }
  /* AG21: favourites */
  function favs(id) { var l = HR.set.get('chatFav_' + id); return Array.isArray(l) ? l : []; }
  function favUi() { var b = $('barFav'); if (!b) return; var m = ms.value, on = !!m && favs(HR.models.id()).indexOf(m) >= 0, t = on ? 'Remove from favourites' : 'Add to favourites';
    b.textContent = on ? '★' : '☆'; b.title = t; b.setAttribute('aria-label', t); b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.disabled = !m || ms.disabled; }
  function star() { var m = ms.value; if (!m) return; var id = HR.models.id(), l = favs(id), k = l.indexOf(m); if (k >= 0) l.splice(k, 1); else l.push(m); HR.set.put('chatFav_' + id, l); paint(); }
  function init() {
    ps = $('barProv'); ms = $('barModel');
    ps.onchange = function () { HR.model.pickProvider(ps.value); };
    ms.onchange = function () { if (ms.value) HR.model.pickModel(ms.value); };
    if ($('barFav')) $('barFav').onclick = star;
    $('btnPick').onclick = function () { HR.model.openPicker(); };
    HR.model.onChange(paint); if (HR.hubKeys) HR.hubKeys.onChange(paint); paint();
  }
  return { init: init, paint: paint };
})();
