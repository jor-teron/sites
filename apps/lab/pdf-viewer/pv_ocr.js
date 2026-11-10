/* PDF Viewer — pv_ocr.js: lazy Tesseract OCR, IndexedDB cache, one page at a time. PV2 */
(function (root) {
  'use strict';

  var M = root.PVOcrMath;

  var VENDOR = '../../office/ocr/vendor/';
  var DB_NAME = 'pdfviewer-ocr';
  var DB_STORE = 'ocrPages';
  var LANGS = [{ id: 'eng', label: 'English' }]; // only traineddata in the repo
  var INIT_TIMEOUT_MS = 45000;

  function absUrl(rel) {
    try {
      return new URL(rel, document.baseURI || root.location.href).href;
    } catch (e) {
      return rel;
    }
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-pv-ocr="' + src + '"]');
      if (existing) {
        if (root.Tesseract) return resolve();
        existing.addEventListener('load', function () { resolve(); });
        existing.addEventListener('error', function () { reject(new Error('Failed to load OCR engine')); });
        return;
      }
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.dataset.pvOcr = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('Failed to load OCR engine')); };
      document.head.appendChild(s);
    });
  }

  var enginePromise = null;
  function ensureEngine() {
    if (root.Tesseract) return Promise.resolve();
    if (enginePromise) return enginePromise;
    enginePromise = loadScript(absUrl(VENDOR + 'tesseract.min.js')).then(function () {
      if (!root.Tesseract) throw new Error('OCR engine failed to load');
    }).catch(function (err) {
      enginePromise = null;
      throw err;
    });
    return enginePromise;
  }

  var dbPromise = null;
  function openDb() {
    if (dbPromise) return dbPromise;
    if (!root.indexedDB) return Promise.resolve(null);
    dbPromise = new Promise(function (resolve) {
      try {
        var req = root.indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { dbPromise = null; resolve(null); };
      } catch (e) {
        dbPromise = null;
        resolve(null);
      }
    });
    return dbPromise;
  }

  function idbGet(key) {
    return openDb().then(function (db) {
      if (!db) return null;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(DB_STORE, 'readonly');
          var req = tx.objectStore(DB_STORE).get(key);
          req.onsuccess = function () { resolve(req.result || null); };
          req.onerror = function () { resolve(null); };
        } catch (e) { resolve(null); }
      });
    });
  }

  function idbSet(key, value) {
    return openDb().then(function (db) {
      if (!db) return;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(DB_STORE, 'readwrite');
          tx.objectStore(DB_STORE).put(value, key);
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { resolve(); };
        } catch (e) { resolve(); }
      });
    });
  }

  function createController(opts) {
    opts = opts || {};
    var onStatus = opts.onStatus || function () {};
    var onPageOcr = opts.onPageOcr || function () {};

    var mem = Object.create(null); // pageNum -> result
    var fingerprint = '';
    var doc = null;
    var file = null;
    var lang = 'eng';
    try { lang = root.localStorage.getItem('pv2-ocr-lang') || 'eng'; } catch (e) { /* ignore */ }
    if (!LANGS.some(function (l) { return l.id === lang; })) lang = 'eng';

    var worker = null;
    var workerPromise = null;
    var cancelled = false;
    var running = false;
    var job = null; // { kind, from, to, current }

    function setLang(id) {
      if (!LANGS.some(function (l) { return l.id === id; })) return lang;
      lang = id;
      try { root.localStorage.setItem('pv2-ocr-lang', lang); } catch (e) { /* ignore */ }
      return lang;
    }

    function resetDocument(pdfDoc, pdfFile) {
      mem = Object.create(null);
      doc = pdfDoc || null;
      file = pdfFile || null;
      fingerprint = M.docId(doc, file);
      cancelled = false;
    }

    function cacheKey(pageNum) {
      return M.pageCacheKey(fingerprint, pageNum, lang);
    }

    async function loadCached(pageNum) {
      if (mem[pageNum]) return mem[pageNum];
      var rec = await idbGet(cacheKey(pageNum));
      if (rec && rec.words) {
        mem[pageNum] = rec;
        return rec;
      }
      return null;
    }

    async function warmupCache(pageNums) {
      var i, rec;
      for (i = 0; i < (pageNums || []).length; i++) {
        rec = await loadCached(pageNums[i]);
        if (rec) onPageOcr(pageNums[i], rec);
      }
    }

    function getCached(pageNum) {
      return mem[pageNum] || null;
    }

    function allCachedText() {
      var nums = Object.keys(mem).map(Number).sort(function (a, b) { return a - b; });
      var parts = [];
      var i, rec;
      for (i = 0; i < nums.length; i++) {
        rec = mem[nums[i]];
        if (!rec || !rec.text) continue;
        parts.push('— Page ' + nums[i] + ' —\n' + rec.text);
      }
      return parts.join('\n\n');
    }

    function terminateWorker() {
      var w = worker;
      worker = null;
      workerPromise = null;
      if (w) {
        try { w.terminate(); } catch (e) { /* ignore */ }
      }
    }

    function cancel() {
      cancelled = true;
      terminateWorker();
      running = false;
      job = null;
    }

    function cancelledError() {
      var e = new Error('Cancelled');
      e.cancelled = true;
      return e;
    }

    async function getWorker(onProgress) {
      if (worker) return worker;
      if (workerPromise) return workerPromise;
      if (typeof root.Tesseract === 'undefined') {
        onStatus('Loading OCR engine…', 'busy');
        await ensureEngine();
      }
      if (location.protocol === 'file:') {
        throw new Error('OCR engine cannot start from file:// — open the app over http(s)');
      }
      onStatus('Loading OCR engine…', 'busy');
      var create = root.Tesseract.createWorker(lang, 1, {
        workerPath: absUrl(VENDOR + 'worker.min.js'),
        corePath: absUrl(VENDOR),
        langPath: absUrl(VENDOR + 'lang/'),
        cacheMethod: 'none',
        logger: function (m) {
          if (m && m.status === 'recognizing text' && onProgress) {
            onProgress(m.progress || 0);
          }
        },
        errorHandler: function (e) { console.warn('[pv2] OCR worker', e); }
      });
      var timeout = new Promise(function (_, rej) {
        setTimeout(function () { rej(new Error('OCR engine start timed out')); }, INIT_TIMEOUT_MS);
      });
      workerPromise = Promise.race([create, timeout]).then(function (w) {
        worker = w;
        workerPromise = null;
        return w;
      }, function (err) {
        workerPromise = null;
        create.then(function (w) { if (w && w.terminate) w.terminate(); }).catch(function () {});
        var msg = (err && err.message) || 'OCR engine failed to load';
        throw new Error(msg);
      });
      return workerPromise;
    }

    async function renderPageCanvas(pageNum) {
      var page = await doc.getPage(pageNum);
      var base = page.getViewport({ scale: 1 });
      var scale = M.ocrRenderScale(base.width, base.height, M.OCR_SCALE, M.OCR_SCALE, M.OCR_MAX_SIDE);
      var vp = page.getViewport({ scale: scale });
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.floor(vp.width));
      c.height = Math.max(1, Math.floor(vp.height));
      var ctx = c.getContext('2d', { alpha: false });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      try { page.cleanup(); } catch (e) { /* ignore */ }
      return c;
    }

    async function recognizePage(pageNum, onProgress) {
      if (cancelled) throw cancelledError();
      var hit = await loadCached(pageNum);
      if (hit) return hit;

      var canvas = await renderPageCanvas(pageNum);
      var imgW = canvas.width;
      var imgH = canvas.height;
      if (cancelled) {
        canvas.width = 0; canvas.height = 0;
        throw cancelledError();
      }
      var w = await getWorker(onProgress);
      if (cancelled) {
        canvas.width = 0; canvas.height = 0;
        throw cancelledError();
      }
      var result;
      try {
        result = await w.recognize(canvas);
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
      if (cancelled) throw cancelledError();
      var data = (result && result.data) || {};
      var rec = {
        fingerprint: fingerprint,
        page: pageNum,
        lang: lang,
        text: (data.text || '').trim(),
        words: M.normalizeWords(data.words || []),
        imgW: imgW,
        imgH: imgH,
        ts: Date.now()
      };
      mem[pageNum] = rec;
      await idbSet(cacheKey(pageNum), rec);
      return rec;
    }

    async function runPages(pageNums, onProgress) {
      if (running) throw new Error('OCR is already running');
      if (!doc) throw new Error('Open a PDF first');
      cancelled = false;
      running = true;
      job = { pages: pageNums.slice(), index: 0 };
      var total = pageNums.length;
      var done = 0;
      var i, n, rec;
      try {
        await ensureEngine();
        for (i = 0; i < pageNums.length; i++) {
          if (cancelled) throw cancelledError();
          n = pageNums[i];
          job.index = i;
          if (onProgress) onProgress({ page: n, index: i, total: total, fraction: i / total, phase: 'page' });
          onStatus('OCR page ' + n + ' / ' + (pageNums[pageNums.length - 1]) + ' (' + (i + 1) + ' of ' + total + ')', 'busy');
          rec = await recognizePage(n, function (p) {
            var frac = (i + (p || 0)) / total;
            if (onProgress) onProgress({ page: n, index: i, total: total, fraction: frac, phase: 'recognize' });
          });
          done += 1;
          onPageOcr(n, rec);
        }
        onStatus(done ? ('OCR done — ' + done + (done === 1 ? ' page' : ' pages')) : 'No pages to OCR');
        return done;
      } catch (e) {
        if (e && e.cancelled) {
          onStatus('OCR cancelled');
          throw e;
        }
        onStatus((e && e.message) || 'OCR failed', 'error');
        throw e;
      } finally {
        terminateWorker();
        running = false;
        job = null;
      }
    }

    function isRunning() { return running; }
    function currentJob() { return job; }
    function getLang() { return lang; }
    function getLangs() { return LANGS.slice(); }
    function getFingerprint() { return fingerprint; }

    return {
      resetDocument: resetDocument,
      setLang: setLang,
      getLang: getLang,
      getLangs: getLangs,
      getFingerprint: getFingerprint,
      loadCached: loadCached,
      getCached: getCached,
      warmupCache: warmupCache,
      allCachedText: allCachedText,
      runPages: runPages,
      cancel: cancel,
      isRunning: isRunning,
      currentJob: currentJob,
      ensureEngine: ensureEngine,
      VENDOR: VENDOR,
      LANGS: LANGS
    };
  }

  root.PVOcr = {
    createController: createController,
    ensureEngine: ensureEngine,
    LANGS: LANGS,
    VENDOR: VENDOR,
    DB_NAME: DB_NAME
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
