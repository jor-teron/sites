/* PDF Viewer — tests/pv1.test.cjs: pure helpers (fit, zoom, pages, LRU). PV1 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const H = require(path.join(__dirname, '..', 'pv_helpers.js'));

test('PV1 clampZoom clamps and snaps to 0.25 steps', () => {
  assert.equal(H.clampZoom(0.1), 0.5);
  assert.equal(H.clampZoom(3.5), 3);
  assert.equal(H.clampZoom(1.12), 1);
  assert.equal(H.clampZoom(1.2), 1.25);
  assert.equal(H.clampZoom(NaN), 1);
});

test('PV1 stepZoom moves by 25% within 50%–300%', () => {
  assert.equal(H.stepZoom(1, 1), 1.25);
  assert.equal(H.stepZoom(1, -1), 0.75);
  assert.equal(H.stepZoom(0.5, -1), 0.5);
  assert.equal(H.stepZoom(3, 1), 3);
});

test('PV1 fitScale is container/page width (minus padding)', () => {
  assert.equal(H.fitScale(612, 612, 0), 1);
  assert.equal(H.fitScale(612, 1224, 0), 2);
  assert.equal(H.fitScale(600, 624, 24), 1);
  assert.ok(H.fitScale(100, 0, 0) > 0);
});

test('PV1 displayScale = fit * zoom', () => {
  assert.equal(H.displayScale(2, 1), 2);
  assert.equal(H.displayScale(2, 0.5), 1);
  assert.equal(H.displayScale(2, 1.5), 3);
});

test('PV1 zoomLabel shows Fit at 100%', () => {
  assert.equal(H.zoomLabel(1), 'Fit');
  assert.equal(H.zoomLabel(1.25), '125%');
  assert.equal(H.zoomLabel(0.5), '50%');
});

test('PV1 pagesAround returns current ± ahead/behind', () => {
  assert.deepEqual(H.pagesAround(1, 10, 1, 1), [1, 2]);
  assert.deepEqual(H.pagesAround(5, 10, 1, 1), [4, 5, 6]);
  assert.deepEqual(H.pagesAround(10, 10, 1, 1), [9, 10]);
  assert.deepEqual(H.pagesAround(3, 3, 2, 2), [1, 2, 3]);
  assert.deepEqual(H.pagesAround(1, 0), []);
});

test('PV1 chooseEvictions frees farthest pages over budget', () => {
  // Rendered 1..8, keep around page 4 → [3,4,5], max 6 → room for 3 non-keep.
  // Non-keep rendered: 1,2,6,7,8. Closest 3 to 4 are 2,6,1? abs: 2→2,6→2,1→3,7→3,8→4
  // Sorted by distance: 2,6,1,7,8 → keep room=3 → keep 2,6,1; evict 7,8
  const evict = H.chooseEvictions([1, 2, 3, 4, 5, 6, 7, 8], [3, 4, 5], 4, 6);
  assert.deepEqual(evict, [7, 8]);
});

test('PV1 chooseEvictions keeps all when under budget', () => {
  assert.deepEqual(H.chooseEvictions([3, 4, 5], [3, 4, 5], 4, 6), []);
  assert.deepEqual(H.chooseEvictions([1, 2, 3], [2], 2, 6), []);
});

test('PV1 devicePixelRatioCapped caps at 2', () => {
  assert.equal(H.devicePixelRatioCapped(1), 1);
  assert.equal(H.devicePixelRatioCapped(3), 2);
  assert.equal(H.devicePixelRatioCapped(0.5), 1);
  assert.equal(H.devicePixelRatioCapped(2.5, 1.5), 1.5);
});

test('PV1 constants match the brief', () => {
  assert.equal(H.ZOOM_MIN, 0.5);
  assert.equal(H.ZOOM_MAX, 3);
  assert.equal(H.ZOOM_STEP, 0.25);
  assert.equal(H.MAX_RENDERED, 6);
  assert.equal(H.PRINT_PAGE_WARN, 100);
});
