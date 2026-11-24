/**
 * Lab & Scan Explainer - UI Controller (app.js)
 * Manages reactive forms, visual gauge needle positioning, radiology explorer,
 * OCR scan modal with Google Vision API, and theme synchronization.
 * LAB-1b: start-up is null-guarded so a missing element cannot block tabs or OCR.
 */
(function () {
  'use strict';

  var currentTestId = 'hb';
  var currentCategory = 'cbc';
  var currentDemographic = 'male';

  // Elements cache
  var el = {};

  function initElements() {
    el.categorySelect = document.getElementById('category-select');
    el.testSelect = document.getElementById('test-select');
    el.valueInput = document.getElementById('test-value-input');
    el.unitSelect = document.getElementById('unit-select');
    el.demographicInputs = document.querySelectorAll('input[name="demographic"]');
    el.presetsContainer = document.getElementById('presets-container');

    // Evaluation outputs
    el.resultCard = document.getElementById('result-card');
    el.statusBadge = document.getElementById('status-badge');
    el.gaugePointer = document.getElementById('gauge-pointer');
    el.gaugeMinLabel = document.getElementById('gauge-min-label');
    el.gaugeMaxLabel = document.getElementById('gauge-max-label');
    el.gaugeNormalText = document.getElementById('gauge-normal-text');
    el.whatIsItText = document.getElementById('what-is-it-text');
    el.resultExplanationText = document.getElementById('result-explanation-text');
    el.doctorQuestionsList = document.getElementById('doctor-questions-list');

    // Tabs
    el.tabBtns = document.querySelectorAll('.tab-btn');
    el.tabPanels = document.querySelectorAll('.tab-panel');

    // Radiology Explorer
    el.scanSearchInput = document.getElementById('scan-search-input');
    el.scanTermsGrid = document.getElementById('scan-terms-grid');
    el.huSlider = document.getElementById('hu-slider');
    el.huValDisplay = document.getElementById('hu-val-display');
    el.huTissueDisplay = document.getElementById('hu-tissue-display');
    el.huDescDisplay = document.getElementById('hu-desc-display');
    el.huChip = document.getElementById('hu-chip');

    // Modal & OCR
    el.ocrModal = document.getElementById('ocr-modal');
    el.openOcrBtn = document.getElementById('btn-open-ocr');
    el.closeOcrBtn = document.getElementById('btn-close-ocr');
    el.fileInput = document.getElementById('report-file-input');
    el.dropZone = document.getElementById('drop-zone');
    el.ocrStatus = document.getElementById('ocr-status');
    el.pasteTextInput = document.getElementById('paste-report-text');
    el.btnParsePasted = document.getElementById('btn-parse-pasted');
    el.detectedList = document.getElementById('detected-tests-list');
    el.visionApiKeyInput = document.getElementById('vision-api-key-input');
    el.btnSaveApiKey = document.getElementById('btn-save-api-key');
    el.apiKeyFeedback = document.getElementById('api-key-feedback');
  }

  function safeStep(name, fn) {
    try {
      fn();
    } catch (err) {
      console.warn('Lab Tests: ' + name + ' failed', err);
    }
  }

  function populateCategories() {
    if (!el.categorySelect) return;
    el.categorySelect.textContent = '';
    window.LAB_DATA.categories.forEach(function (cat) {
      var opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.icon + ' ' + cat.name;
      el.categorySelect.appendChild(opt);
    });
    el.categorySelect.value = currentCategory;
  }

  function populateTests(categoryId) {
    if (!el.testSelect) return;
    el.testSelect.textContent = '';
    var tests = window.LAB_DATA.tests;
    Object.keys(tests).forEach(function (key) {
      var t = tests[key];
      if (t.categoryId === categoryId) {
        var opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name;
        el.testSelect.appendChild(opt);
      }
    });

    // If current test belongs to this category, keep it; otherwise pick first test in category
    var firstAvailable = el.testSelect.options[0] ? el.testSelect.options[0].value : null;
    if (tests[currentTestId] && tests[currentTestId].categoryId === categoryId) {
      el.testSelect.value = currentTestId;
    } else if (firstAvailable) {
      currentTestId = firstAvailable;
      el.testSelect.value = firstAvailable;
    }

    populateUnits(currentTestId);
    renderPresets(currentTestId);
  }

  function populateUnits(testId) {
    if (!el.unitSelect) return;
    el.unitSelect.textContent = '';
    var test = window.LAB_DATA.tests[testId];
    if (!test) return;

    test.units.forEach(function (u) {
      var opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = u.label;
      el.unitSelect.appendChild(opt);
    });
    el.unitSelect.value = test.defaultUnit;
  }

  function renderPresets(testId) {
    if (!el.presetsContainer) return;
    el.presetsContainer.textContent = '';
    var test = window.LAB_DATA.tests[testId];
    if (!test) return;

    var range = test.ranges[currentDemographic] || test.ranges.male;
    var normalVal = ((range.min + range.max) / 2);
    // Round to 1 decimal if needed
    normalVal = Math.round(normalVal * 10) / 10;

    var lowVal = Math.round((range.min * 0.85) * 10) / 10;
    var highVal = Math.round((range.max * 1.2) * 10) / 10;

    var presets = [
      { label: 'Normal: ' + normalVal, val: normalVal },
      { label: 'Low: ' + lowVal, val: lowVal },
      { label: 'Elevated: ' + highVal, val: highVal }
    ];

    presets.forEach(function (p) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'preset-chip';
      chip.textContent = p.label;
      chip.addEventListener('click', function () {
        if (el.valueInput) el.valueInput.value = p.val;
        updateEvaluation();
      });
      el.presetsContainer.appendChild(chip);
    });
  }

  function updateEvaluation() {
    if (!el.valueInput) return;
    var rawVal = parseFloat(el.valueInput.value);
    var test = window.LAB_DATA.tests[currentTestId];
    if (!test) return;

    if (isNaN(rawVal)) {
      // Default to mid-range if empty
      var r = test.ranges[currentDemographic] || test.ranges.male;
      rawVal = Math.round(((r.min + r.max) / 2) * 10) / 10;
      el.valueInput.value = rawVal;
    }

    var unitId = el.unitSelect ? el.unitSelect.value : test.defaultUnit;
    var evalRes = window.LAB_DATA.evaluate(currentTestId, rawVal, unitId, currentDemographic);
    if (!evalRes) return;

    // Status Badge
    if (el.statusBadge) {
      el.statusBadge.textContent = evalRes.label;
      el.statusBadge.className = 'result-status-badge badge-' + evalRes.tone;
    }

    // Gauge pointer
    if (el.gaugePointer) el.gaugePointer.style.left = evalRes.percent + '%';
    if (el.gaugeMinLabel) el.gaugeMinLabel.textContent = test.scale.displayMin;
    if (el.gaugeMaxLabel) el.gaugeMaxLabel.textContent = test.scale.displayMax + '+ ' + evalRes.unit.label;
    if (el.gaugeNormalText) el.gaugeNormalText.textContent = evalRes.range.min + ' – ' + evalRes.range.max + ' ' + evalRes.unit.label;

    // Text Content
    if (el.whatIsItText) el.whatIsItText.textContent = test.whatIsIt;
    if (el.resultExplanationText) el.resultExplanationText.textContent = evalRes.explanation;

    // Doctor questions
    if (el.doctorQuestionsList) {
      el.doctorQuestionsList.textContent = '';
      (test.doctorQuestions || []).forEach(function (q) {
        var li = document.createElement('li');
        li.textContent = q;
        el.doctorQuestionsList.appendChild(li);
      });
    }
  }

  // --- Radiology Explorer ---
  function renderScanTerms(filterQuery) {
    if (!el.scanTermsGrid) return;
    var terms = window.SCANS_DATA.searchTerms(filterQuery);
    el.scanTermsGrid.textContent = '';

    if (!terms.length) {
      var empty = document.createElement('p');
      empty.style.color = 'var(--text-muted)';
      empty.style.gridColumn = '1/-1';
      empty.textContent = 'No matching radiology terms found. Try searching for "nodule", "hypodense", "unremarkable", or "effusion".';
      el.scanTermsGrid.appendChild(empty);
      return;
    }

    terms.forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'term-card';

      var header = document.createElement('div');
      header.className = 'term-header';
      var name = document.createElement('span');
      name.className = 'term-name';
      name.textContent = item.term;
      var badge = document.createElement('span');
      badge.className = 'term-badge';
      badge.textContent = item.category;
      header.appendChild(name);
      header.appendChild(badge);

      var plain = document.createElement('div');
      plain.className = 'term-plain';
      plain.textContent = item.plainEnglish;

      var desc = document.createElement('div');
      desc.className = 'term-desc';
      desc.textContent = item.meaning;

      card.appendChild(header);
      card.appendChild(plain);
      card.appendChild(desc);
      el.scanTermsGrid.appendChild(card);
    });
  }

  function updateHU() {
    if (!el.huSlider) return;
    var huVal = parseInt(el.huSlider.value, 10);
    var res = window.SCANS_DATA.evaluateHU(huVal);
    var item = res.matched;
    var label = (huVal > 0 ? '+' : '') + huVal + ' HU';

    if (el.huValDisplay) el.huValDisplay.textContent = label;
    if (el.huTissueDisplay) el.huTissueDisplay.textContent = item.name;
    if (el.huDescDisplay) el.huDescDisplay.textContent = item.desc;
    if (el.huChip) {
      el.huChip.style.backgroundColor = item.color;
      el.huChip.style.color = item.textColor;
      el.huChip.textContent = item.name + ' (' + label + ')';
    }
  }

  // --- Tabs Navigation ---
  function setupTabs() {
    if (!el.tabBtns || !el.tabBtns.length) return;
    el.tabBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var targetTab = btn.getAttribute('data-tab');

        el.tabBtns.forEach(function (b) { b.classList.remove('active'); });
        if (el.tabPanels) {
          el.tabPanels.forEach(function (p) { p.classList.remove('active'); });
        }

        btn.classList.add('active');
        var panel = document.getElementById('tab-' + targetTab);
        if (panel) panel.classList.add('active');
      });
    });
  }

  // --- OCR & Document Scanner ---
  function setupOCR() {
    // Load saved API key
    var savedKey = window.OCR_PARSER.getSavedApiKey();
    if (savedKey) {
      if (el.visionApiKeyInput) el.visionApiKeyInput.value = savedKey;
      if (el.apiKeyFeedback) {
        el.apiKeyFeedback.textContent = 'Active key stored privately in local browser storage.';
        el.apiKeyFeedback.style.color = 'var(--color-normal)';
      }
    }

    if (el.btnSaveApiKey) {
      el.btnSaveApiKey.addEventListener('click', function () {
        var val = el.visionApiKeyInput ? el.visionApiKeyInput.value.trim() : '';
        window.OCR_PARSER.saveApiKey(val);
        if (el.apiKeyFeedback) {
          el.apiKeyFeedback.textContent = val ? 'Saved successfully!' : 'Key removed.';
          el.apiKeyFeedback.style.color = 'var(--color-normal)';
        }
      });
    }

    if (el.openOcrBtn) {
      el.openOcrBtn.addEventListener('click', function () {
        if (el.ocrModal) el.ocrModal.classList.add('open');
      });
    }

    if (el.closeOcrBtn) {
      el.closeOcrBtn.addEventListener('click', function () {
        if (el.ocrModal) el.ocrModal.classList.remove('open');
      });
    }

    if (el.dropZone && el.fileInput) {
      el.dropZone.addEventListener('click', function () {
        el.fileInput.click();
      });
    }

    if (el.fileInput) {
      el.fileInput.addEventListener('change', function (e) {
        var file = e.target.files && e.target.files[0];
        if (file) handleImageFile(file);
      });
    }

    // Drag and drop
    if (el.dropZone) {
      el.dropZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        el.dropZone.style.borderColor = 'var(--border-focus)';
      });
      el.dropZone.addEventListener('dragleave', function () {
        el.dropZone.style.borderColor = 'var(--border-color)';
      });
      el.dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        el.dropZone.style.borderColor = 'var(--border-color)';
        var file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) handleImageFile(file);
      });
    }

    // Manual paste parse
    if (el.btnParsePasted) {
      el.btnParsePasted.addEventListener('click', function () {
        if (!el.pasteTextInput) return;
        var text = el.pasteTextInput.value;
        if (!text.trim()) return;
        var results = window.OCR_PARSER.parseReportText(text);
        displayDetectedResults(results, 'Pasted text parsed.');
      });
    }
  }

  function handleImageFile(file) {
    if (!file.type.match(/^image\//)) {
      showOcrStatus('Please upload an image file (PNG, JPG, WebP).', 'error');
      return;
    }

    showOcrStatus('Reading image file...', 'loading');
    var reader = new FileReader();
    reader.onload = function (evt) {
      var base64 = evt.target.result;
      var key = window.OCR_PARSER.getSavedApiKey();

      if (!key) {
        showOcrStatus('No Google Vision API key found. Enter and save your key below to perform OCR, or paste report text directly.', 'error');
        return;
      }

      showOcrStatus('Calling Google Vision API (DOCUMENT_TEXT_DETECTION)...', 'loading');
      window.OCR_PARSER.callGoogleVision(base64, key, function (err, extractedText) {
        if (err) {
          showOcrStatus('Vision OCR failed: ' + err.message, 'error');
          return;
        }

        if (el.pasteTextInput) el.pasteTextInput.value = extractedText;
        var results = window.OCR_PARSER.parseReportText(extractedText);
        displayDetectedResults(results, 'Vision OCR completed successfully!');
      });
    };
    reader.readAsDataURL(file);
  }

  function showOcrStatus(msg, type) {
    if (!el.ocrStatus) return;
    el.ocrStatus.textContent = msg;
    el.ocrStatus.className = 'ocr-status ' + (type || '');
  }

  function displayDetectedResults(results, successMsg) {
    showOcrStatus(successMsg + ' Found ' + results.detectedLabTests.length + ' lab markers and ' + results.detectedScanTerms.length + ' radiology terms.', 'success');
    if (!el.detectedList) return;
    el.detectedList.textContent = '';

    if (!results.detectedLabTests.length && !results.detectedScanTerms.length) {
      var empty = document.createElement('p');
      empty.style.fontSize = '0.85rem';
      empty.style.color = 'var(--text-muted)';
      empty.textContent = 'No specific matching test names or numbers recognized. You can type them into the form directly.';
      el.detectedList.appendChild(empty);
      return;
    }

    // List detected lab tests
    results.detectedLabTests.forEach(function (dt) {
      var tObj = window.LAB_DATA.tests[dt.testId];
      if (!tObj) return;

      var row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'center';
      row.style.padding = '0.5rem';
      row.style.borderBottom = '1px solid var(--border-color)';
      row.style.fontSize = '0.9rem';

      var info = document.createElement('div');
      var nameEl = document.createElement('strong');
      nameEl.textContent = tObj.name;
      info.appendChild(nameEl);
      info.appendChild(document.createTextNode(': ' + dt.value + ' ' + tObj.defaultUnit));

      var raw = document.createElement('div');
      raw.style.fontSize = '0.75rem';
      raw.style.color = 'var(--text-muted)';
      raw.textContent = dt.rawMatched || '';
      info.appendChild(raw);

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-secondary';
      btn.style.fontSize = '0.75rem';
      btn.style.padding = '0.3rem 0.6rem';
      btn.textContent = 'Load into Form';
      btn.addEventListener('click', function () {
        loadTestIntoForm(dt.testId, dt.value);
        if (el.ocrModal) el.ocrModal.classList.remove('open');
      });

      row.appendChild(info);
      row.appendChild(btn);
      el.detectedList.appendChild(row);
    });

    // List detected radiology terms
    results.detectedScanTerms.forEach(function (term) {
      var row = document.createElement('div');
      row.style.padding = '0.5rem';
      row.style.borderBottom = '1px solid var(--border-color)';
      row.style.fontSize = '0.85rem';

      var strong = document.createElement('strong');
      strong.textContent = term.term;
      row.appendChild(strong);
      row.appendChild(document.createTextNode(' (' + term.category + '): '));
      var span = document.createElement('span');
      span.style.color = 'var(--text-heading)';
      span.textContent = term.plainEnglish;
      row.appendChild(span);

      el.detectedList.appendChild(row);
    });
  }

  function loadTestIntoForm(testId, val) {
    var tObj = window.LAB_DATA.tests[testId];
    if (!tObj) return;

    currentCategory = tObj.categoryId;
    currentTestId = testId;

    if (el.categorySelect) el.categorySelect.value = currentCategory;
    populateTests(currentCategory);
    if (el.testSelect) el.testSelect.value = currentTestId;
    if (el.valueInput) el.valueInput.value = val;

    // Switch to tab 1
    if (el.tabBtns && el.tabBtns[0]) el.tabBtns[0].click();
    updateEvaluation();
  }

  // --- Initialization ---
  document.addEventListener('DOMContentLoaded', function () {
    initElements();

    if (window.LearnHubBar) {
      safeStep('hubBar', function () {
        LearnHubBar.attach(document.querySelector('.lrn-head'), { buttons: '#btn-open-ocr' });
      });
    }

    safeStep('evaluation', function () {
      populateCategories();
      populateTests(currentCategory);

      // Initial evaluation
      if (el.valueInput) el.valueInput.value = 14.5; // sample normal Hb

      if (el.categorySelect) {
        el.categorySelect.addEventListener('change', function () {
          currentCategory = el.categorySelect.value;
          populateTests(currentCategory);
          updateEvaluation();
        });
      }

      if (el.testSelect) {
        el.testSelect.addEventListener('change', function () {
          currentTestId = el.testSelect.value;
          populateUnits(currentTestId);
          renderPresets(currentTestId);
          updateEvaluation();
        });
      }

      if (el.valueInput) el.valueInput.addEventListener('input', updateEvaluation);
      if (el.unitSelect) el.unitSelect.addEventListener('change', updateEvaluation);

      if (el.demographicInputs) {
        el.demographicInputs.forEach(function (radio) {
          radio.addEventListener('change', function () {
            currentDemographic = this.value;
            renderPresets(currentTestId);
            updateEvaluation();
          });
        });
      }

      updateEvaluation();
    });

    safeStep('radiology', function () {
      renderScanTerms('');
      updateHU();
      if (el.huSlider) el.huSlider.addEventListener('input', updateHU);
      if (el.scanSearchInput) {
        el.scanSearchInput.addEventListener('input', function () {
          renderScanTerms(el.scanSearchInput.value);
        });
      }
    });

    safeStep('setupTabs', setupTabs);
    safeStep('setupOCR', setupOCR);
  });

})();
