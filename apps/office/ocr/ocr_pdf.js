/*
 * OCR — ocr_pdf.js
 * PDFs with pdf.js 3.11 (legacy UMD build, plain script tag → window.pdfjsLib).
 * For each page the real text layer is read first (instant and exact for digital PDFs);
 * only a page with little or no text (a scan / photo) is rendered and OCR'd.
 */
(function (OCR) {
  'use strict';

  const P = OCR.pdf = {};
  const cfg = () => OCR.config.pdf;

  P.available = () => typeof window.pdfjsLib !== 'undefined';

  P.init = () => {
    if (!P.available()) return;
    pdfjsLib.GlobalWorkerOptions.workerSrc = OCR.absUrl(cfg().workerSrc);
  };

  P.load = async (file) => {
    if (!P.available()) throw new Error('PDF reader failed to load');
    const data = new Uint8Array(await file.arrayBuffer());
    try {
      return await pdfjsLib.getDocument({
        data: data,
        standardFontDataUrl: OCR.absUrl(cfg().standardFontDataUrl),
        isEvalSupported: false
      }).promise;
    } catch (err) {
      if (err && (err.name === 'PasswordException' || /password/i.test(err.message || ''))) {
        throw new Error(OCR.config.text.status.password);
      }
      throw err;
    }
  };

  // Text layer of one page, in reading order, lines kept.
  P.pageText = async (pdf, n) => {
    const page = await pdf.getPage(n);
    const tc = await page.getTextContent();
    let out = '', lastY = null;
    for (const it of tc.items) {
      if (typeof it.str !== 'string') continue;
      const y = it.transform ? it.transform[5] : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > Math.max(2, (it.height || 0) * 0.5) && !/\n$/.test(out)) out += '\n';
      out += it.str;
      if (it.hasEOL) out += '\n';
      if (y !== null) lastY = y;
    }
    return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  };

  P.hasRealText = (text) => (text.match(/[\p{L}\p{N}]/gu) || []).length >= cfg().minTextChars;

  // Render a page to a canvas: scale, capped so the longest side is <= maxSide.
  P.renderPage = async (pdf, n, scale, maxSide) => {
    const page = await pdf.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const s = Math.min(scale, maxSide / Math.max(base.width, base.height));
    const vp = page.getViewport({ scale: s });
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.floor(vp.width)); c.height = Math.max(1, Math.floor(vp.height));
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    page.cleanup();
    return c;
  };

  P.renderPreview = (pdf, n) => P.renderPage(pdf, n, 4, cfg().previewMaxSide);

  // Text of one page: text layer if it has enough text, else OCR of the rendered page.
  // Returns { text, method: 'text' | 'ocr' }.
  P.readPage = async (pdf, n, onProgress) => {
    const t = await P.pageText(pdf, n);
    if (P.hasRealText(t)) { if (onProgress) onProgress(1); return { text: t, method: 'text' }; }
    const c = await P.renderPage(pdf, n, cfg().ocrScale, cfg().ocrMaxSide);
    try {
      const text = await OCR.engine.recognize(c, onProgress);
      return { text: text, method: 'ocr' };
    } finally { c.width = 0; c.height = 0; }
  };
})(window.OCR);
