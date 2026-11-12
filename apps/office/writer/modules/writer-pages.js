/* ============================================================
   FILE: modules/writer-pages.js
   DF25: was modules/draftly-pages.js (global Draftly is now Writer).
   PROJECT: Writer
   ROLE: Paper cards (create / number / reset) and pagination entry points.
   DEPENDS: Writer.config, Writer.ui, Writer.editor
   FLOW: The line-by-line split lives in writer-flow.js.
   ============================================================ */

/* Shared namespace. */
/* (before DF25) var Draftly = window.Draftly || {}; window.Draftly = Draftly; */
var Writer = window.Writer || {};
window.Writer = Writer;

/* Page split helpers. */
Writer.pages = {};

/* True while a split is running, so input cannot re-enter. */
Writer.pages.isPaginating = false;

/* Whole document HTML, continuation pieces re-joined, no marks (save / export). */
Writer.pages.combinedHtml = function combinedHtml() {
  return Writer.flow.joinedHtml();
};

/* First page editor, or null. */
Writer.pages.firstEditor = function firstEditor() {
  return document.querySelector('.' + Writer.config.editorClass);
};

/* Content box height of a paper card, in pixels. */
Writer.pages.getMaxContentHeightPx = function getMaxContentHeightPx(paperEl) {
  var cfg = Writer.config;
  if (!paperEl) return cfg.fallbackContentHeightPx;
  var style = getComputedStyle(paperEl);
  var padTop = parseFloat(style.paddingTop) || 0;
  var padBottom = parseFloat(style.paddingBottom) || 0;
  var paperHeight = paperEl.getBoundingClientRect().height;
  return paperHeight - padTop - padBottom;
};

/* Write the page count into the status bar and badges. */
Writer.pages.updatePageNumbers = function updatePageNumbers(total) {
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
    pn.textContent = String(i + 1);
    pn.setAttribute('aria-hidden', 'true');
    pn.contentEditable = 'false';
    papers[i].setAttribute(
      'data-orientation',
      document.body.classList.contains(Writer.config.landscapeClass) ? 'landscape' : 'portrait'
    );
  }
  if (label) label.textContent = total + (total === 1 ? ' page' : ' pages');
};

/* Build a new paper card and return it. */
Writer.pages.createNewPage = function createNewPage(index) {
  var cfg = Writer.config;
  var paper = document.createElement('div');
  paper.className = 'paper';
  paper.setAttribute(
    'data-orientation',
    document.body.classList.contains(cfg.landscapeClass) ? 'landscape' : 'portrait'
  );

  var ed = document.createElement('div');
  ed.className = cfg.editorClass;
  ed.contentEditable = 'true';
  /* (before DF21) ed.spellcheck = false; */
  /* DF21: new pages follow the Spelling setting (writer-write.js). */
  ed.spellcheck = !!(Writer.write && Writer.write.spellOn && Writer.write.spellOn());
  ed.setAttribute('data-placeholder', cfg.placeholder);

  var pn = document.createElement('div');
  pn.className = 'page-number';
  pn.textContent = String(index);
  pn.setAttribute('aria-hidden', 'true');
  pn.contentEditable = 'false';

  paper.appendChild(ed);
  paper.appendChild(pn);
  (document.getElementById('pages') || document.getElementById('workspace')).appendChild(paper);

  if (Writer.ui && Writer.ui.isNonPrinting()) ed.classList.add(cfg.nonPrintClass);
  return paper;
};

/* Drop extra paper cards. Keep the first. */
Writer.pages.rebuildSinglePage = function rebuildSinglePage() {
  var workspace = document.getElementById('workspace');
  var papers = workspace.querySelectorAll('.paper');
  var i;
  for (i = 1; i < papers.length; i++) papers[i].remove();
};

/* Reflow from the page holding the caret (one page back too, for pull-back).
   Pages are fixed A4 boxes; writer-flow.js moves / splits content line by line. */
Writer.pages.checkPagination = function checkPagination() {
  var eds = Writer.flow.editors();
  var start = 0;
  var sel = window.getSelection();
  var i;
  if (sel && sel.rangeCount) {
    for (i = 0; i < eds.length; i++) if (eds[i].contains(sel.anchorNode)) { start = i; break; }
  } else if (Writer.editor && Writer.editor.activeEditor) {
    start = Math.max(0, eds.indexOf(Writer.editor.activeEditor));
  }
  Writer.flow.reflow(Math.max(0, start - 1));
};

/* Full re-layout (load, margins, orientation). */
Writer.pages.layoutAll = function layoutAll() {
  Writer.flow.reflowAll();
};
