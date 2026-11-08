/* Agent — app/gui/assistset.js: Settings › Model rows for AG31. HR.assistSet.
   Answer length: Short | Normal | Detailed (agent.settings.answerLength, used by core/length.js).
   Assist model: a provider dropdown (Off + set-up providers from HR.assist.choices()) and a model dropdown filled from that
   provider's model list (typed name kept if the list can't load). Saves assistProvider / assistModel only; never changes the
   main provider or model. Off clears nothing else. Separate from the ⌨️ Helper card (bash on your computer). */
HR.assistSet = (function () {
  var loadId = 0;
  function $(id) { return document.getElementById(id); }
  function seg() {
    var box = $('setLen'); if (!box) return; box.innerHTML = '';
    HR.length.OPTS.forEach(function (o) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'hb'; b.textContent = o[1]; b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', HR.length.get() === o[0] ? 'true' : 'false');
      b.onclick = function () { HR.set.put('answerLength', o[0]); seg(); };
      box.appendChild(b);
    });
  }
  function opt(sel, v, t) { var o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); return o; }
  function fillModels() {
    var p = HR.set.get('assistProvider') || '', ms = $('setAsModel'), cur = (HR.set.get('assistModel') || '').trim(), my = ++loadId;
    ms.innerHTML = ''; ms.hidden = !p; $('asStat').textContent = '';
    if (!p) return;
    opt(ms, '', cur ? cur : 'Loading models…').value = cur;
    HR.assist.models(p).then(function (list) {
      if (my !== loadId) return; ms.innerHTML = ''; opt(ms, '', '— choose a model —');
      var names = (list || []).map(function (m) { return m.name || m; });
      if (cur && names.indexOf(cur) < 0) names.unshift(cur);
      names.forEach(function (n) { opt(ms, n, n); }); ms.value = cur;
    }, function (e) {
      if (my !== loadId) return; ms.innerHTML = ''; opt(ms, cur, cur || '— no models —');
      $('asStat').textContent = 'Couldn\'t load models: ' + (e && e.message || e);
    });
  }
  function draw() {
    seg();
    var ps = $('setAsProv'); if (!ps) return; ps.innerHTML = ''; opt(ps, '', 'Off');
    var p = HR.set.get('assistProvider') || '', list = HR.assist.choices();
    list.forEach(function (a) { opt(ps, a.id, a.label); });
    if (p && !list.some(function (a) { return a.id === p; })) opt(ps, p, p + ' (not set up)');
    ps.value = p; fillModels();
  }
  function init() {
    var ps = $('setAsProv'), ms = $('setAsModel'); if (!ps) return;
    ps.onchange = function () { HR.set.put('assistProvider', ps.value); HR.set.put('assistModel', ''); fillModels(); };
    ms.onchange = function () { HR.set.put('assistModel', ms.value); };
    $('btnSet').addEventListener('click', draw);
  }
  return { init: init, draw: draw };
})();
