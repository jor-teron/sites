/* PDF Viewer — pv_find.js: in-app Find over native + OCR text. PV2 */
(function (root) {
  'use strict';

  var M = root.PVOcrMath;

  function createFind(opts) {
    opts = opts || {};
    var els = opts.els || {};
    var getPageText = opts.getPageText || function () { return ''; };
    var getNumPages = opts.getNumPages || function () { return 0; };
    var getSlot = opts.getSlot || function () { return null; };
    var goToPage = opts.goToPage || function () {};
    var onStatus = opts.onStatus || function () {};

    var matches = [];
    var index = -1;
    var query = '';

    function updateCount() {
      if (!els.count) return;
      if (!query) {
        els.count.textContent = '';
        return;
      }
      if (!matches.length) {
        els.count.textContent = '0 / 0';
        return;
      }
      els.count.textContent = (index + 1) + ' / ' + matches.length;
    }

    function clearLayerHighlights() {
      var n = getNumPages();
      var i, slot;
      for (i = 1; i <= n; i++) {
        slot = getSlot(i);
        if (slot && slot.textLayer && root.PVTextLayer) {
          root.PVTextLayer.clearHighlights(slot.textLayer);
        }
      }
    }

    function paintCurrent() {
      clearLayerHighlights();
      if (!query || index < 0 || !matches[index]) {
        updateCount();
        return;
      }
      var m = matches[index];
      var slot = getSlot(m.page);
      if (slot && slot.textLayer && root.PVTextLayer) {
        root.PVTextLayer.highlight(slot.textLayer, query, m.start, m.end);
      }
      updateCount();
    }

    function collectTexts() {
      var n = getNumPages();
      var texts = [];
      var i;
      for (i = 1; i <= n; i++) texts.push(getPageText(i) || '');
      return texts;
    }

    function search(q) {
      query = String(q || '').trim();
      matches = M.findMatches(collectTexts(), query);
      index = matches.length ? 0 : -1;
      if (!query) {
        clearLayerHighlights();
        updateCount();
        return;
      }
      if (!matches.length) {
        clearLayerHighlights();
        updateCount();
        onStatus('No matches');
        return;
      }
      jumpTo(index);
    }

    function jumpTo(i) {
      if (i < 0 || i >= matches.length) {
        paintCurrent();
        return;
      }
      index = i;
      var m = matches[index];
      goToPage(m.page);
      // Layer may appear after render; retry highlight shortly.
      paintCurrent();
      setTimeout(paintCurrent, 80);
      setTimeout(paintCurrent, 250);
    }

    function step(dir) {
      if (!query) {
        if (els.input) search(els.input.value);
        return;
      }
      if (!matches.length) {
        search(query);
        return;
      }
      index = M.nextMatchIndex(index, matches.length, dir);
      jumpTo(index);
    }

    function open() {
      if (els.bar) els.bar.hidden = false;
      if (els.input) {
        els.input.focus();
        els.input.select();
        if (els.input.value) search(els.input.value);
      }
    }

    function close() {
      if (els.bar) els.bar.hidden = true;
      clearLayerHighlights();
    }

    function isOpen() {
      return !!(els.bar && !els.bar.hidden);
    }

    function refreshIfOpen() {
      if (!isOpen()) return;
      if (query) search(query);
    }

    function onPageRendered(slot) {
      if (!isOpen() || !query || index < 0 || !matches[index]) return;
      if (matches[index].page === slot.pageNum) paintCurrent();
    }

    if (els.input) {
      els.input.addEventListener('input', function () {
        search(els.input.value);
      });
      els.input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          step(e.shiftKey ? -1 : 1);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          close();
        }
      });
    }
    if (els.prevBtn) els.prevBtn.addEventListener('click', function () { step(-1); });
    if (els.nextBtn) els.nextBtn.addEventListener('click', function () { step(1); });
    if (els.closeBtn) els.closeBtn.addEventListener('click', close);

    return {
      open: open,
      close: close,
      isOpen: isOpen,
      search: search,
      step: step,
      refreshIfOpen: refreshIfOpen,
      onPageRendered: onPageRendered,
      getQuery: function () { return query; },
      getMatchCount: function () { return matches.length; }
    };
  }

  root.PVFind = { createFind: createFind };
})(typeof globalThis !== 'undefined' ? globalThis : this);
