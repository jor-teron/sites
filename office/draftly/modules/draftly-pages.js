/* ============================================================
   FILE: modules/draftly-pages.js
   PROJECT: draftly
   ROLE: Split editor content across A4 paper cards.
   DEPENDS: Draftly.config, Draftly.ui, Draftly.editor
   ISOLATION: Guarded by isPaginating. A bad measure returns
              early and leaves the current pages in place.
   ============================================================ */

/* Shared namespace. */
var Draftly = window.Draftly || {};
window.Draftly = Draftly;

/* Page split helpers. */
Draftly.pages = {};

/* True while a split is running, so input cannot re-enter. */
Draftly.pages.isPaginating = false;

/* Collect HTML from every page editor, in order. */
Draftly.pages.combinedHtml = function combinedHtml() {
  var editors = document.querySelectorAll('.' + Draftly.config.editorClass);
  var html = '';
  var i;
  for (i = 0; i < editors.length; i++) html += editors[i].innerHTML;
  return html;
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
  document.getElementById('workspace').appendChild(paper);

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

/* Move block nodes onto new pages when the first page overflows. */
Draftly.pages.splitContentIntoPages = function splitContentIntoPages() {
  var cfg = Draftly.config;
  var firstEditor = Draftly.pages.firstEditor();
  if (!firstEditor) return;

  var nodes = Array.prototype.slice.call(firstEditor.childNodes);
  var currentPageEditor = firstEditor;
  var currentPageIndex = 1;
  var i;
  var testNode;
  var currentPaper;
  var availableHeight;

  while (firstEditor.firstChild) firstEditor.removeChild(firstEditor.firstChild);

  for (i = 0; i < nodes.length; i++) {
    testNode = nodes[i].cloneNode(true);
    currentPageEditor.appendChild(testNode);
    currentPaper = currentPageEditor.closest('.paper');
    availableHeight = Draftly.pages.getMaxContentHeightPx(currentPaper);

    if (currentPageEditor.scrollHeight > availableHeight + cfg.paginationSlackPx) {
      currentPageEditor.removeChild(testNode);
      currentPageIndex += 1;
      currentPageEditor = Draftly.pages.createNewPage(currentPageIndex).querySelector('.' + cfg.editorClass);
      currentPageEditor.appendChild(testNode);
    }
  }

  var pages = document.querySelectorAll('.paper');
  if (pages.length > 1) {
    var lastPage = pages[pages.length - 1];
    var lastEditor = lastPage.querySelector('.' + cfg.editorClass);
    if (lastEditor && !lastEditor.innerHTML.trim()) lastPage.remove();
  }
  Draftly.pages.updatePageNumbers(document.querySelectorAll('.paper').length);
};

/* Text offset of the caret across every page, or null. */
Draftly.pages.captureCaret = function captureCaret() {
  var sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  var range = sel.getRangeAt(0);
  var editors = document.querySelectorAll('.' + Draftly.config.editorClass);
  var offset = 0;
  var i;
  var pre;
  for (i = 0; i < editors.length; i++) {
    if (editors[i].contains(range.startContainer)) {
      pre = document.createRange();
      pre.selectNodeContents(editors[i]);
      pre.setEnd(range.startContainer, range.startOffset);
      return { offset: offset + pre.toString().length };
    }
    offset += editors[i].textContent.length;
  }
  return null;
};

/* Place the caret at a text offset after a page rebuild. */
Draftly.pages.restoreCaret = function restoreCaret(mark) {
  if (!mark) return;
  var editors = document.querySelectorAll('.' + Draftly.config.editorClass);
  var remain = mark.offset;
  var i;
  var walker;
  var node;
  var range;
  var sel;
  for (i = 0; i < editors.length; i++) {
    if (editors[i].textContent.length < remain && i < editors.length - 1) {
      remain -= editors[i].textContent.length;
      continue;
    }
    walker = document.createTreeWalker(editors[i], NodeFilter.SHOW_TEXT, null);
    node = walker.nextNode();
    while (node) {
      if (node.length >= remain) {
        range = document.createRange();
        range.setStart(node, remain);
        range.collapse(true);
        sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        editors[i].focus();
        if (Draftly.editor) {
          Draftly.editor.activeEditor = editors[i];
          Draftly.editor.savedRange = range.cloneRange();
        }
        return;
      }
      remain -= node.length;
      node = walker.nextNode();
    }
    editors[i].focus();
    if (Draftly.editor) Draftly.editor.activeEditor = editors[i];
    return;
  }
};

/* Reflow only when a page overflows. A fitting page is not rewritten. */
Draftly.pages.checkPagination = function checkPagination() {
  var cfg = Draftly.config;
  if (Draftly.pages.isPaginating) return;

  var editors = document.querySelectorAll('.' + cfg.editorClass);
  if (!editors.length) return;

  /* One page that still fits: do not touch innerHTML. That was
     sending the caret back to the start of the page. */
  if (editors.length === 1) {
    var maxFit = Draftly.pages.getMaxContentHeightPx(editors[0].closest('.paper'));
    if (editors[0].scrollHeight <= maxFit + cfg.paginationSlackPx) {
      Draftly.pages.updatePageNumbers(1);
      return;
    }
  }

  Draftly.pages.isPaginating = true;
  var caret = Draftly.pages.captureCaret();
  var fullHTML = Draftly.pages.combinedHtml();
  Draftly.pages.rebuildSinglePage();
  var first = Draftly.pages.firstEditor();
  first.innerHTML = fullHTML;

  var maxContentHeightPx = Draftly.pages.getMaxContentHeightPx(first.closest('.paper'));
  if (first.scrollHeight > maxContentHeightPx + cfg.paginationSlackPx) {
    Draftly.pages.splitContentIntoPages();
  } else {
    Draftly.pages.updatePageNumbers(1);
  }
  if (Draftly.editor) Draftly.editor.markLineBreaks();
  Draftly.pages.restoreCaret(caret);
  Draftly.pages.isPaginating = false;
};
