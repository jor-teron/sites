/* ============================================================
   FILE: modules/draftly-pages.js
   PROJECT: Draftly
   ROLE: Paper cards (create / number / reset) and pagination entry points.
   DEPENDS: Draftly.config, Draftly.ui, Draftly.editor
   FLOW: The line-by-line split lives in draftly-flow.js.
   ============================================================ */

/* Shared namespace. */
var Draftly = window.Draftly || {};
window.Draftly = Draftly;

/* Page split helpers. */
Draftly.pages = {};

/* True while a split is running, so input cannot re-enter. */
Draftly.pages.isPaginating = false;

/* Whole document HTML, continuation pieces re-joined, no marks (save / export). */
Draftly.pages.combinedHtml = function combinedHtml() {
  return Draftly.flow.joinedHtml();
};

/* First page editor, or null. */
Draftly.pages.firstEditor = function firstEditor() {
  return document.querySelector('.' + Draftly.config.editorClass);
};

/* Content box height of a paper card, in pixels. */
Draftly.pages.getMaxContentHeightPx = function getMaxContentHeightPx(paperEl) {
  var cfg = Draftly.config;
  if (!paperEl) return cfg.fallbackContentHeightPx;
  var style = getComputedStyle(paperEl);
  var padTop = parseFloat(style.paddingTop) || 0;
  var padBottom = parseFloat(style.paddingBottom) || 0;
  var paperHeight = paperEl.getBoundingClientRect().height;
  return paperHeight - padTop - padBottom;
};

/* Write the page count into the status bar and badges. */
Draftly.pages.updatePageNumbers = function updatePageNumbers(total) {
  var papers = document.querySelectorAll('.paper');
  var label = document.getElementById('pageCountLabel');
  var i;
  var pn;
  for (i = 0; i < papers.length; i++) {
    pn = papers[i].querySelector('.page-number');
    if (!pn) {
      pn = document.createElement('div');
      pn.className = 'page-number';
      papers[i].appendChild(pn);
    }
    pn.textContent = 'Page ' + (i + 1);
    papers[i].setAttribute(
      'data-orientation',
      document.body.classList.contains(Draftly.config.landscapeClass) ? 'landscape' : 'portrait'
    );
  }
  if (label) label.textContent = total + (total === 1 ? ' page' : ' pages');
};

/* Build a new paper card and return it. */
Draftly.pages.createNewPage = function createNewPage(index) {
  var cfg = Draftly.config;
  var paper = document.createElement('div');
  paper.className = 'paper';
  paper.setAttribute(
    'data-orientation',
    document.body.classList.contains(cfg.landscapeClass) ? 'landscape' : 'portrait'
  );

  var ed = document.createElement('div');
  ed.className = cfg.editorClass;
  ed.contentEditable = 'true';
  ed.spellcheck = false;
  ed.setAttribute('data-placeholder', cfg.placeholder);

  var pn = document.createElement('div');
  pn.className = 'page-number';
  pn.textContent = 'Page ' + index;

  paper.appendChild(ed);
  paper.appendChild(pn);
  (document.getElementById('pages') || document.getElementById('workspace')).appendChild(paper);

  if (Draftly.ui && Draftly.ui.isNonPrinting()) ed.classList.add(cfg.nonPrintClass);
  return paper;
};

/* Drop extra paper cards. Keep the first. */
Draftly.pages.rebuildSinglePage = function rebuildSinglePage() {
  var workspace = document.getElementById('workspace');
  var papers = workspace.querySelectorAll('.paper');
  var i;
  for (i = 1; i < papers.length; i++) papers[i].remove();
};

/* Reflow from the page holding the caret (one page back too, for pull-back).
   Pages are fixed A4 boxes; draftly-flow.js moves / splits content line by line. */
Draftly.pages.checkPagination = function checkPagination() {
  var eds = Draftly.flow.editors();
  var start = 0;
  var sel = window.getSelection();
  var i;
  if (sel && sel.rangeCount) {
    for (i = 0; i < eds.length; i++) if (eds[i].contains(sel.anchorNode)) { start = i; break; }
  } else if (Draftly.editor && Draftly.editor.activeEditor) {
    start = Math.max(0, eds.indexOf(Draftly.editor.activeEditor));
  }
  Draftly.flow.reflow(Math.max(0, start - 1));
};

/* Full re-layout (load, margins, orientation). */
Draftly.pages.layoutAll = function layoutAll() {
  Draftly.flow.reflowAll();
};
