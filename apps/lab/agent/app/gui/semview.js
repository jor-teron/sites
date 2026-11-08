/* Agent — app/gui/semview.js: Settings › Folder & Memory › Semantic search (AG34). HR.semView.
   Provider dropdown (Off, Ollama, saved OpenAI-compatible Hub services), model dropdown from HubAPI.embeddingModels or a
   typed name (generic OpenAI-compatible services list nothing, so typing is normal there), optional document / query
   prefixes, status, Build / Rebuild (confirm: what is sent, to whom, may cost), Stop, Delete index (derived file only).
   Changing the choice stops a running build. File text is never put in HTML. */
HR.semView = (function () {
  function $(id) { return document.getElementById(id); }
  function opt(sel, v, t) { var o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); }
  var loadId = 0;
  function paint() {
    var s = HR.sem.state(), st = $('semStat'); if (!st) return;
    var t = !HR.fs.ready() ? 'Pick a folder first.' : !s.on ? 'Off: pick an embedding provider and model.' :
      !s.provOk ? 'This provider is not available in the Hub (removed, wrong type or no key); nothing will be sent.' : s.idx ? 'Index: ' + s.idx.n + ' pieces · ' + s.idx.fp.model + ' · ' + s.idx.fp.dims + ' dims · ' + s.idx.built + (s.idx.partial ? ' · PARTIAL (' + s.idx.partial.chunks + ' pieces, ' + s.idx.partial.files + ' files left out)' : '') + (s.usable ? ' · ready' : ' · needs Rebuild (provider setup, model or prefixes changed)') + ' (saved in the folder: ' + HR.sem.FILE + ')'
        : (s.err || 'No index yet.');
    st.textContent = (s.status ? s.status + ' ' : '') + t;
    $('btnSemBuild').textContent = s.idx ? 'Rebuild' : 'Build'; $('btnSemBuild').disabled = s.busy || !s.on || !HR.fs.ready();
    $('btnSemStop').hidden = !s.busy; $('btnSemReset').disabled = !s.idx || s.busy;
  }
  function fillModels() {
    var p = HR.set.get('semProvider') || '', dl = $('semModels'), my = ++loadId; dl.innerHTML = '';
    $('semModelRow').hidden = !p; $('semModel').value = HR.set.get('semModel') || '';
    if (!p) return;
    HR.sem.models(p).then(function (l) { if (my !== loadId) return; (l || []).forEach(function (m) { opt(dl, m.name, m.label || m.name); });
      $('semHint').textContent = (l && l.length) ? l.length + ' embedding model(s) found.' : 'No list from this provider: type the embedding model name.'; },
      function (e) { if (my === loadId) $('semHint').textContent = 'Couldn\'t list models: ' + e.message; });
  }
  function draw() {
    var ps = $('semProv'); if (!ps) return; ps.innerHTML = ''; opt(ps, '', 'Off');
    var cur = HR.set.get('semProvider') || '', l = HR.sem.providers();
    l.forEach(function (p) { opt(ps, p.id, p.label); });
    if (cur && !l.some(function (p) { return p.id === cur; })) opt(ps, cur, cur + ' (not available)');
    ps.value = cur; $('semDocPre').value = HR.set.get('semDocPrefix') || ''; $('semQPre').value = HR.set.get('semQueryPrefix') || '';
    fillModels(); HR.sem.load().then(paint);
  }
  async function build() {
    try {
      if (!HR.perms.memory()) { HR.sem.state(); $('semStat').textContent = 'Memory is Off.'; return; }
      var p = await HR.sem.plan(), c = HR.sem.state().conf;
      if (!p.chunks.length) { $('semStat').textContent = 'Nothing to index yet.'; return; }
      if (!confirm('Send ' + p.chunks.length + ' pieces (' + p.chars + ' characters) from ' + p.files + ' files — your user/assistant notes, topics and knowledge documents — to ' + c.provider + ' / ' + c.model + ' to make the index?\n\nThe provider sees this text and may charge for it. Session notes are not sent. Your files are not changed.')) return;
      await HR.sem.build(p);
    } catch (e) { paint(); if (!HR.sem.state().status) $('semStat').textContent = e.message; }
  }
  function init() {
    if (!$('semProv')) return;
    function put(k, v) { HR.sem.stop(); HR.set.put(k, v); paint(); }
    $('semProv').onchange = function () { put('semProvider', $('semProv').value); HR.set.put('semModel', ''); fillModels(); };
    $('semModel').onchange = function () { put('semModel', $('semModel').value.trim()); };
    $('semDocPre').onchange = function () { put('semDocPrefix', $('semDocPre').value); };
    $('semQPre').onchange = function () { put('semQueryPrefix', $('semQPre').value); };
    $('btnSemBuild').onclick = build; $('btnSemStop').onclick = function () { HR.sem.stop(); };
    $('btnSemReset').onclick = function () { if (confirm('Delete the semantic index? Only the derived index file is removed.')) HR.sem.reset(); };
    HR.sem.onChange(paint); $('btnSet').addEventListener('click', draw);
    HR.fs.onChange(function () { HR.sem.stop(); HR.sem.load(); });   /* AG34.1: a folder switch stops a build */
    HR.sem.load();
  }
  return { init: init, draw: draw, paint: paint };
})();
