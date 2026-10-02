/* ============================================================
   FILE: modules/draftly-ui.js
   PROJECT: draftly
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
    if (Draftly.ui.showNonPrinting) {
      btn.classList.add('active');
      btn.textContent = '¶ Hide format';
    } else {
      btn.classList.remove('active');
      btn.textContent = '¶ Show format';
    }
  }
  if (Draftly.storage) Draftly.storage.save();
  if (Draftly.editor) Draftly.editor.syncMarks();
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
    if (btn) btn.textContent = '☀️ Light';
  } else {
    body.classList.remove(Draftly.config.darkClass);
    if (btn) btn.textContent = '🌙 Dark';
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
  if (Draftly.pages) Draftly.pages.checkPagination();
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
    if (alignLeftBtn) alignLeftBtn.classList.toggle('active', document.queryCommandState('justifyLeft'));
    if (alignCenterBtn) alignCenterBtn.classList.toggle('active', document.queryCommandState('justifyCenter'));
    if (alignRightBtn) alignRightBtn.classList.toggle('active', document.queryCommandState('justifyRight'));
  } catch (e) {}
};
