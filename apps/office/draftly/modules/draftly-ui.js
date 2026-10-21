/* ============================================================
   FILE: modules/draftly-ui.js
   PROJECT: Draftly
   ROLE: Toast, theme, orientation label, toolbar active state.
   DEPENDS: Draftly.config, Draftly.storage
   ISOLATION: Missing buttons are skipped. No throw to app.js.
   ============================================================ */

/* Shared namespace. */
var Draftly = window.Draftly || {};
window.Draftly = Draftly;

/* UI state and small DOM helpers. */
Draftly.ui = {};

/* Timer id for the toast hide. */
Draftly.ui.toastTimer = null;

/* Whether paragraph and line-break marks are visible. */
Draftly.ui.showNonPrinting = false;

/* Show a short message. No-op if the toast node is missing. */
Draftly.ui.showToast = function showToast(msg) {
  var toast = document.getElementById('toast');
  var cfg = Draftly.config;
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(Draftly.ui.toastTimer);
  Draftly.ui.toastTimer = setTimeout(function () {
    toast.classList.remove('show');
  }, cfg.toastMs);
};

/* Read the non-printing flag. */
Draftly.ui.isNonPrinting = function isNonPrinting() {
  return Draftly.ui.showNonPrinting;
};

/* Toggle format marks on every editor page. */
Draftly.ui.toggleNonPrinting = function toggleNonPrinting() {
  var cfg = Draftly.config;
  Draftly.ui.showNonPrinting = !Draftly.ui.showNonPrinting;
  var btn = document.getElementById('nonPrintingBtn');
  var editors = document.querySelectorAll('.' + cfg.editorClass);
  var i;
  for (i = 0; i < editors.length; i++) {
    if (Draftly.ui.showNonPrinting) editors[i].classList.add(cfg.nonPrintClass);
    else editors[i].classList.remove(cfg.nonPrintClass);
  }
  if (btn) {
    btn.classList.toggle('active', Draftly.ui.showNonPrinting);
    btn.setAttribute('aria-pressed', Draftly.ui.showNonPrinting ? 'true' : 'false');
    btn.title = Draftly.ui.showNonPrinting ? 'Hide format marks (¶ ↵)' : 'Show format marks (¶ ↵)';
  }
  if (Draftly.storage) Draftly.storage.save();
  if (Draftly.marks) Draftly.marks.redraw();
};

/* Apply a known non-printing state without toggling. */
Draftly.ui.setNonPrinting = function setNonPrinting(on) {
  if (on !== Draftly.ui.showNonPrinting) Draftly.ui.toggleNonPrinting();
};

/* Apply light or dark theme and store it. */
Draftly.ui.setTheme = function setTheme(dark) {
  var body = document.body;
  var btn = document.getElementById('themeToggleBtn');
  if (dark) {
    body.classList.add(Draftly.config.darkClass);
    if (btn) btn.title = 'Light theme';
  } else {
    body.classList.remove(Draftly.config.darkClass);
    if (btn) btn.title = 'Dark theme';
  }
  if (Draftly.storage) Draftly.storage.saveTheme(dark);
};

/* Flip the current theme. */
Draftly.ui.toggleTheme = function toggleTheme() {
  Draftly.ui.setTheme(!document.body.classList.contains(Draftly.config.darkClass));
};

/* Load stored theme. Defaults to light. */
Draftly.ui.loadTheme = function loadTheme() {
  var dark = Draftly.storage ? Draftly.storage.loadThemeDark() : false;
  Draftly.ui.setTheme(dark);
};

/* Set portrait or landscape, update label, store, ask pages to reflow. */
Draftly.ui.setOrientation = function setOrientation(mode) {
  var body = document.body;
  var cfg = Draftly.config;
  var select = document.getElementById('orientationSelect');
  var label = document.getElementById('orientationLabel');
  if (mode === 'landscape') body.classList.add(cfg.landscapeClass);
  else body.classList.remove(cfg.landscapeClass);
  if (select) select.value = mode;
  if (label) label.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
  var papers = document.querySelectorAll('.paper');
  var i;
  for (i = 0; i < papers.length; i++) papers[i].setAttribute('data-orientation', mode);
  if (Draftly.storage) Draftly.storage.saveOrientation(mode);
  if (Draftly.view) { Draftly.view.fit(); Draftly.view.syncPagePanel(); }
  if (Draftly.pages) Draftly.pages.layoutAll();
};

/* Set paper size and margin preset, store, reflow. */
Draftly.ui.setPage = function setPage(size, margins) {
  var cfg = Draftly.config;
  cfg.setPage(size, margins);
  if (Draftly.storage) Draftly.storage.savePage(cfg.paperSize, cfg.marginPreset);
  if (Draftly.view) { Draftly.view.fit(); Draftly.view.syncPagePanel(); }
  if (Draftly.pages && Draftly.app && Draftly.app.ready) Draftly.pages.layoutAll();
};

/* Sync bold, italic, underline, and align buttons with the selection. */
Draftly.ui.updateToolbarState = function updateToolbarState() {
  var boldBtn = document.getElementById('boldBtn');
  var italicBtn = document.getElementById('italicBtn');
  var underlineBtn = document.getElementById('underlineBtn');
  var alignLeftBtn = document.getElementById('alignLeftBtn');
  var alignCenterBtn = document.getElementById('alignCenterBtn');
  var alignRightBtn = document.getElementById('alignRightBtn');
  try {
    if (boldBtn) boldBtn.classList.toggle('active', document.queryCommandState('bold'));
    if (italicBtn) italicBtn.classList.toggle('active', document.queryCommandState('italic'));
    if (underlineBtn) underlineBtn.classList.toggle('active', document.queryCommandState('underline'));
    [['strikeBtn', 'strikeThrough'], ['superBtn', 'superscript'], ['subBtn', 'subscript']].forEach(function (b) {
      var n = document.getElementById(b[0]);
      if (n) n.classList.toggle('active', document.queryCommandState(b[1]));
    });
    if (alignLeftBtn) alignLeftBtn.classList.toggle('active', document.queryCommandState('justifyLeft'));
    if (alignCenterBtn) alignCenterBtn.classList.toggle('active', document.queryCommandState('justifyCenter'));
    if (alignRightBtn) alignRightBtn.classList.toggle('active', document.queryCommandState('justifyRight'));
  } catch (e) {}
  Draftly.ui.syncFontSelects();
  if (Draftly.lists) Draftly.lists.syncSuffix();
  if (Draftly.spacing) Draftly.spacing.sync();
};

/* Show the font and nearest pt size at the cursor in the selects. */
Draftly.ui.syncFontSelects = function syncFontSelects() {
  var sel = window.getSelection();
  if (!sel || !sel.anchorNode) return;
  var el = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
  if (!el || !Draftly.editor.isInEditor(el)) return;
  var style = window.getComputedStyle(el);
  var familySelect = document.getElementById('fontFamilySelect');
  var sizeSelect = document.getElementById('fontSizeSelect');
  if (familySelect) {
    var first = (style.fontFamily.split(',')[0] || '').replace(/["']/g, '').trim();
    var k;
    for (k = 0; k < familySelect.options.length; k++) {
      if (familySelect.options[k].value.toLowerCase() === first.toLowerCase()) familySelect.value = familySelect.options[k].value;
    }
  }
  if (sizeSelect) {
    var pt = parseFloat(style.fontSize) * 0.75;
    var best = null;
    var i;
    for (i = 0; i < sizeSelect.options.length; i++) {
      var v = parseFloat(sizeSelect.options[i].value);
      if (best === null || Math.abs(v - pt) < Math.abs(parseFloat(best) - pt)) best = sizeSelect.options[i].value;
    }
    if (best !== null) sizeSelect.value = best;
  }
};

/* Bind one click that does not steal the caret. */
Draftly.ui.onClick = function onClick(id, fn) {
  var node = document.getElementById(id);
  if (!node) return;
  node.addEventListener('mousedown', function (e) { e.preventDefault(); });
  node.addEventListener('click', function (e) {
    e.preventDefault();
    try { fn(e); } catch (err) { console.warn('draftly: ' + id, err); }
  });
};

/* Theme and format-marks buttons; redraw marks on resize. */
Draftly.ui.bind = function bind() {
  Draftly.ui.onClick('themeToggleBtn', function () { Draftly.ui.toggleTheme(); });
  Draftly.ui.onClick('nonPrintingBtn', function () { Draftly.ui.toggleNonPrinting(); });
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (Draftly.marks) Draftly.marks.redraw();
    }, Draftly.config.resizeDebounceMs);
  });
};
