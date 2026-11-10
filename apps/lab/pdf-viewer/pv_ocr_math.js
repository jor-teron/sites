/* PDF Viewer — pv_ocr_math.js: pure OCR / text-layer helpers. PV2 */
(function (root) {
  'use strict';

  var MIN_TEXT_CHARS = 20;
  var OCR_SCALE = 2;
  var OCR_MAX_SIDE = 2048;

  function countLetters(text) {
    var s = String(text || '');
    try {
      return (s.match(/[\p{L}\p{N}]/gu) || []).length;
    } catch (e) {
      return (s.match(/[A-Za-z0-9]/g) || []).length;
    }
  }

  function hasRealText(text, minChars) {
    var min = minChars == null ? MIN_TEXT_CHARS : Math.max(0, minChars | 0);
    return countLetters(text) >= min;
  }

  function pageCacheKey(fingerprint, pageNum, lang) {
    var fp = String(fingerprint || 'unknown');
    var n = Math.max(1, Number(pageNum) | 0);
    var lg = String(lang || 'eng');
    return fp + '|' + n + '|' + lg;
  }

  /**
   * Render scale for OCR: wanted scale (default 2), never above maxScale,
   * and longest page side * scale never above maxSide.
   */
  function ocrRenderScale(pageW, pageH, wanted, maxScale, maxSide) {
    var w = Math.max(1, Number(pageW) || 1);
    var h = Math.max(1, Number(pageH) || 1);
    var want = Number(wanted);
    if (!isFinite(want) || want <= 0) want = OCR_SCALE;
    var cap = Number(maxScale);
    if (!isFinite(cap) || cap <= 0) cap = OCR_SCALE;
    var side = Number(maxSide);
    if (!isFinite(side) || side <= 0) side = OCR_MAX_SIDE;
    var s = Math.min(want, cap);
    var longest = Math.max(w, h);
    if (longest * s > side) s = side / longest;
    return Math.max(0.25, s);
  }

  /**
   * Convert an OCR word box in image pixels to percentages of the page,
   * so the invisible text layer scales with zoom.
   * bbox: {x0,y0,x1,y1} in the same space as imgW x imgH.
   */
  function wordBoxToLayer(bbox, imgW, imgH) {
    var iw = Math.max(1, Number(imgW) || 1);
    var ih = Math.max(1, Number(imgH) || 1);
    var b = bbox || {};
    var x0 = Number(b.x0);
    var y0 = Number(b.y0);
    var x1 = Number(b.x1);
    var y1 = Number(b.y1);
    if (!isFinite(x0)) x0 = 0;
    if (!isFinite(y0)) y0 = 0;
    if (!isFinite(x1)) x1 = x0;
    if (!isFinite(y1)) y1 = y0;
    if (x1 < x0) { var tx = x0; x0 = x1; x1 = tx; }
    if (y1 < y0) { var ty = y0; y0 = y1; y1 = ty; }
    var bw = Math.max(0, x1 - x0);
    var bh = Math.max(0, y1 - y0);
    return {
      leftPct: (x0 / iw) * 100,
      topPct: (y0 / ih) * 100,
      widthPct: (bw / iw) * 100,
      heightPct: (bh / ih) * 100,
      fontSizePct: (bh / ih) * 100,
      fontSizePx: function (pageHeightPx) {
        return Math.max(1, (bh / ih) * Math.max(1, Number(pageHeightPx) || 1));
      }
    };
  }

  function fontSizePx(heightPct, pageHeightPx) {
    var hp = Math.max(0, Number(heightPct) || 0);
    var ph = Math.max(1, Number(pageHeightPx) || 1);
    return Math.max(1, (hp / 100) * ph);
  }

  /**
   * Horizontal stretch so the glyph width matches the OCR box.
   * Returns 1 when measurement is missing or already close.
   */
  function scaleXFit(cssWidthPx, measuredWidthPx) {
    var css = Number(cssWidthPx);
    var meas = Number(measuredWidthPx);
    if (!isFinite(css) || !isFinite(meas) || css <= 0 || meas <= 0) return 1;
    var sx = css / meas;
    if (!isFinite(sx) || sx <= 0) return 1;
    if (Math.abs(sx - 1) < 0.02) return 1;
    // Guard against wild Tesseract boxes.
    if (sx > 8) return 8;
    if (sx < 0.15) return 0.15;
    return sx;
  }

  function normalizeWords(raw) {
    var out = [];
    var list = raw || [];
    var i, w, bbox, text;
    for (i = 0; i < list.length; i++) {
      w = list[i] || {};
      text = (w.text != null ? w.text : w.str);
      if (text == null) continue;
      text = String(text);
      if (!text.trim()) continue;
      bbox = w.bbox || w.bBox || w;
      if (bbox.x0 == null && w.bbox == null && (w.x0 == null)) continue;
      var box = {
        x0: Number(bbox.x0),
        y0: Number(bbox.y0),
        x1: Number(bbox.x1),
        y1: Number(bbox.y1)
      };
      if (![box.x0, box.y0, box.x1, box.y1].every(isFinite)) continue;
      if (box.x1 === box.x0 && box.y1 === box.y0) continue;
      out.push({ text: text, bbox: box, confidence: Number(w.confidence) });
    }
    return out;
  }

  function findMatches(pageTexts, query) {
    var q = String(query || '').trim().toLowerCase();
    var matches = [];
    if (!q) return matches;
    var i, text, from, idx;
    for (i = 0; i < pageTexts.length; i++) {
      text = String(pageTexts[i] || '').toLowerCase();
      from = 0;
      while ((idx = text.indexOf(q, from)) !== -1) {
        matches.push({ page: i + 1, start: idx, end: idx + q.length });
        from = idx + q.length;
      }
    }
    return matches;
  }

  function nextMatchIndex(current, total, dir) {
    var t = Math.max(0, Number(total) | 0);
    if (t < 1) return -1;
    var c = Number(current);
    if (!isFinite(c)) c = -1;
    var d = dir < 0 ? -1 : 1;
    if (c < 0) return d > 0 ? 0 : t - 1;
    var n = c + d;
    if (n < 0) return t - 1;
    if (n >= t) return 0;
    return n;
  }

  function docId(doc, file) {
    if (doc) {
      if (doc.fingerprints && doc.fingerprints[0]) return String(doc.fingerprints[0]);
      if (doc.fingerprint) return String(doc.fingerprint);
    }
    if (file) {
      return 'file:' + (file.name || '') + ':' + (file.size || 0) + ':' + (file.lastModified || 0);
    }
    return 'unknown';
  }

  function joinPageText(items) {
    var out = '';
    var i, it;
    for (i = 0; i < (items || []).length; i++) {
      it = items[i];
      if (typeof it === 'string') {
        out += it;
        continue;
      }
      if (it && typeof it.str === 'string') {
        out += it.str;
        if (it.hasEOL) out += '\n';
        else out += ' ';
      }
    }
    return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
  }

  var api = {
    MIN_TEXT_CHARS: MIN_TEXT_CHARS,
    OCR_SCALE: OCR_SCALE,
    OCR_MAX_SIDE: OCR_MAX_SIDE,
    countLetters: countLetters,
    hasRealText: hasRealText,
    pageCacheKey: pageCacheKey,
    ocrRenderScale: ocrRenderScale,
    wordBoxToLayer: wordBoxToLayer,
    fontSizePx: fontSizePx,
    scaleXFit: scaleXFit,
    normalizeWords: normalizeWords,
    findMatches: findMatches,
    nextMatchIndex: nextMatchIndex,
    docId: docId,
    joinPageText: joinPageText
  };

  root.PVOcrMath = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
