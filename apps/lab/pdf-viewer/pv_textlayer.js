/* PDF Viewer — pv_textlayer.js: native pdf.js + OCR word-box text layers. PV2 */
(function (root) {
  'use strict';

  var M = root.PVOcrMath;

  function removeLayer(slot) {
    if (!slot) return;
    if (slot.textLayer && slot.textLayer.parentNode) {
      slot.textLayer.parentNode.removeChild(slot.textLayer);
    }
    if (slot.textTask && slot.textTask.cancel) {
      try { slot.textTask.cancel(); } catch (e) { /* ignore */ }
    }
    slot.textLayer = null;
    slot.textTask = null;
    slot.textSource = null;
  }

  function ensureLayer(slot) {
    var el = document.createElement('div');
    el.className = 'textLayer';
    el.setAttribute('aria-hidden', 'false');
    slot.el.appendChild(el);
    slot.textLayer = el;
    return el;
  }

  function applyScaleFactor(layer, scale) {
    layer.style.setProperty('--scale-factor', String(scale));
  }

  /**
   * Invisible selectable spans from OCR word boxes (percent of the page).
   */
  function fillOcrLayer(layer, words, imgW, imgH, pageHeightPx) {
    layer.innerHTML = '';
    layer.classList.add('ocr-layer');
    var list = M.normalizeWords(words);
    var i, w, st, span, sx, cssW;
    for (i = 0; i < list.length; i++) {
      w = list[i];
      st = M.wordBoxToLayer(w.bbox, imgW, imgH);
      span = document.createElement('span');
      span.textContent = w.text + ' ';
      span.style.left = st.leftPct + '%';
      span.style.top = st.topPct + '%';
      span.style.width = st.widthPct + '%';
      span.style.height = st.heightPct + '%';
      span.style.fontSize = M.fontSizePx(st.fontSizePct, pageHeightPx) + 'px';
      span.dataset.word = '1';
      layer.appendChild(span);
      cssW = (st.widthPct / 100) * (layer.clientWidth || layer.offsetWidth || 0);
      sx = M.scaleXFit(cssW, span.offsetWidth);
      if (sx !== 1) {
        span.style.transform = 'scaleX(' + sx + ')';
        span.style.transformOrigin = '0 0';
      }
    }
  }

  async function fillNativeLayer(layer, page, scale) {
    if (!root.pdfjsLib || !root.pdfjsLib.renderTextLayer) return false;
    var tc = await page.getTextContent();
    var text = M.joinPageText(tc.items || []);
    if (!M.hasRealText(text)) return false;
    var viewport = page.getViewport({ scale: scale });
    applyScaleFactor(layer, viewport.scale);
    var task = root.pdfjsLib.renderTextLayer({
      textContentSource: tc,
      container: layer,
      viewport: viewport,
      textDivs: []
    });
    return { task: task, text: text, promise: task && task.promise };
  }

  /**
   * Attach the right text layer for a rendered slot.
   * opts.ocr: { words, imgW, imgH, text } when this page was OCR'd
   * opts.nativeText: optional pre-checked flag (false = skip native)
   */
  async function attach(slot, opts) {
    opts = opts || {};
    removeLayer(slot);
    if (!slot || !slot.el) return { source: null, text: '' };
    var layer = ensureLayer(slot);
    var pageHeightPx = slot.el.clientHeight || slot.el.offsetHeight || 0;

    if (opts.ocr && opts.ocr.words && opts.ocr.words.length) {
      fillOcrLayer(layer, opts.ocr.words, opts.ocr.imgW, opts.ocr.imgH, pageHeightPx);
      slot.textSource = 'ocr';
      return { source: 'ocr', text: opts.ocr.text || '' };
    }
    if (opts.ocr && opts.ocr.text) {
      layer.innerHTML = '';
      layer.classList.add('ocr-layer');
      var block = document.createElement('span');
      block.className = 'ocr-block';
      block.textContent = opts.ocr.text;
      block.style.left = '0';
      block.style.top = '0';
      block.style.width = '100%';
      block.style.height = '100%';
      block.style.fontSize = Math.max(8, Math.round(pageHeightPx / 60)) + 'px';
      block.style.whiteSpace = 'pre-wrap';
      block.style.lineHeight = '1.3';
      layer.appendChild(block);
      slot.textSource = 'ocr';
      return { source: 'ocr', text: opts.ocr.text };
    }

    if (opts.nativeText === false) {
      removeLayer(slot);
      return { source: null, text: '' };
    }

    var page = opts.page;
    var scale = opts.scale || 1;
    if (!page) {
      removeLayer(slot);
      return { source: null, text: '' };
    }
    try {
      var native = await fillNativeLayer(layer, page, scale);
      if (!native) {
        removeLayer(slot);
        return { source: null, text: '' };
      }
      slot.textTask = native.task;
      if (native.promise) {
        try { await native.promise; } catch (e) {
          if (e && /cancel/i.test(e.message || e.name || '')) return { source: null, text: '' };
          throw e;
        }
      }
      if (slot.textLayer !== layer) return { source: null, text: '' };
      slot.textSource = 'native';
      return { source: 'native', text: native.text };
    } catch (e) {
      removeLayer(slot);
      throw e;
    }
  }

  function highlight(layer, query, currentStart, currentEnd) {
    if (!layer) return;
    var spans = layer.querySelectorAll('span');
    var i, s;
    for (i = 0; i < spans.length; i++) {
      spans[i].classList.remove('hl', 'hl-current');
    }
    var q = String(query || '').trim();
    if (!q || !spans.length) return;

    var map = [];
    var joined = '';
    for (i = 0; i < spans.length; i++) {
      s = spans[i].textContent || '';
      var k;
      for (k = 0; k < s.length; k++) map.push(i);
      joined += s;
    }
    var low = joined.toLowerCase();
    var needle = q.toLowerCase();
    var from = 0, idx, a, b, spanSet, si;
    var currentSet = Object.create(null);
    if (currentStart != null && currentEnd != null && currentEnd > currentStart) {
      for (a = currentStart; a < currentEnd && a < map.length; a++) currentSet[map[a]] = true;
    }
    while ((idx = low.indexOf(needle, from)) !== -1) {
      spanSet = Object.create(null);
      for (a = idx, b = Math.min(idx + needle.length, map.length); a < b; a++) {
        spanSet[map[a]] = true;
      }
      for (si in spanSet) {
        s = spans[Number(si)];
        if (!s) continue;
        s.classList.add('hl');
        if (currentSet[Number(si)]) s.classList.add('hl-current');
      }
      from = idx + needle.length;
    }
  }

  function clearHighlights(layer) {
    if (!layer) return;
    var spans = layer.querySelectorAll('span.hl, span.hl-current');
    for (var i = 0; i < spans.length; i++) {
      spans[i].classList.remove('hl', 'hl-current');
    }
  }

  root.PVTextLayer = {
    attach: attach,
    remove: removeLayer,
    highlight: highlight,
    clearHighlights: clearHighlights,
    fillOcrLayer: fillOcrLayer
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
