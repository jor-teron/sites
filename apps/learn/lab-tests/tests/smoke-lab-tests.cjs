/**
 * LAB-1c non-browser smoke test for Lab & Scan Explainer.
 * Run with: node tests/smoke-lab-tests.cjs
 * Uses the global jsdom install (npm root -g).
 */
'use strict';

const path = require('path');
const assert = require('assert');
const { execSync } = require('child_process');
const { JSDOM, VirtualConsole } = require(execSync('npm root -g').toString().trim() + '/jsdom');

const html = path.join(__dirname, '..', 'lab-tests.html');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', function (e) {
  errors.push(String(e && e.message ? e.message : e));
});

JSDOM.fromFile(html, {
  runScripts: 'dangerously',
  resources: 'usable',
  virtualConsole: vc,
  pretendToBeVisual: true,
  url: 'file://' + html
}).then(function (dom) {
  const w = dom.window;
  const ready = new Promise(function (resolve) {
    if (w.document.readyState === 'complete') resolve();
    else w.addEventListener('load', function () { resolve(); });
  });
  return ready.then(function () {
    return new Promise(function (resolve) { setTimeout(resolve, 400); });
  }).then(function () {
    const d = w.document;
    assert.strictEqual(errors.length, 0, 'jsdomError: ' + errors.join('; '));
    assert.strictEqual(d.title, 'Lab & Scan Explainer');

    const tabs = Array.prototype.slice.call(d.querySelectorAll('.tab-btn'));
    assert.strictEqual(tabs.length, 3, 'expected three tab buttons');
    tabs.forEach(function (btn) {
      btn.click();
      const id = btn.getAttribute('data-tab');
      const panel = d.getElementById('tab-' + id);
      assert(btn.classList.contains('active'), 'tab button ' + id + ' should be active');
      assert(panel && panel.classList.contains('active'), 'panel tab-' + id + ' should be active');
      tabs.forEach(function (other) {
        if (other === btn) return;
        const oid = other.getAttribute('data-tab');
        assert(!other.classList.contains('active'), 'other tab ' + oid + ' should not stay active');
        const op = d.getElementById('tab-' + oid);
        assert(op && !op.classList.contains('active'), 'other panel tab-' + oid + ' should not stay active');
      });
    });

    const slider = d.getElementById('hu-slider');
    const huVal = d.getElementById('hu-val-display');
    assert(slider && huVal, 'HU slider and #hu-val-display should exist');
    slider.value = '0';
    slider.dispatchEvent(new w.Event('input', { bubbles: true }));
    assert.strictEqual(huVal.textContent, '0 HU');
    slider.value = '250';
    slider.dispatchEvent(new w.Event('input', { bubbles: true }));
    assert.strictEqual(huVal.textContent, '+250 HU');

    const modal = d.getElementById('ocr-modal');
    d.getElementById('btn-open-ocr').click();
    assert(modal.classList.contains('open'), 'OCR modal should gain the open class');

    d.getElementById('paste-report-text').value = 'Hemoglobin: 13.2 g/dL <img src=x onerror=alert(1)>';
    d.getElementById('btn-parse-pasted').click();
    const imgs = d.getElementById('detected-tests-list').querySelectorAll('img');
    assert.strictEqual(imgs.length, 0, 'parsed report text must not create an <img> element');

    const tess = d.getElementById('ocr-engine-tesseract');
    const vis = d.getElementById('ocr-engine-vision');
    assert(tess && vis && tess.checked, 'on-phone OCR mode should be present and selected by default');
    assert(d.getElementById('ocr-engine-choice'), 'OCR mode choice should be present');
    assert(d.getElementById('ocr-privacy-note'), 'privacy note should be present');
    assert(!d.getElementById('vision-api-key-input'), 'the app must not keep its own Vision key input');
    assert(!d.getElementById('btn-save-api-key'), 'the app must not keep its own Vision key save button');

    console.log('  ✓ jsdom smoke: tabs, HU slider, OCR modal, no injected img, OCR mode choice, no own key input');
    console.log('Smoke Completed: 1 passed, 0 failed.');
    w.close();
  });
}).catch(function (err) {
  console.error('  ✗ jsdom smoke failed');
  console.error(err);
  process.exit(1);
});
