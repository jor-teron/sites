/* PDF Viewer — tests/pv2.test.cjs: word-box maths, find, cache keys, scale cap. PV2 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const M = require(path.join(__dirname, '..', 'pv_ocr_math.js'));

test('PV2 wordBoxToLayer maps image pixels to page percentages', () => {
  const st = M.wordBoxToLayer({ x0: 100, y0: 50, x1: 300, y1: 100 }, 1000, 500);
  assert.equal(st.leftPct, 10);
  assert.equal(st.topPct, 10);
  assert.equal(st.widthPct, 20);
  assert.equal(st.heightPct, 10);
  assert.equal(st.fontSizePct, 10);
  assert.equal(st.fontSizePx(800), 80);
});

test('PV2 wordBoxToLayer swaps inverted boxes and guards empty sizes', () => {
  const st = M.wordBoxToLayer({ x0: 40, y0: 40, x1: 10, y1: 10 }, 100, 100);
  assert.equal(st.leftPct, 10);
  assert.equal(st.topPct, 10);
  assert.equal(st.widthPct, 30);
  assert.equal(st.heightPct, 30);
  const empty = M.wordBoxToLayer({}, 0, 0);
  assert.equal(empty.leftPct, 0);
  assert.equal(empty.widthPct, 0);
});

test('PV2 fontSizePx is heightPct of the page CSS height', () => {
  assert.equal(M.fontSizePx(10, 800), 80);
  assert.equal(M.fontSizePx(0, 800), 1); // minimum 1px
});

test('PV2 scaleXFit stretches glyphs to the box width', () => {
  assert.equal(M.scaleXFit(100, 100), 1);
  assert.equal(M.scaleXFit(120, 100), 1.2);
  assert.equal(M.scaleXFit(100, 200), 0.5);
  assert.equal(M.scaleXFit(0, 100), 1);
  assert.equal(M.scaleXFit(100, 0), 1);
  assert.ok(M.scaleXFit(10000, 1) <= 8);
});

test('PV2 ocrRenderScale caps at 2x and 2048 px long side', () => {
  assert.equal(M.ocrRenderScale(400, 300), 2);
  assert.equal(M.ocrRenderScale(2000, 1000), 2048 / 2000);
  assert.equal(M.ocrRenderScale(612, 792, 3, 2, 2048), 2);
  assert.ok(M.ocrRenderScale(100, 100, 0) >= 0.25);
  assert.equal(M.OCR_SCALE, 2);
  assert.equal(M.OCR_MAX_SIDE, 2048);
});

test('PV2 hasRealText needs 20 letters or digits', () => {
  assert.equal(M.hasRealText(''), false);
  assert.equal(M.hasRealText('abc'), false);
  assert.equal(M.hasRealText('abcdefghij0123456789'), true);
  assert.equal(M.countLetters('Hello, 2 worlds!'), 12);
  assert.equal(M.hasRealText('one two', 3), true);
});

test('PV2 pageCacheKey is fingerprint|page|lang', () => {
  assert.equal(M.pageCacheKey('abc', 3, 'eng'), 'abc|3|eng');
  assert.equal(M.pageCacheKey('', 0, ''), 'unknown|1|eng');
});

test('PV2 docId prefers fingerprints, then file identity', () => {
  assert.equal(M.docId({ fingerprints: ['AAA', 'BBB'] }), 'AAA');
  assert.equal(M.docId({ fingerprint: 'OLD' }), 'OLD');
  assert.equal(M.docId({}, { name: 'a.pdf', size: 10, lastModified: 5 }), 'file:a.pdf:10:5');
  assert.equal(M.docId(), 'unknown');
});

test('PV2 normalizeWords keeps valid boxes and drops empties', () => {
  const words = M.normalizeWords([
    { text: 'Hello', bbox: { x0: 1, y0: 2, x1: 10, y1: 12 }, confidence: 90 },
    { text: '  ', bbox: { x0: 0, y0: 0, x1: 5, y1: 5 } },
    { str: 'World', bbox: { x0: 11, y0: 2, x1: 20, y1: 12 } },
    { text: 'x', bbox: { x0: 1, y0: 1, x1: 1, y1: 1 } },
    { text: 'no-box' }
  ]);
  assert.equal(words.length, 2);
  assert.equal(words[0].text, 'Hello');
  assert.equal(words[1].text, 'World');
  assert.deepEqual(words[0].bbox, { x0: 1, y0: 2, x1: 10, y1: 12 });
});

test('PV2 findMatches is case-insensitive and non-overlapping', () => {
  const hits = M.findMatches(['Hello hello', 'HELLO there'], 'hello');
  assert.deepEqual(hits, [
    { page: 1, start: 0, end: 5 },
    { page: 1, start: 6, end: 11 },
    { page: 2, start: 0, end: 5 }
  ]);
  assert.deepEqual(M.findMatches(['abc'], ''), []);
  assert.deepEqual(M.findMatches(['abc'], 'z'), []);
});

test('PV2 nextMatchIndex wraps around the list', () => {
  assert.equal(M.nextMatchIndex(-1, 3, 1), 0);
  assert.equal(M.nextMatchIndex(-1, 3, -1), 2);
  assert.equal(M.nextMatchIndex(0, 3, 1), 1);
  assert.equal(M.nextMatchIndex(2, 3, 1), 0);
  assert.equal(M.nextMatchIndex(0, 3, -1), 2);
  assert.equal(M.nextMatchIndex(0, 0, 1), -1);
});

test('PV2 joinPageText keeps lines and trims', () => {
  const text = M.joinPageText([
    { str: 'Hello', hasEOL: false },
    { str: 'world', hasEOL: true },
    { str: 'Next', hasEOL: true }
  ]);
  assert.equal(text, 'Hello world\nNext');
});
