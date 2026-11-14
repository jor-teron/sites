/* PDF Viewer — pv_ui.js: toolbar, page box, zoom label, status, keyboard. PV1 + PV2 */
(function (root) {
  'use strict';

  var H = root.PVHelpers;

  function createUi(opts) {
    var els = opts.els;
    var renderer = null;
    var fileName = '';

    function setRenderer(r) {
      renderer = r;
    }

    function setStatus(text, kind) {
      var s = els.status;
      if (!s) return;
      s.textContent = text || '';
      s.classList.remove('error', 'busy');
      if (kind === 'error') s.classList.add('error');
      if (kind === 'busy') s.classList.add('busy');
    }

    function setEmpty(show) {
      if (els.empty) els.empty.hidden = !show;
      if (els.pages) els.pages.hidden = !!show;
      if (els.controls) els.controls.hidden = !!show;
    }

    function updateMeta(name, numPages) {
      fileName = name || '';
      if (!els.meta) return;
      if (!name) {
        els.meta.innerHTML = '';
        return;
      }
      var pages = numPages ? (numPages + (numPages === 1 ? ' page' : ' pages')) : '';
      els.meta.innerHTML =
        '<strong>' + escapeHtml(name) + '</strong>' +
        (pages ? ' · ' + pages : '');
    }

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function updatePage(current, total) {
      if (els.pageInput) {
        els.pageInput.value = String(current);
        els.pageInput.max = String(total);
      }
      if (els.pageCount) els.pageCount.textContent = String(total);
      if (els.prevBtn) els.prevBtn.disabled = current <= 1;
      if (els.nextBtn) els.nextBtn.disabled = current >= total;
    }

    function updateZoom() {
      if (!els.zoomLabel || !renderer) return;
      els.zoomLabel.textContent = H.zoomLabel(renderer.getZoom());
    }

    function onDocReady(name, numPages) {
      setEmpty(false);
      updateMeta(name, numPages);
      updatePage(1, numPages);
      updateZoom();
      setStatus('Ready');
    }

    function onClear() {
      setEmpty(true);
      updateMeta('', 0);
      setStatus('');
    }

    function bindControls() {
      if (els.prevBtn) {
        els.prevBtn.addEventListener('click', function () {
          if (!renderer) return;
          renderer.goToPage(renderer.getCurrentPage() - 1);
        });
      }
      if (els.nextBtn) {
        els.nextBtn.addEventListener('click', function () {
          if (!renderer) return;
          renderer.goToPage(renderer.getCurrentPage() + 1);
        });
      }
      if (els.zoomOutBtn) {
        els.zoomOutBtn.addEventListener('click', function () {
          if (!renderer) return;
          renderer.zoomBy(-1);
          updateZoom();
        });
      }
      if (els.zoomInBtn) {
        els.zoomInBtn.addEventListener('click', function () {
          if (!renderer) return;
          renderer.zoomBy(1);
          updateZoom();
        });
      }
      if (els.fitBtn) {
        els.fitBtn.addEventListener('click', function () {
          if (!renderer) return;
          renderer.fitWidth();
          updateZoom();
        });
      }
      if (els.pageInput) {
        els.pageInput.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            var n = parseInt(els.pageInput.value, 10);
            if (renderer && n >= 1) renderer.goToPage(n);
          }
        });
        els.pageInput.addEventListener('change', function () {
          var n = parseInt(els.pageInput.value, 10);
          if (renderer && n >= 1) renderer.goToPage(n);
        });
      }
    }

    function isTypingTarget(el) {
      if (!el) return false;
      var tag = (el.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      if (el.isContentEditable) return true;
      return false;
    }

    function bindKeyboard() {
      window.addEventListener('keydown', function (e) {
        if (!renderer || !renderer.getDoc()) return;
        if (root.PVDlg && root.PVDlg.isOpen()) return;
        if (isTypingTarget(e.target)) return;

        var page = renderer.getCurrentPage();
        var total = renderer.getNumPages();
        switch (e.key) {
          case 'ArrowLeft':
          case 'PageUp':
            e.preventDefault();
            renderer.goToPage(page - 1);
            break;
          case 'ArrowRight':
          case 'PageDown':
          case ' ':
            e.preventDefault();
            renderer.goToPage(page + 1);
            break;
          case 'Home':
            e.preventDefault();
            renderer.goToPage(1);
            break;
          case 'End':
            e.preventDefault();
            renderer.goToPage(total);
            break;
          case '-':
          case '_':
            e.preventDefault();
            renderer.zoomBy(-1);
            updateZoom();
            break;
          case '+':
          case '=':
            e.preventDefault();
            renderer.zoomBy(1);
            updateZoom();
            break;
          default:
            break;
        }
      });
    }

    bindControls();
    bindKeyboard();

    return {
      setRenderer: setRenderer,
      setStatus: setStatus,
      setEmpty: setEmpty,
      onDocReady: onDocReady,
      onClear: onClear,
      updatePage: updatePage,
      updateZoom: updateZoom,
      getFileName: function () { return fileName; }
    };
  }

  root.PVUi = { createUi: createUi };
})(typeof globalThis !== 'undefined' ? globalThis : this);
