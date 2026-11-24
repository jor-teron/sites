/**
 * Lab & Scan Explainer - UI Controller (app.js)
 * Manages reactive forms, visual gauge needle positioning, radiology explorer,
 * OCR scan modal with Google Vision API, and theme synchronization.
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

  function populateCategories() {
    el.categorySelect.innerHTML = '';
    window.LAB_DATA.categories.forEach(function (cat) {
      var opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.icon + ' ' + cat.name;
      el.categorySelect.appendChild(opt);
    });
    el.categorySelect.value = currentCategory;
  }

  function populateTests(categoryId) {
    el.testSelect.innerHTML = '';
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
    el.unitSelect.innerHTML = '';
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
    el.presetsContainer.innerHTML = '';
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
        el.valueInput.value = p.val;
        updateEvaluation();
      });
      el.presetsContainer.appendChild(chip);
    });
  }

  function updateEvaluation() {
    var rawVal = parseFloat(el.valueInput.value);
    var test = window.LAB_DATA.tests[currentTestId];
    if (!test) return;

    if (isNaN(rawVal)) {
      // Default to mid-range if empty
      var r = test.ranges[currentDemographic] || test.ranges.male;
      rawVal = Math.round(((r.min + r.max) / 2) * 10) / 10;
      el.valueInput.value = rawVal;
    }

    var unitId = el.unitSelect.value;
    var evalRes = window.LAB_DATA.evaluate(currentTestId, rawVal, unitId, currentDemographic);
    if (!evalRes) return;

    // Status Badge
    el.statusBadge.textContent = evalRes.label;
    el.statusBadge.className = 'result-status-badge badge-' + evalRes.tone;

    // Gauge pointer
    el.gaugePointer.style.left = evalRes.percent + '%';
    el.gaugeMinLabel.textContent = test.scale.displayMin;
    el.gaugeMaxLabel.textContent = test.scale.displayMax + '+ ' + evalRes.unit.label;
    el.gaugeNormalText.textContent = evalRes.range.min + ' – ' + evalRes.range.max + ' ' + evalRes.unit.label;

    // Text Content
    el.whatIsItText.textContent = test.whatIsIt;
    el.resultExplanationText.textContent = evalRes.explanation;

    // Doctor questions
    el.doctorQuestionsList.innerHTML = '';
    (test.doctorQuestions || []).forEach(function (q) {
      var li = document.createElement('li');
      li.textContent = q;
      el.doctorQuestionsList.appendChild(li);
    });
  }

  // --- Radiology Explorer ---
  function renderScanTerms(filterQuery) {
    var terms = window.SCANS_DATA.searchTerms(filterQuery);
    el.scanTermsGrid.innerHTML = '';

    if (!terms.length) {
      el.scanTermsGrid.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;">No matching radiology terms found. Try searching for "nodule", "hypodense", "unremarkable", or "effusion".</p>';
      return;
    }

    terms.forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'term-card';
      card.innerHTML =
        '<div class="term-header">' +
          '<span class="term-name">' + item.term + '</span>' +
          '<span class="term-badge">' + item.category + '</span>' +
        '</div>' +
        '<div class="term-plain">' + item.plainEnglish + '</div>' +
        '<div class="term-desc">' + item.meaning + '</div>';
      el.scanTermsGrid.appendChild(card);
    });
  }

  function updateHU() {
    var huVal = parseInt(el.huSlider.value, 10);
    var res = window.SCANS_DATA.evaluateHU(huVal);
    var item = res.matched;

    el.huValDisplay.textContent = (huVal > 0 ? '+' : '') + huVal + ' HU';
    el.huTissueDisplay.textContent = item.name;
    el.huDescDisplay.textContent = item.desc;
    el.huChip.style.backgroundColor = item.color;
    el.huChip.style.color = item.textColor;
    el.huChip.textContent = item.name + ' (' + (huVal > 0 ? '+' : '') + huVal + ' HU)';
  }

  // --- Tabs Navigation ---
  function setupTabs() {
    el.tabBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var targetTab = btn.getAttribute('data-tab');

        el.tabBtns.forEach(function (b) { b.classList.remove('active'); });
        el.tabPanels.forEach(function (p) { p.classList.remove('active'); });

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
      el.visionApiKeyInput.value = savedKey;
      el.apiKeyFeedback.textContent = 'Active key stored privately in local browser storage.';
      el.apiKeyFeedback.style.color = 'var(--color-normal)';
    }

    el.btnSaveApiKey.addEventListener('click', function () {
      var val = el.visionApiKeyInput.value.trim();
      window.OCR_PARSER.saveApiKey(val);
      el.apiKeyFeedback.textContent = val ? 'Saved successfully!' : 'Key removed.';
      el.apiKeyFeedback.style.color = 'var(--color-normal)';
    });

    el.openOcrBtn.addEventListener('click', function () {
      el.ocrModal.classList.add('open');
    });

    el.closeOcrBtn.addEventListener('click', function () {
      el.ocrModal.classList.remove('open');
    });

    el.dropZone.addEventListener('click', function () {
      el.fileInput.click();
    });

    el.fileInput.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (file) handleImageFile(file);
    });

    // Drag and drop
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

    // Manual paste parse
    el.btnParsePasted.addEventListener('click', function () {
      var text = el.pasteTextInput.value;
      if (!text.trim()) return;
      var results = window.OCR_PARSER.parseReportText(text);
      displayDetectedResults(results, 'Pasted text parsed.');
    });
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

        el.pasteTextInput.value = extractedText;
        var results = window.OCR_PARSER.parseReportText(extractedText);
        displayDetectedResults(results, 'Vision OCR completed successfully!');
      });
    };
    reader.readAsDataURL(file);
  }

  function showOcrStatus(msg, type) {
    el.ocrStatus.textContent = msg;
    el.ocrStatus.className = 'ocr-status ' + (type || '');
  }

  function displayDetectedResults(results, successMsg) {
    showOcrStatus(successMsg + ' Found ' + results.detectedLabTests.length + ' lab markers and ' + results.detectedScanTerms.length + ' radiology terms.', 'success');
    el.detectedList.innerHTML = '';

    if (!results.detectedLabTests.length && !results.detectedScanTerms.length) {
      el.detectedList.innerHTML = '<p style="font-size:0.85rem;color:var(--text-muted);">No specific matching test names or numbers recognized. You can type them into the form directly.</p>';
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

      row.innerHTML =
        '<div><strong>' + tObj.name + '</strong>: ' + dt.value + ' ' + tObj.defaultUnit +
        '<div style="font-size:0.75rem;color:var(--text-muted);">' + dt.rawMatched + '</div></div>' +
        '<button type="button" class="btn-secondary" style="font-size:0.75rem;padding:0.3rem 0.6rem;">Load into Form</button>';

      row.querySelector('button').addEventListener('click', function () {
        loadTestIntoForm(dt.testId, dt.value);
        el.ocrModal.classList.remove('open');
      });

      el.detectedList.appendChild(row);
    });

    // List detected radiology terms
    results.detectedScanTerms.forEach(function (term) {
      var row = document.createElement('div');
      row.style.padding = '0.5rem';
      row.style.borderBottom = '1px solid var(--border-color)';
      row.style.fontSize = '0.85rem';
      row.innerHTML = '<strong>' + term.term + '</strong> (' + term.category + '): <span style="color:var(--text-heading);">' + term.plainEnglish + '</span>';
      el.detectedList.appendChild(row);
    });
  }

  function loadTestIntoForm(testId, val) {
    var tObj = window.LAB_DATA.tests[testId];
    if (!tObj) return;

    currentCategory = tObj.categoryId;
    currentTestId = testId;

    el.categorySelect.value = currentCategory;
    populateTests(currentCategory);
    el.testSelect.value = currentTestId;
    el.valueInput.value = val;

    // Switch to tab 1
    el.tabBtns[0].click();
    updateEvaluation();
  }

  // --- Initialization ---
  document.addEventListener('DOMContentLoaded', function () {
    initElements();
    populateCategories();
    populateTests(currentCategory);

    // Initial evaluation
    el.valueInput.value = 14.5; // sample normal Hb
    updateEvaluation();

    // Event listeners
    el.categorySelect.addEventListener('change', function () {
      currentCategory = el.categorySelect.value;
      populateTests(currentCategory);
      updateEvaluation();
    });

    el.testSelect.addEventListener('change', function () {
      currentTestId = el.testSelect.value;
      populateUnits(currentTestId);
      renderPresets(currentTestId);
      updateEvaluation();
    });

    el.valueInput.addEventListener('input', updateEvaluation);
    el.unitSelect.addEventListener('change', updateEvaluation);

    el.demographicInputs.forEach(function (radio) {
      radio.addEventListener('change', function () {
        currentDemographic = this.value;
        renderPresets(currentTestId);
        updateEvaluation();
      });
    });

    // Radiology Explorer events
    renderScanTerms('');
    updateHU();
    el.huSlider.addEventListener('input', updateHU);
    el.scanSearchInput.addEventListener('input', function () {
      renderScanTerms(el.scanSearchInput.value);
    });

    setupTabs();
    setupOCR();
  });

})();
