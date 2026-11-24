/**
 * Lab & Scan Explainer - OCR & Report Text Parser (ocr-parser.js)
 * LAB-1c: on-phone Tesseract (Office OCR vendor, lazy-loaded), optional Google Vision
 * using the Hub API Keys 'gvision' key, and unit-aware report parsing.
 */
(function (global) {
  'use strict';

  var LEGACY_KEY = 'lab_tests_google_vision_key';
  var VISION_URL = 'https://vision.googleapis.com/v1/images:annotate';
  var TESS_VENDOR = '../../office/ocr/vendor/';
  var TESS_LANG = 'eng';
  var TESS_OEM = 1;
  var TESS_TIMEOUT_MS = 45000;
  var tessWorker = null;
  var tessLoading = null;
  var tessProgress = null;
  var visionKeyMode = 'header';
  var legacyKeyCleared = false;

  function clearLegacyApiKey() {
    if (legacyKeyCleared) return;
    legacyKeyCleared = true;
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(LEGACY_KEY);
    } catch (_) { /* blocked */ }
  }

  function hubKeysApi() {
    try {
      if (global.top && global.top.HubKeys && typeof global.top.HubKeys.get === 'function') {
        return global.top.HubKeys;
      }
    } catch (_) { /* cross-origin */ }
    if (global.HubKeys && typeof global.HubKeys.get === 'function') return global.HubKeys;
    return null;
  }

  // Read-only: HubKeys.get('gvision') when the Hub (or same-origin API) is present,
  // else the same sites-hub.credentials store the API Keys app writes.
  function getVisionKey(callback) {
    var api = hubKeysApi();
    if (api) {
      Promise.resolve(api.get('gvision')).then(function (v) {
        callback(null, (typeof v === 'string' && v) ? v : '');
      }).catch(function () {
        callback(null, '');
      });
      return;
    }
    try {
      var rec = JSON.parse(localStorage.getItem('sites-hub.credentials') || 'null');
      var keys = rec && rec.keys;
      var v = keys && typeof keys.gvision === 'string' ? keys.gvision.trim() : '';
      callback(null, v);
    } catch (_) {
      callback(null, '');
    }
  }

  function openApiKeys() {
    var api = hubKeysApi();
    if (api && typeof api.open === 'function') {
      try { api.open('gvision'); return; } catch (_) { /* fall through */ }
    }
    var href = '../../system/api-keys/#keys/gvision';
    try { href = new URL(href, global.location && global.location.href).href; } catch (_) { /* keep relative */ }
    if (global.open) global.open(href, '_blank', 'noopener');
  }

  function visionFetch(cleanBase64, key, mode, callback) {
    var headers = { 'Content-Type': 'application/json' };
    var url = VISION_URL;
    if (mode === 'header') headers['x-goog-api-key'] = key;
    else url += '?key=' + encodeURIComponent(key);
    var body = JSON.stringify({
      requests: [{
        image: { content: cleanBase64 },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }]
      }]
    });
    return fetch(url, { method: 'POST', headers: headers, body: body });
  }

  function callGoogleVision(base64Data, apiKey, callback) {
    function run(key) {
      if (!key) {
        callback(new Error('No Google Cloud Vision key in Hub › API Keys (gvision). Open API Keys, add a Cloud Vision key, then try again. Or use “On this phone” or paste the report text.'));
        return;
      }
      var cleanBase64 = String(base64Data || '').replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

      function handleRes(res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) {
            var msg = (data && data.error && data.error.message) || ('API request failed with status ' + res.status);
            throw new Error(msg);
          }
          var response = data.responses && data.responses[0];
          if (!response) throw new Error('Empty response from Google Vision API.');
          if (response.error) throw new Error(response.error.message || 'Vision API returned an error.');
          var text = (response.fullTextAnnotation && response.fullTextAnnotation.text) || '';
          if (!text && response.textAnnotations && response.textAnnotations.length) {
            text = response.textAnnotations[0].description || '';
          }
          return text;
        });
      }

      visionFetch(cleanBase64, key, visionKeyMode)
        .then(handleRes)
        .then(function (text) { callback(null, text); })
        .catch(function (err) {
          if (visionKeyMode === 'header') {
            visionKeyMode = 'query';
            visionFetch(cleanBase64, key, 'query')
              .then(handleRes)
              .then(function (text) { callback(null, text); })
              .catch(function (err2) { callback(err2); });
            return;
          }
          callback(err);
        });
    }

    if (apiKey) run(apiKey);
    else getVisionKey(function (_, key) { run(key); });
  }

  function tessUrl(rel) {
    var base = (global.location && global.location.href) ? global.location.href : 'https://example.invalid/apps/learn/lab-tests/lab-tests.html';
    return new URL(TESS_VENDOR + (rel || ''), base).href;
  }

  function loadTesseractScript() {
    return new Promise(function (resolve, reject) {
      if (typeof global.Tesseract !== 'undefined') { resolve(); return; }
      if (typeof document === 'undefined') {
        reject(new Error('On-phone OCR needs a browser.'));
        return;
      }
      if (global.location && global.location.protocol === 'file:') {
        reject(new Error('On-phone OCR cannot start from file:// — open the app over http(s).'));
        return;
      }
      var s = document.createElement('script');
      s.src = tessUrl('tesseract.min.js');
      s.onload = function () { resolve(); };
      s.onerror = function () {
        reject(new Error('Could not load the on-phone OCR engine from the Office OCR files.'));
      };
      document.head.appendChild(s);
    });
  }

  function getTesseractWorker() {
    if (tessWorker) return Promise.resolve(tessWorker);
    if (tessLoading) return tessLoading;
    tessLoading = loadTesseractScript().then(function () {
      var create = global.Tesseract.createWorker(TESS_LANG, TESS_OEM, {
        workerPath: tessUrl('worker.min.js'),
        corePath: tessUrl(''),
        langPath: tessUrl('lang/'),
        cacheMethod: 'none',
        logger: function (m) {
          if (m && m.status === 'recognizing text' && typeof tessProgress === 'function') {
            tessProgress(m.progress || 0, m.status);
          } else if (m && m.status && typeof tessProgress === 'function' && m.status !== 'recognizing text') {
            tessProgress(m.progress || 0, m.status);
          }
        }
      });
      var timeout = new Promise(function (_, rej) {
        setTimeout(function () { rej(new Error('On-phone OCR engine start timed out')); }, TESS_TIMEOUT_MS);
      });
      return Promise.race([create, timeout]).then(function (w) {
        tessWorker = w;
        tessLoading = null;
        return w;
      }, function (err) {
        tessLoading = null;
        if (create && typeof create.then === 'function') {
          create.then(function (w) { if (w && w.terminate) w.terminate(); }).catch(function () {});
        }
        throw err;
      });
    });
    return tessLoading;
  }

  function recognizeWithTesseract(imageSource, onProgress, callback) {
    tessProgress = onProgress || null;
    getTesseractWorker()
      .then(function (w) {
        return w.recognize(imageSource);
      })
      .then(function (r) {
        tessProgress = null;
        callback(null, (r && r.data && r.data.text) || '');
      })
      .catch(function (err) {
        tessProgress = null;
        callback(err);
      });
  }

  // ---------- unit parsing ----------
  function normalizeUnit(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/µ|μ|&micro;|&mu;/g, 'u')
      .replace(/×/g, 'x')
      .replace(/³/g, '3')
      .replace(/\s+/g, '')
      .replace(/microlitres?|microliters?/g, 'ul')
      .replace(/decilitres?|deciliters?/g, 'dl')
      .replace(/litres?|liters?/g, 'l')
      .replace(/grams?|gms|gm/g, 'g')
      .replace(/cells?/g, '')
      .replace(/cu\.?mm|cumm|cmm|mm3/g, 'ul')
      .replace(/thousands?|thou/g, 'k')
      .replace(/lakhs|lacs|lac/g, 'lakh')
      .replace(/\*10/g, 'x10')
      .replace(/x10\^?3/g, 'x103')
      .replace(/x103/g, 'x103')
      .replace(/^10\^?3/, 'x103')
      .replace(/percent/, '%');
  }

  var UNIT_ALIASES = {
    'g/dl': ['g_dl'],
    'g%': ['g_dl'],
    'g/l': ['g_l'],
    'mg/dl': ['mg_dl'],
    'mmol/l': ['mmol_l'],
    'umol/l': ['umol_l'],
    '/ul': ['per_mcl'],
    '/mcl': ['per_mcl'],
    'ul': ['per_mcl'],
    'mcl': ['per_mcl'],
    'x103/ul': ['x10_3', 'k_mcl'],
    'x103/mcl': ['x10_3', 'k_mcl'],
    'x103': ['x10_3', 'k_mcl'],
    'k/ul': ['x10_3', 'k_mcl'],
    'k/mcl': ['x10_3', 'k_mcl'],
    'k': ['x10_3', 'k_mcl'],
    'lakh': ['lakh_mcl'],
    'lakh/ul': ['lakh_mcl'],
    'lakh/mcl': ['lakh_mcl'],
    'mm/hr': ['mm_hr'],
    'mm/hour': ['mm_hr'],
    '%': ['percent'],
    'u/l': ['u_l'],
    'iu/l': ['u_l'],
    'uiu/ml': ['miu_l'],
    'miu/l': ['miu_l'],
    'miu/ml': ['miu_l'],
    'uiu/l': ['miu_l'],
    'ng/ml': ['ng_ml'],
    'nmol/l': ['nmol_l'],
    'pg/ml': ['pg_ml'],
    'pmol/l': ['pmol_l']
  };

  function resolveUnit(testId, unitText) {
    var test = global.LAB_DATA && global.LAB_DATA.tests && global.LAB_DATA.tests[testId];
    var defaultId = test ? test.defaultUnit : null;
    var raw = String(unitText || '').trim();
    if (!raw) return { unitId: defaultId, known: false };

    var n = normalizeUnit(raw);
    var ids = UNIT_ALIASES[n];
    if (!ids && n.charAt(0) !== '/' && UNIT_ALIASES['/' + n]) ids = UNIT_ALIASES['/' + n];

    function hasId(id) {
      return test && test.units && test.units.some(function (u) { return u.id === id; });
    }

    if (ids) {
      for (var i = 0; i < ids.length; i++) {
        if (!test || hasId(ids[i])) return { unitId: ids[i], known: true };
      }
    }
    if (test && test.units) {
      for (var j = 0; j < test.units.length; j++) {
        if (normalizeUnit(test.units[j].label) === n) {
          return { unitId: test.units[j].id, known: true };
        }
      }
    }
    return { unitId: defaultId, known: false };
  }

  var TEST_PATTERNS = [
    { testId: 'hb', pattern: /(?:hemoglobin|haemoglobin|hgb|hb)\b[^\d\n\r:]*[:\s\-]*([0-9]+(?:\.[0-9]+)?)\s*/i },
    { testId: 'wbc', pattern: /(?:total\s+leukocyte\s+count|white\s+blood\s+cells?|wbc|tlc)\b[^\d\n\r:]*[:\s\-]*([0-9,]+(?:\.[0-9]+)?)\s*/i },
    { testId: 'platelets', pattern: /(?:platelet\s+count|platelets?|thrombocytes?)\b[^\d\n\r:]*[:\s\-]*([0-9,]+(?:\.[0-9]+)?)\s*/i },
    { testId: 'esr', pattern: /(?:erythrocyte\s+sedimentation\s+rate|esr)\b[^\d\n\r:]*[:\s\-]*([0-9]+(?:\.[0-9]+)?)\s*/i },
    { testId: 'fasting_glucose', pattern: /(?:fasting\s+blood\s+(?:sugar|glucose)|blood\s+glucose\s*\(?fasting\)?|fbs|glucose)\b[^\d\n\r:]*[:\s\-]*([0-9]+(?:\.[0-9]+)?)\s*/i },
    { testId: 'hba1c', pattern: /(?:glycated\s+hemoglobin|glycosylated\s+hemoglobin|hba1c)\b[^\d\n\r:]*[:\s\-]*([0-9]+(?:\.[0-9]+)?)\s*/i },
    { testId: 'creatinine', pattern: /(?:serum\s+creatinine|creatinine)\b[^\d\n\r:]*[:\s\-]*([0-9]+(?:\.[0-9]+)?)\s*/i },
    { testId: 'uric_acid', pattern: /(?:serum\s+uric\s+acid|uric\s+acid)\b[^\d\n\r:]*[:\s\-]*([0-9]+(?:\.[0-9]+)?)\s*/i },
    { testId: 'bilirubin_total', pattern: /(?:total\s+bilirubin|bilirubin\s+total)\b[^\d\n\r:]*[:\s\-]*([0-9]+(?:\.[0-9]+)?)\s*/i },
    { testId: 'sgpt_alt', pattern: /(?:sgpt(?:\s*\(alt\))?|alt\b|alanine\s+aminotransferase)\b[^\d\n\r:]*[:\s\-]*([0-9]+(?:\.[0-9]+)?)\s*/i },
    { testId: 'total_cholesterol', pattern: /(?:total\s+cholesterol|cholesterol\s+total)\b[^\d\n\r:]*[:\s\-]*([0-9]+(?:\.[0-9]+)?)\s*/i },
    { testId: 'ldl_cholesterol', pattern: /(?:ldl(?:\s+cholesterol)?|low\s+density\s+lipoprotein)\b[^\d\n\r:]*[:\s\-]*([0-9]+(?:\.[0-9]+)?)\s*/i },
    { testId: 'hdl_cholesterol', pattern: /(?:hdl(?:\s+cholesterol)?|high\s+density\s+lipoprotein)\b[^\d\n\r:]*[:\s\-]*([0-9]+(?:\.[0-9]+)?)\s*/i },
    { testId: 'triglycerides', pattern: /(?:serum\s+triglycerides|triglycerides?)\b[^\d\n\r:]*[:\s\-]*([0-9]+(?:\.[0-9]+)?)\s*/i },
    { testId: 'tsh', pattern: /(?:thyroid\s+stimulating\s+hormone|tsh)\b[^\d\n\r:]*[:\s\-]*([0-9]+(?:\.[0-9]+)?)\s*/i },
    { testId: 'vitamin_d', pattern: /(?:25-?hydroxy\s+vitamin\s+d|vitamin\s+d(?:3)?|25-oh\s+vit\s+d)\b[^\d\n\r:]*[:\s\-]*([0-9]+(?:\.[0-9]+)?)\s*/i },
    { testId: 'vitamin_b12', pattern: /(?:vitamin\s+b-?12|vit\s+b12|cobalamin)\b[^\d\n\r:]*[:\s\-]*([0-9]+(?:\.[0-9]+)?)\s*/i }
  ];

  function takeUnit(after) {
    var slice = String(after || '').slice(0, 32);
    var m = slice.match(/^\s*([A-Za-zµμ%/×x0-9*^³.\-]+(?:\s*\/\s*[A-Za-zµμ0-9³]+)?|lakh|lakhs|lac|lacs)/i);
    return m ? m[1] : '';
  }

  /**
   * Parses raw report text to extract recognized lab values and radiology terms.
   */
  function parseReportText(rawText) {
    if (!rawText || typeof rawText !== 'string') {
      return { detectedLabTests: [], detectedScanTerms: [] };
    }

    var detectedLabTests = [];
    var seenTests = {};

    TEST_PATTERNS.forEach(function (rule) {
      var match = rawText.match(rule.pattern);
      if (match && match[1] && !seenTests[rule.testId]) {
        var num = parseFloat(match[1].replace(/,/g, ''));
        var after = rawText.slice(match.index + match[0].length);
        var unitText = takeUnit(after);
        var resolved = resolveUnit(rule.testId, unitText);

        if (!isNaN(num) && num > 0) {
          seenTests[rule.testId] = true;
          detectedLabTests.push({
            testId: rule.testId,
            value: num,
            unitId: resolved.unitId,
            unitKnown: !!resolved.known,
            rawMatched: (match[0] + (unitText ? (match[0].slice(-1) === ' ' ? '' : ' ') + unitText : '')).trim()
          });
        }
      }
    });

    // Detect radiology terms
    var detectedScanTerms = [];
    if (global.SCANS_DATA && global.SCANS_DATA.terms) {
      global.SCANS_DATA.terms.forEach(function (termItem) {
        var targets = [termItem.term];
        if (termItem.aliases && Array.isArray(termItem.aliases)) {
          targets = targets.concat(termItem.aliases);
        }

        var matched = targets.some(function (tStr) {
          var clean = tStr.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&').replace(/\s+/g, '\\s+');
          var regex = new RegExp('\\b' + clean + '\\b', 'i');
          return regex.test(rawText);
        });

        if (matched) {
          detectedScanTerms.push(termItem);
        }
      });
    }

    return {
      detectedLabTests: detectedLabTests,
      detectedScanTerms: detectedScanTerms,
      totalDetected: detectedLabTests.length + detectedScanTerms.length
    };
  }

  clearLegacyApiKey();

  global.OCR_PARSER = {
    clearLegacyApiKey: clearLegacyApiKey,
    getVisionKey: getVisionKey,
    openApiKeys: openApiKeys,
    callGoogleVision: callGoogleVision,
    recognizeWithTesseract: recognizeWithTesseract,
    parseReportText: parseReportText,
    resolveUnit: resolveUnit
  };

})(typeof window !== 'undefined' ? window : this);
