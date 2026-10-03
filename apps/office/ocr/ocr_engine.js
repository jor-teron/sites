/*
 * OCR — ocr_engine.js
 * Text recognition engines:
 *   - Tesseract.js: ONE worker, created on first use and reused for every page/file.
 *     Progress is reported through the onProgress callback of the running job.
 *   - Google Cloud Vision (DOCUMENT_TEXT_DETECTION) with the user's API key.
 * Input is always a canvas (already scaled down by the caller).
 */
(function (OCR) {
  'use strict';

  const E = OCR.engine = {};
  const cfg = () => OCR.config;
  let worker = null, workerPromise = null, progressFn = null, inFlight = false;
  let cancelReject = null, abortCtl = null;
  const cancelledError = () => Object.assign(new Error(OCR.config.text.status.cancelled), { cancelled: true });
  let keyMode = 'header';   // Cloud Vision: send the key as x-goog-api-key header, else ?key=

  function engineError(err) {
    const S = cfg().text.status;
    const e = new Error(location.protocol === 'file:' ? S.engineFileUrl : S.engineFailed);
    e.cause = err;
    return e;
  }

  E.getWorker = () => {
    if (worker) return Promise.resolve(worker);
    if (workerPromise) return workerPromise;
    if (typeof Tesseract === 'undefined') return Promise.reject(engineError(new Error('Tesseract missing')));
    const T = cfg().tesseract;
    OCR.status(cfg().text.status.loadingEngine, 'work');
    const create = Tesseract.createWorker(T.lang, T.oem, {
      workerPath: OCR.absUrl(T.workerPath),
      corePath: OCR.absUrl(T.corePath),
      langPath: OCR.absUrl(T.langPath),
      cacheMethod: 'none',               // files are local; the browser cache is enough
      logger: (m) => {
        if (m && m.status === 'recognizing text' && progressFn) progressFn(m.progress || 0);
      },
      errorHandler: (e) => console.warn('[ocr] worker error', e)
    });
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('engine start timed out')), T.initTimeoutMs));
    workerPromise = Promise.race([create, timeout]).then((w) => {
      worker = w; workerPromise = null; return w;
    }, (err) => {
      workerPromise = null;
      create.then((w) => w && w.terminate()).catch(() => {});
      throw engineError(err);
    });
    return workerPromise;
  };

  E.tesseract = async (canvas, onProgress) => {
    const w = await E.getWorker();
    progressFn = onProgress || null;
    inFlight = true;
    const cancelP = new Promise((_, rej) => { cancelReject = rej; });
    try {
      const r = await Promise.race([w.recognize(canvas), cancelP]);
      return (r && r.data && r.data.text) || '';
    } finally {
      inFlight = false; progressFn = null; cancelReject = null;
    }
  };

  // Stop a running recognition at once: a busy Tesseract worker is terminated (a new one
  // is made next time), a Cloud Vision request is aborted.
  E.cancel = () => {
    if (inFlight && worker) {
      const w = worker; worker = null; inFlight = false; progressFn = null;
      try { w.terminate(); } catch (_) { /* ignore */ }
    }
    if (cancelReject) { const r = cancelReject; cancelReject = null; r(cancelledError()); }
    if (abortCtl) { try { abortCtl.abort(); } catch (_) { /* ignore */ } }
  };

  // ----- Google Cloud Vision -----
  E.getKey = () => { try { return localStorage.getItem(cfg().storage.key) || ''; } catch (_) { return ''; } };
  E.setKey = (k) => {
    try { if (k) localStorage.setItem(cfg().storage.key, k); else localStorage.removeItem(cfg().storage.key); } catch (_) { /* ignore */ }
  };

  async function visionFetch(b64, key, mode) {
    const V = cfg().vision;
    const body = JSON.stringify({ requests: [{ image: { content: b64 }, features: [{ type: V.feature }] }] });
    const headers = { 'Content-Type': 'application/json' };
    let url = V.url;
    if (mode === 'header') headers['x-goog-api-key'] = key;
    else url += '?key=' + encodeURIComponent(key);
    return fetch(url, { method: 'POST', headers: headers, body: body, signal: abortCtl ? abortCtl.signal : undefined });
  }

  E.vision = async (canvas, onProgress) => {
    const key = E.getKey();
    if (!key) throw new Error(cfg().text.status.needKey);
    if (onProgress) onProgress(0.1);
    const b64 = canvas.toDataURL('image/jpeg', cfg().vision.jpegQuality).split(',')[1];
    if (onProgress) onProgress(0.3);
    let res;
    abortCtl = window.AbortController ? new AbortController() : null;
    try {
      res = await visionFetch(b64, key, keyMode);
    } catch (err) {
      if (err && err.name === 'AbortError') { abortCtl = null; throw cancelledError(); }
      if (keyMode === 'header' && navigator.onLine !== false) {
        // header blocked (e.g. by a proxy / CORS): fall back to the query-string key once
        try { res = await visionFetch(b64, key, 'query'); keyMode = 'query'; }
        catch (_) { throw new Error(cfg().text.status.visionOffline); }
      } else throw new Error(cfg().text.status.visionOffline);
    }
    abortCtl = null;
    if (onProgress) onProgress(0.9);
    let json = {};
    try { json = await res.json(); } catch (_) { json = {}; }
    if (!res.ok) throw new Error('Cloud Vision: ' + ((json.error && json.error.message) || ('HTTP ' + res.status)));
    const a = json.responses && json.responses[0];
    if (a && a.error && a.error.message) throw new Error('Cloud Vision: ' + a.error.message);
    if (a && a.fullTextAnnotation && a.fullTextAnnotation.text) return a.fullTextAnnotation.text;
    if (a && a.textAnnotations && a.textAnnotations[0]) return a.textAnnotations[0].description || '';
    return '';
  };

  // Recognize a canvas with the selected engine.
  E.recognize = (canvas, onProgress) =>
    (OCR.state.engine === 'vision' ? E.vision(canvas, onProgress) : E.tesseract(canvas, onProgress));

  // Draw any image source into a canvas, scaled so the longest side is <= maxSide.
  E.toCanvas = (src, w, h, maxSide) => {
    const k = Math.min(1, maxSide / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);      // transparent PNGs: white paper
    x.imageSmoothingQuality = 'high';
    x.drawImage(src, 0, 0, c.width, c.height);
    return c;
  };
})(window.OCR);
