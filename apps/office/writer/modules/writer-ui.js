/* ============================================================
   FILE: modules/writer-ui.js
   DF25: was modules/draftly-ui.js (global Draftly is now Writer).
   PROJECT: Writer
   ROLE: Notification cards + theme (via ../shared office-notify / office-theme), orientation label, toolbar active state.
   DEPENDS: Writer.config, Writer.storage
   ISOLATION: Missing buttons are skipped. No throw to app.js.
   ============================================================ */

/* Shared namespace. */
/* (before DF25) var Draftly = window.Draftly || {}; window.Draftly = Draftly; */
var Writer = window.Writer || {};
window.Writer = Writer;

/* UI state and small DOM helpers. */
Writer.ui = {};

/* Whether paragraph and line-break marks are visible. */
Writer.ui.showNonPrinting = false;

/* Show a short message as a notification card (shared ../shared/office-notify.js, SH7). */
Writer.ui.showToast = function showToast(msg) {
  if (typeof OfficeNotify !== 'undefined') OfficeNotify.show(msg, Writer.config.toastMs);
};

/* Read the non-printing flag. */
Writer.ui.isNonPrinting = function isNonPrinting() {
  return Writer.ui.showNonPrinting;
};

/* Toggle format marks on every editor page. */
Writer.ui.toggleNonPrinting = function toggleNonPrinting() {
  var cfg = Writer.config;
  Writer.ui.showNonPrinting = !Writer.ui.showNonPrinting;
  var btn = document.getElementById('nonPrintingBtn');
  var editors = document.querySelectorAll('.' + cfg.editorClass);
  var i;
  for (i = 0; i < editors.length; i++) {
    if (Writer.ui.showNonPrinting) editors[i].classList.add(cfg.nonPrintClass);
    else editors[i].classList.remove(cfg.nonPrintClass);
  }
  if (btn) {
    btn.classList.toggle('active', Writer.ui.showNonPrinting);
    btn.setAttribute('aria-pressed', Writer.ui.showNonPrinting ? 'true' : 'false');
    btn.title = Writer.ui.showNonPrinting ? 'Hide format marks (¶ ↵)' : 'Show format marks (¶ ↵)';
  }
  if (Writer.storage) Writer.storage.save();
  if (Writer.marks) Writer.marks.redraw();
};

/* Apply a known non-printing state without toggling. */
Writer.ui.setNonPrinting = function setNonPrinting(on) {
  if (on !== Writer.ui.showNonPrinting) Writer.ui.toggleNonPrinting();
};

/* Apply light or dark theme and store it. */
Writer.ui.setTheme = function setTheme(dark) {
  var body = document.body;
  var btn = document.getElementById('themeToggleBtn');
  if (typeof OfficeTheme !== 'undefined') OfficeTheme.apply(dark, { darkClass: Writer.config.darkClass });
  else body.classList.toggle(Writer.config.darkClass, !!dark);
  if (btn) btn.title = dark ? 'Light theme' : 'Dark theme';
  if (Writer.storage) Writer.storage.saveTheme(dark);
};

/* Flip the current theme. */
Writer.ui.toggleTheme = function toggleTheme() {
  Writer.ui.setTheme(!document.body.classList.contains(Writer.config.darkClass));
};

/* Load stored theme. Defaults to light. */
Writer.ui.loadTheme = function loadTheme() {
  var dark = Writer.storage ? Writer.storage.loadThemeDark() : false;
  Writer.ui.setTheme(dark);
};

/* Set portrait or landscape, update label, store, ask pages to reflow. */
Writer.ui.setOrientation = function setOrientation(mode) {
  var body = document.body;
  var cfg = Writer.config;
  var select = document.getElementById('orientationSelect');
  var label = document.getElementById('orientationLabel');
  if (mode === 'landscape') body.classList.add(cfg.landscapeClass);
  else body.classList.remove(cfg.landscapeClass);
  if (select) select.value = mode;
  if (label) label.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
  var papers = document.querySelectorAll('.paper');
  var i;
  for (i = 0; i < papers.length; i++) papers[i].setAttribute('data-orientation', mode);
  if (Writer.storage) Writer.storage.saveOrientation(mode);
  if (Writer.view) { Writer.view.fit(); Writer.view.syncPagePanel(); }
  if (Writer.pages) Writer.pages.layoutAll();
};

/* Set paper size and margin preset, store, reflow. */
Writer.ui.setPage = function setPage(size, margins, custom) {
  var cfg = Writer.config;
  cfg.setPage(size, margins, custom);
  if (Writer.storage) Writer.storage.savePage(cfg.paperSize, cfg.marginPreset);
  if (Writer.view) { Writer.view.fit(); Writer.view.syncPagePanel(); }
  if (Writer.pages && Writer.app && Writer.app.ready) Writer.pages.layoutAll();
};

/* Sync bold, italic, underline, and align buttons with the selection. */
Writer.ui.updateToolbarState = function updateToolbarState() {
  var boldBtn = document.getElementById('boldBtn');
  var italicBtn = document.getElementById('italicBtn');
  var underlineBtn = document.getElementById('underlineBtn');
  var alignLeftBtn = document.getElementById('alignLeftBtn');
  var alignCenterBtn = document.getElementById('alignCenterBtn');
  var alignRightBtn = document.getElementById('alignRightBtn');
  var alignJustifyBtn = document.getElementById('alignJustifyBtn');
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
    if (alignJustifyBtn) alignJustifyBtn.classList.toggle('active', document.queryCommandState('justifyFull'));
  } catch (e) {}
  Writer.ui.syncFontSelects();
  if (Writer.lists) Writer.lists.syncSuffix();
  if (Writer.spacing) Writer.spacing.sync();
};

/* Show the font and nearest pt size at the cursor in the selects. */
Writer.ui.syncFontSelects = function syncFontSelects() {
  var sel = window.getSelection();
  if (!sel || !sel.anchorNode) return;
  var el = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
  if (!el || !Writer.editor.isInEditor(el)) return;
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
Writer.ui.onClick = function onClick(id, fn) {
  var node = document.getElementById(id);
  if (!node) return;
  node.addEventListener('mousedown', function (e) { e.preventDefault(); });
  node.addEventListener('click', function (e) {
    e.preventDefault();
    try { fn(e); } catch (err) { console.warn('writer: ' + id, err); }
  });
};

/* Theme and format-marks buttons; redraw marks on resize. */
Writer.ui.bind = function bind() {
  Writer.ui.onClick('themeToggleBtn', function () { Writer.ui.toggleTheme(); });
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (Writer.marks) Writer.marks.redraw();
    }, Writer.config.resizeDebounceMs);
  });
};
