/* SUDO-P1: isolated dialog + print root; gameplay and stored entries are never changed. */
(function () {
  'use strict';
  var dialog, root, preview, set, timer, level = 0, revision = 0;
  function el(id) { return document.getElementById(id); }
  function escape(s) { return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function newSeed() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); }
  function setup() {
    root = document.createElement('div'); root.id = 'sp-print-root'; document.body.appendChild(root);
    dialog = document.createElement('dialog'); dialog.id = 'sp-dialog'; dialog.setAttribute('aria-labelledby', 'sp-title');
    dialog.innerHTML = '<header><h2 id="sp-title">Printable Sudoku</h2><button id="sp-close" aria-label="Close print setup">✕</button></header>' +
      '<p>Tip: choose Save as PDF to keep sheets for later</p><div class="sp-controls">' +
      '<label>Grids per page<select id="sp-count"><option>1</option><option>2</option><option>4</option><option>6</option></select></label>' +
      '<label>Difficulty<select id="sp-band">' + SD_SHEETS.bands.concat(['Mixed']).map(function (b) { return '<option>' + b + '</option>'; }).join('') + '</select></label>' +
      '<label>Pages (1–20)<input id="sp-pages" type="number" min="1" max="20" value="1"></label>' +
      '<label>Paper size<select id="sp-paper"><option>A4</option><option>Letter</option></select></label>' +
      '<label class="sp-wide">Seed or printed ID<input id="sp-seed" maxlength="72" spellcheck="false" autocapitalize="off"></label>' +
      '<button id="sp-new">New set</button><label class="sp-check"><input id="sp-answers" type="checkbox"> Include answers at end</label></div>' +
      '<p class="sp-help">Paste a printed ID to restore its seed and settings and print matching answers. Difficulty uses the same level bands as the game.</p>' +
      '<div class="sp-buttons"><button id="sp-puzzle">Print Puzzle</button><button id="sp-answer">Print Answer</button>' +
      '<button id="sp-current">Print this puzzle</button><button id="sp-current-answer">Print this answer</button></div>' +
      '<p id="sp-status" role="status" aria-live="polite"></p><label>Preview page<select id="sp-preview-page"></select></label><div id="sp-preview"></div>';
    document.body.appendChild(dialog); preview = el('sp-preview');
    var style = document.createElement('style'); style.id = 'sp-page-style'; document.head.appendChild(style);
    el('sp-close').onclick = function () { dialog.close(); };
    el('sp-new').onclick = function () { el('sp-seed').value = newSeed(); update(); };
    ['sp-count','sp-band','sp-pages','sp-seed'].forEach(function (id) { el(id).addEventListener('input', schedule); });
    el('sp-paper').onchange = showPreview;
    el('sp-answers').onchange = function () { rebuildPreviewList(); };
    el('sp-preview-page').onchange = showPreview;
    el('sp-puzzle').onclick = function () { print(false, false); };
    el('sp-answer').onclick = function () { print(true, false); };
    el('sp-current').onclick = function () { print(false, true); };
    el('sp-current-answer').onclick = function () { print(true, true); };
    new ResizeObserver(fitPreview).observe(preview);
    window.addEventListener('beforeprint', function () {
      // Ctrl+P also produces clean sheets rather than the dark game UI.
      if (!root.children.length) { if (!set) update(); renderPrint('puzzle', set); }
    });
  }
  function schedule() {
    clearTimeout(timer); revision++; el('sp-status').textContent = 'Updating preview…';
    dialog.querySelectorAll('.sp-buttons button').forEach(function (b) { b.disabled = true; });
    timer = setTimeout(update, 180);
  }
  function update() {
    clearTimeout(timer);
    var seedInput = el('sp-seed'), parsed = SD_SHEETS.readId(seedInput.value.trim());
    if (parsed && parsed.current == null) {
      seedInput.value = parsed.seed; el('sp-count').value = parsed.perPage;
      el('sp-pages').value = parsed.pages; el('sp-band').value = parsed.difficulty;
    }
    var opts = { seed: seedInput.value, perPage: el('sp-count').value, pages: el('sp-pages').value, difficulty: el('sp-band').value };
    if (parsed && parsed.current != null) opts.current = parsed.current;
    set = SD_SHEETS.create(opts); revision = 0;
    if (!parsed || parsed.current == null) { seedInput.value = set.seed; el('sp-pages').value = set.pages; }
    root.innerHTML = ''; // Never leave sheets from the previous seed for Ctrl+P.
    dialog.querySelectorAll('.sp-buttons button').forEach(function (b) { b.disabled = false; });
    rebuildPreviewList();
  }
  function groups(mode, data) {
    var pages = [];
    function add(answer) {
      var size = answer ? 9 : data.perPage;
      for (var i = 0; i < data.puzzles.length; i += size) pages.push({ answer: answer, size: size, puzzles: data.puzzles.slice(i, i + size) });
    }
    if (mode !== 'answer') add(false);
    if (mode !== 'puzzle') add(true);
    return pages;
  }
  function grid(p, answer) {
    return '<article class="sp-slot"><h3>' + (answer ? 'Answer' : 'Puzzle') + ' #' + p.number + ', ' + escape(p.band) + '</h3>' +
      '<div class="sp-grid">' + (answer ? p.solution : p.puzzle).map(function (d, i) {
        return '<span class="' + (i % 9 === 2 || i % 9 === 5 ? 'sp-right ' : '') + (Math.floor(i / 9) === 2 || Math.floor(i / 9) === 5 ? 'sp-bottom' : '') + '">' + (d || '') + '</span>';
      }).join('') + '</div></article>';
  }
  function sheet(page, data, index, total) {
    return '<section class="sp-sheet sp-n' + page.size + '" data-paper="' + el('sp-paper').value + '">' +
      '<div class="sp-heading">Sudoku · ' + (page.answer ? 'Answers' : 'Puzzles') + '</div><div class="sp-grids">' +
      page.puzzles.map(function (p) { return grid(p, page.answer); }).join('') + '</div>' +
      '<footer>Sudoku · Page ' + (index + 1) + ' of ' + total + '<br>ID / seed: ' + escape(data.id) + '</footer></section>';
  }
  function rebuildPreviewList() {
    if (!set) return;
    var pages = groups('both', set);
    // Answer-only preview stays available even with the combined-print option off.
    el('sp-preview-page').innerHTML = pages.map(function (p, i) {
      return '<option value="' + i + '">' + (p.answer ? 'Answers' : 'Puzzles') + ' · #' + p.puzzles[0].number + '–' + p.puzzles[p.puzzles.length - 1].number + '</option>';
    }).join('');
    el('sp-status').textContent = set.puzzles.length + ' puzzle(s) · ID / seed: ' + set.id;
    showPreview();
  }
  function showPreview() {
    if (!set) return;
    var mode = el('sp-answers').checked ? 'both' : 'puzzle', pages = groups(mode, set), answers = groups('answer', set);
    var i = +el('sp-preview-page').value || 0, selected = pages[i] || answers[i - pages.length];
    preview.innerHTML = sheet(selected, set, i < pages.length ? i : i - pages.length, i < pages.length ? pages.length : answers.length);
    fitPreview(); root.innerHTML = '';
    el('sp-page-style').textContent = '@page { size: ' + el('sp-paper').value + ' portrait; margin: 10mm; }';
  }
  function fitPreview() {
    var page = preview && preview.firstElementChild;
    if (page) { page.style.zoom = Math.min(1, preview.clientWidth / (el('sp-paper').value === 'A4' ? 190 : 195.9) / (96 / 25.4)); }
  }
  function renderPrint(mode, data) {
    var pages = groups(mode, data);
    root.innerHTML = pages.map(function (p, i) { return sheet(p, data, i, pages.length); }).join('');
  }
  function print(answer, current) {
    if (revision) update();
    var data = current ? SD_SHEETS.create({ current: level }) : set;
    var mode = answer ? 'answer' : el('sp-answers').checked ? 'both' : 'puzzle';
    renderPrint(mode, data);
    window.print();
  }
  window.SD_PRINT = { open: function (l) {
    level = l;
    if (!dialog) { setup(); el('sp-seed').value = newSeed(); el('sp-band').value = SD_GEN.band(l); }
    dialog.showModal(); update();
  } };
})();
