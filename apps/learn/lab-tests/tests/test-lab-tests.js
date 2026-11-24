/**
 * Automated Unit Test Suite for Lab & Scan Explainer
 * Run with: node test-lab-tests.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Mock browser global window
global.window = global;

// Load core files
require('../core/tests-data.js');
require('../core/scans-data.js');
require('../core/ocr-parser.js');

let passed = 0;
let failed = 0;

function test(desc, fn) {
  try {
    fn();
    console.log(`  ✓ ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(err);
    failed++;
  }
}

console.log('--- Running Lab & Scan Explainer Tests ---');

// 1. Clinical Lab Data Evaluation Tests
test('Hemoglobin normal evaluation for adult male', () => {
  const res = window.LAB_DATA.evaluate('hb', 14.5, 'g_dl', 'male');
  assert(res !== null, 'Result should not be null');
  assert.strictEqual(res.status, 'normal');
  assert.strictEqual(res.tone, 'normal');
  assert(res.percent >= 30 && res.percent <= 70, 'Percent should be within normal range');
});

test('Hemoglobin low evaluation for adult male', () => {
  const res = window.LAB_DATA.evaluate('hb', 10.5, 'g_dl', 'male');
  assert.strictEqual(res.status, 'low');
  assert.strictEqual(res.tone, 'warning');
});

test('Hemoglobin critical low evaluation', () => {
  const res = window.LAB_DATA.evaluate('hb', 6.0, 'g_dl', 'male');
  assert.strictEqual(res.status, 'low_critical');
  assert.strictEqual(res.tone, 'critical');
});

test('Demographic sensitivity: 12.5 g/dL Hb is normal for female but low for male', () => {
  const femaleRes = window.LAB_DATA.evaluate('hb', 12.5, 'g_dl', 'female');
  const maleRes = window.LAB_DATA.evaluate('hb', 12.5, 'g_dl', 'male');
  assert.strictEqual(femaleRes.status, 'normal');
  assert.strictEqual(maleRes.status, 'low');
});

test('Fasting Blood Glucose evaluation (mg/dL and mmol/L)', () => {
  // 90 mg/dL is normal
  const normalRes = window.LAB_DATA.evaluate('fasting_glucose', 90, 'mg_dl', 'male');
  assert.strictEqual(normalRes.status, 'normal');

  // 115 mg/dL is prediabetes (high)
  const highRes = window.LAB_DATA.evaluate('fasting_glucose', 115, 'mg_dl', 'male');
  assert.strictEqual(highRes.status, 'high');

  // 5.0 mmol/L (~90 mg/dL) is normal
  const mmolRes = window.LAB_DATA.evaluate('fasting_glucose', 5.0, 'mmol_l', 'male');
  assert.strictEqual(mmolRes.status, 'normal');
});

test('Serum Creatinine evaluation', () => {
  const res = window.LAB_DATA.evaluate('creatinine', 0.9, 'mg_dl', 'male');
  assert.strictEqual(res.status, 'normal');
  assert(res.explanation.length > 20);
});

// 2. Radiology & Hounsfield Units Tests
test('CT Hounsfield Units evaluation for Air (-1000 HU)', () => {
  const res = window.SCANS_DATA.evaluateHU(-1000);
  assert.strictEqual(res.matched.name, 'Air');
  assert.strictEqual(res.matched.color, '#111827');
});

test('CT Hounsfield Units evaluation for Water (0 HU)', () => {
  const res = window.SCANS_DATA.evaluateHU(0);
  assert(res.matched.name.includes('Water'));
});

test('CT Hounsfield Units evaluation for Soft Tissue (+40 HU)', () => {
  const res = window.SCANS_DATA.evaluateHU(40);
  assert(res.matched.name.includes('Soft Tissue'));
});

test('CT Hounsfield Units evaluation for Dense Bone (+750 HU)', () => {
  const res = window.SCANS_DATA.evaluateHU(750);
  assert(res.matched.name.includes('Bone'));
});

test('Radiology terms keyword search', () => {
  const ggoMatches = window.SCANS_DATA.searchTerms('ground-glass');
  assert(ggoMatches.length >= 1, 'Should find Ground-Glass Opacity');
  assert.strictEqual(ggoMatches[0].category, 'Lungs & Thorax');

  const unremarkableMatches = window.SCANS_DATA.searchTerms('unremarkable');
  assert(unremarkableMatches.length >= 1);
  assert.strictEqual(unremarkableMatches[0].isReassuring, true);
});

// 3. OCR and Report Text Parsing Tests
test('Regex parser extracts CBC and metabolic values from report text', () => {
  const sampleReport = `
    DIAGNOSTIC PATHOLOGY LABORATORY REPORT
    PATIENT: John Doe     AGE: 42     SEX: Male
    -------------------------------------------------
    COMPLETE BLOOD COUNT (CBC):
    HEMOGLOBIN (Hb) : 13.2 g/dL       (Ref: 13.8 - 17.2)
    TOTAL LEUKOCYTE COUNT (WBC) : 8,400 /mcL (Ref: 4,500 - 11,000)
    PLATELET COUNT : 240,000 /cumm    (Ref: 150,000 - 450,000)
    
    METABOLIC PROFILE:
    FASTING BLOOD SUGAR (FBS) : 108 mg/dL (Ref: 70 - 99)
    SERUM CREATININE : 1.1 mg/dL      (Ref: 0.7 - 1.3)
    TOTAL CHOLESTEROL : 215 mg/dL     (Ref: < 200)
  `;

  const parsed = window.OCR_PARSER.parseReportText(sampleReport);
  assert(parsed.detectedLabTests.length >= 5, `Expected >= 5 detected tests, got ${parsed.detectedLabTests.length}`);

  const hb = parsed.detectedLabTests.find(t => t.testId === 'hb');
  assert(hb && hb.value === 13.2, 'Hb should be 13.2');
  assert.strictEqual(hb.unitId, 'g_dl');
  assert.strictEqual(hb.unitKnown, true);

  const wbc = parsed.detectedLabTests.find(t => t.testId === 'wbc');
  assert(wbc && wbc.value === 8400, 'WBC should be 8400');

  const fbs = parsed.detectedLabTests.find(t => t.testId === 'fasting_glucose');
  assert(fbs && fbs.value === 108, 'FBS should be 108');

  const creat = parsed.detectedLabTests.find(t => t.testId === 'creatinine');
  assert(creat && creat.value === 1.1, 'Creatinine should be 1.1');

  const chol = parsed.detectedLabTests.find(t => t.testId === 'total_cholesterol');
  assert(chol && chol.value === 215, 'Cholesterol should be 215');
});

test('Regex parser extracts radiology impressions from scan text', () => {
  const scanReport = `
    HIGH RESOLUTION COMPUTED TOMOGRAPHY (HRCT) THORAX
    FINDINGS:
    Trachea and major bronchi are normal.
    Patchy peripheral areas of ground-glass opacity noted in right lower lobe.
    No consolidation. No pleural effusion.
    Visualized upper abdomen is unremarkable.
  `;

  const parsed = window.OCR_PARSER.parseReportText(scanReport);
  const termNames = parsed.detectedScanTerms.map(t => t.term.toLowerCase());

  assert(termNames.some(t => t.includes('ground-glass')), 'Should detect GGO');
  assert(termNames.some(t => t.includes('consolidation')), 'Should detect consolidation');
  assert(termNames.some(t => t.includes('pleural effusion')), 'Should detect pleural effusion');
  assert(termNames.some(t => t.includes('unremarkable')), 'Should detect unremarkable');
});


test('Parser maps Hemoglobin 145 g/L to unit g_l', () => {
  const parsed = window.OCR_PARSER.parseReportText('Hemoglobin 145 g/L');
  const hb = parsed.detectedLabTests.find(t => t.testId === 'hb');
  assert(hb, 'Hb should be detected');
  assert.strictEqual(hb.value, 145);
  assert.strictEqual(hb.unitId, 'g_l');
  assert.strictEqual(hb.unitKnown, true);
});

test('Parser maps Glucose 5.4 mmol/L to unit mmol_l', () => {
  const parsed = window.OCR_PARSER.parseReportText('Glucose 5.4 mmol/L');
  const g = parsed.detectedLabTests.find(t => t.testId === 'fasting_glucose');
  assert(g, 'Glucose should be detected');
  assert.strictEqual(g.value, 5.4);
  assert.strictEqual(g.unitId, 'mmol_l');
  assert.strictEqual(g.unitKnown, true);
});

test('Parser maps Platelets 2.5 lakh to unit lakh_mcl', () => {
  const parsed = window.OCR_PARSER.parseReportText('Platelets 2.5 lakh');
  const plt = parsed.detectedLabTests.find(t => t.testId === 'platelets');
  assert(plt, 'Platelets should be detected');
  assert.strictEqual(plt.value, 2.5);
  assert.strictEqual(plt.unitId, 'lakh_mcl');
  assert.strictEqual(plt.unitKnown, true);
});

test('Parser marks missing units as unread and uses the default', () => {
  const parsed = window.OCR_PARSER.parseReportText('Hemoglobin 13.2');
  const hb = parsed.detectedLabTests.find(t => t.testId === 'hb');
  assert(hb, 'Hb should be detected');
  assert.strictEqual(hb.value, 13.2);
  assert.strictEqual(hb.unitId, 'g_dl');
  assert.strictEqual(hb.unitKnown, false);
});

console.log(`\nTests Completed: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
