/**
 * Lab & Scan Explainer - OCR & Report Text Parser (ocr-parser.js)
 * Supports Google Vision API (DOCUMENT_TEXT_DETECTION) via client-stored key,
 * and rule-based regex extraction of lab values and scan report impressions.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'lab_tests_google_vision_key';

  function getSavedApiKey() {
    try {
      return localStorage.getItem(STORAGE_KEY) || '';
    } catch (_) {
      return '';
    }
  }

  function saveApiKey(key) {
    try {
      if (!key) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, key.trim());
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Calls Google Cloud Vision REST API directly with a base64 encoded image.
   */
  function callGoogleVision(base64Data, apiKey, callback) {
    var key = apiKey || getSavedApiKey();
    if (!key) {
      callback(new Error('No Google Vision API key provided. Please save your API key in Scanner Settings.'));
      return;
    }

    // Strip data URL header if present (e.g. data:image/jpeg;base64,...)
    var cleanBase64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');

    var endpoint = 'https://vision.googleapis.com/v1/images:annotate?key=' + encodeURIComponent(key);
    var requestBody = {
      requests: [
        {
          image: { content: cleanBase64 },
          features: [
            { type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }
          ]
        }
      ]
    };

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (errData) {
            var msg = (errData && errData.error && errData.error.message) || ('API request failed with status ' + res.status);
            throw new Error(msg);
          });
        }
        return res.json();
      })
      .then(function (data) {
        var response = data.responses && data.responses[0];
        if (!response) {
          callback(new Error('Empty response from Google Vision API.'));
          return;
        }
        if (response.error) {
          callback(new Error(response.error.message || 'Vision API returned an error.'));
          return;
        }
        var text = (response.fullTextAnnotation && response.fullTextAnnotation.text) || '';
        if (!text && response.textAnnotations && response.textAnnotations.length) {
          text = response.textAnnotations[0].description || '';
        }
        callback(null, text);
      })
      .catch(function (err) {
        callback(err);
      });
  }

  // Regex rules to extract lab tests from text
  var TEST_PATTERNS = [
    {
      testId: 'hb',
      pattern: /(?:hemoglobin|haemoglobin|hgb|hb)\b[^\d\n\r:]*[:\s\-]*([0-9]+(?:\.[0-9]+)?)\s*(g\/dl|g\/l|gm\/dl)?/i
    },
    {
      testId: 'wbc',
      pattern: /(?:total\s+leukocyte\s+count|white\s+blood\s+cells?|wbc|tlc)\b[^\d\n\r:]*[:\s\-]*([0-9,]+(?:\.[0-9]+)?)/i,
      transform: function (val) { return parseFloat(val.replace(/,/g, '')); }
    },
    {
      testId: 'platelets',
      pattern: /(?:platelet\s+count|platelets?|thrombocytes?)\b[^\d\n\r:]*[:\s\-]*([0-9,]+(?:\.[0-9]+)?)\s*(lakh|\/cumm|\*10\^3)?/i,
      transform: function (val, match) {
        var clean = parseFloat(val.replace(/,/g, ''));
        // If report lists in raw count (e.g. 250000), convert to k/mcL (250)
        if (clean > 1000) clean = clean / 1000;
        else if (match && /lakh/i.test(match[2])) clean = clean * 100; // 2.5 lakh -> 250k
        return clean;
      }
    },
    {
      testId: 'esr',
      pattern: /(?:erythrocyte\s+sedimentation\s+rate|esr)\b[^\d\n\r:]*[:\s\-]*([0-9]+(?:\.[0-9]+)?)/i
    },
    {
      testId: 'fasting_glucose',
      pattern: /(?:fasting\s+blood\s+(?:sugar|glucose)|blood\s+glucose\s*\(?fasting\)?|fbs)\b[^\d\n\r:]*[:\s\-]*([0-9]+(?:\.[0-9]+)?)/i
    },
    {
      testId: 'hba1c',
      pattern: /(?:glycated\s+hemoglobin|glycosylated\s+hemoglobin|hba1c)\b[^\d\n\r:]*[:\s\-]*([0-9]+(?:\.[0-9]+)?)/i
    },
    {
      testId: 'creatinine',
      pattern: /(?:serum\s+creatinine|creatinine)\b[^\d\n\r:]*[:\s\-]*([0-9]+(?:\.[0-9]+)?)/i
    },
    {
      testId: 'uric_acid',
      pattern: /(?:serum\s+uric\s+acid|uric\s+acid)\b[^\d\n\r:]*[:\s\-]*([0-9]+(?:\.[0-9]+)?)/i
    },
    {
      testId: 'bilirubin_total',
      pattern: /(?:total\s+bilirubin|bilirubin\s+total)\b[^\d\n\r:]*[:\s\-]*([0-9]+(?:\.[0-9]+)?)/i
    },
    {
      testId: 'sgpt_alt',
      pattern: /(?:sgpt(?:\s*\(alt\))?|alt\b|alanine\s+aminotransferase)\b[^\d\n\r:]*[:\s\-]*([0-9]+(?:\.[0-9]+)?)/i
    },
    {
      testId: 'total_cholesterol',
      pattern: /(?:total\s+cholesterol|cholesterol\s+total)\b[^\d\n\r:]*[:\s\-]*([0-9]+(?:\.[0-9]+)?)/i
    },
    {
      testId: 'ldl_cholesterol',
      pattern: /(?:ldl(?:\s+cholesterol)?|low\s+density\s+lipoprotein)\b[^\d\n\r:]*[:\s\-]*([0-9]+(?:\.[0-9]+)?)/i
    },
    {
      testId: 'hdl_cholesterol',
      pattern: /(?:hdl(?:\s+cholesterol)?|high\s+density\s+lipoprotein)\b[^\d\n\r:]*[:\s\-]*([0-9]+(?:\.[0-9]+)?)/i
    },
    {
      testId: 'triglycerides',
      pattern: /(?:serum\s+triglycerides|triglycerides?)\b[^\d\n\r:]*[:\s\-]*([0-9]+(?:\.[0-9]+)?)/i
    },
    {
      testId: 'tsh',
      pattern: /(?:thyroid\s+stimulating\s+hormone|tsh)\b[^\d\n\r:]*[:\s\-]*([0-9]+(?:\.[0-9]+)?)/i
    },
    {
      testId: 'vitamin_d',
      pattern: /(?:25-?hydroxy\s+vitamin\s+d|vitamin\s+d(?:3)?|25-oh\s+vit\s+d)\b[^\d\n\r:]*[:\s\-]*([0-9]+(?:\.[0-9]+)?)/i
    },
    {
      testId: 'vitamin_b12',
      pattern: /(?:vitamin\s+b-?12|vit\s+b12|cobalamin)\b[^\d\n\r:]*[:\s\-]*([0-9]+(?:\.[0-9]+)?)/i
    }
  ];

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
        if (rule.transform) {
          num = rule.transform(match[1], match);
        }

        if (!isNaN(num) && num > 0) {
          seenTests[rule.testId] = true;
          detectedLabTests.push({
            testId: rule.testId,
            value: num,
            rawMatched: match[0].trim()
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

  global.OCR_PARSER = {
    getSavedApiKey: getSavedApiKey,
    saveApiKey: saveApiKey,
    callGoogleVision: callGoogleVision,
    parseReportText: parseReportText
  };

})(typeof window !== 'undefined' ? window : this);
