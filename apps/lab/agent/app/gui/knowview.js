/* Agent — app/gui/knowview.js: Settings › Folder & Memory › Knowledge (AG33). HR.knowView.
   Import .txt / .md (copies into agent/knowledge/raw/), a list with ✕ Remove (Agent's copy only, after a confirm), and a
   small keyword search box to check what the agent would find. All file text is shown with textContent (no HTML). */
HR.knowView = (function () {
  function $(id) { return document.getElementById(id); }
  function el(t, c, txt) { var e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; }
  async function draw() {
    var box = $('knowList'), stat = $('knowStat'); if (!box) return;
    box.innerHTML = '';
    if (!HR.fs.ready()) { stat.textContent = 'Pick a folder to import documents.'; $('btnKnowImp').disabled = true; return; }
    $('btnKnowImp').disabled = false;
    var l = await HR.know.list(); stat.textContent = l.length ? l.length + ' document' + (l.length > 1 ? 's' : '') + ' in agent/knowledge/raw/' : 'No documents yet.';
    l.forEach(function (f) {
      var row = el('div', 'know-row'), x = el('button', 'hb', '✕'); x.type = 'button'; x.title = 'Remove Agent\'s copy'; x.setAttribute('aria-label', 'Remove ' + f.name);
      x.onclick = async function () { if (!confirm('Remove "' + f.name + '" from Agent\'s knowledge? (Only Agent\'s copy; your original file is not touched.)')) return; try { await HR.know.remove(f.name); } catch (e) { stat.textContent = e.message; } draw(); };
      row.appendChild(el('span', 'know-n', f.name)); row.appendChild(x); box.appendChild(row);
    });
  }
  async function find() {
    var out = $('knowRes'), q = $('knowQ').value; out.innerHTML = '';
    try {
      var r = await HR.ksearch.search(q, { chatId: HR.chats && HR.chats.id(), limit: 5 });
      if (!r.results.length) { out.appendChild(el('p', 'hint', r.terms.length ? 'No matches.' : 'Type a word or two.')); return; }
      r.results.forEach(function (x) {
        var d = el('div', 'know-hit'); d.appendChild(el('div', 'know-src', x.scope + ' · ' + x.path + ':' + x.line));
        d.appendChild(el('pre', 'know-snip', x.snippet.map(function (s) { return s.n + '| ' + s.text; }).join('\n'))); out.appendChild(d);
      });
    } catch (e) { out.appendChild(el('p', 'hint', e.message)); }
  }
  function init() {
    var inp = $('knowFile'); if (!inp) return;
    $('btnKnowImp').onclick = function () { inp.click(); };
    inp.onchange = async function () {
      var st = $('knowStat');
      try { var r = await HR.know.importFiles([].slice.call(inp.files)); await draw();
        st.textContent += ' · added ' + r.added.length + (r.skipped.length ? ', skipped ' + r.skipped.map(function (s) { return s.name + ' (' + s.why + ')'; }).join(', ') : ''); }
      catch (e) { st.textContent = e.message; }
      inp.value = '';
    };
    $('btnKnowFind').onclick = find;
    $('knowQ').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); find(); } });
    $('btnSet').addEventListener('click', draw);
    HR.fs.onChange(draw);
  }
  return { init: init, draw: draw, find: find };
})();
