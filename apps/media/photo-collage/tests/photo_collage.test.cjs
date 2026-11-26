const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const appDir = path.resolve(__dirname, '..');
const PhotoCollage = require(path.join(appDir, 'photo_collage.js'));

test('Syntax check on photo_collage.js via node --check', () => {
  const jsPath = path.join(appDir, 'photo_collage.js');
  assert.doesNotThrow(() => {
    execSync(`node --check "${jsPath}"`);
  });
});

test('LAYOUTS definition has 4-grid (4 slots), 2-stack (2 slots), 2-split (2 slots), 1-full (1 slot)', () => {
  assert.equal(PhotoCollage.getSlotsPerPage('4-grid'), 4);
  assert.equal(PhotoCollage.getSlotsPerPage('2-stack'), 2);
  assert.equal(PhotoCollage.getSlotsPerPage('2-split'), 2);
  assert.equal(PhotoCollage.getSlotsPerPage('1-full'), 1);
  assert.equal(PhotoCollage.getSlotsPerPage('unknown'), 4);
});

test('calcTotalPages auto-expands pages dynamically for multi-photo drops', () => {
  // Layout 4-grid (4 slots per page)
  assert.equal(PhotoCollage.calcTotalPages(0, 4), 1, 'Empty state defaults to 1 page');
  assert.equal(PhotoCollage.calcTotalPages(1, 4), 1);
  assert.equal(PhotoCollage.calcTotalPages(4, 4), 1);
  assert.equal(PhotoCollage.calcTotalPages(5, 4), 2, '5 photos expand to 2 pages');
  assert.equal(PhotoCollage.calcTotalPages(8, 4), 2, '8 photos with 4 slots/page expand to 2 pages');
  assert.equal(PhotoCollage.calcTotalPages(10, 4), 3, '10 photos expand to 3 pages');

  // Layout 2-stack / 2-split (2 slots per page)
  assert.equal(PhotoCollage.calcTotalPages(2, 2), 1);
  assert.equal(PhotoCollage.calcTotalPages(3, 2), 2);
  assert.equal(PhotoCollage.calcTotalPages(8, 2), 4, '8 photos with 2 slots/page expand to 4 pages');

  // Manual page count overrides if larger than photo requirement
  assert.equal(PhotoCollage.calcTotalPages(2, 4, 3), 3, 'Manual blank pages preserved');
});

test('createPhotoItem initializes clean photo record with 0 deg rotation and contain (Full) fit', () => {
  const item = PhotoCollage.createPhotoItem('data:image/png;base64,sample', 'vacation.png');
  assert.ok(item.id.startsWith('photo_'));
  assert.equal(item.src, 'data:image/png;base64,sample');
  assert.equal(item.name, 'vacation.png');
  assert.equal(item.rotation, 0);
  assert.equal(item.fit, 'contain');
});

test('rotatePhoto increments rotation in 90 degree clockwise increments', () => {
  const photo = PhotoCollage.createPhotoItem('sample.jpg', 'sample.jpg');
  assert.equal(photo.rotation, 0);

  assert.equal(PhotoCollage.rotatePhoto(photo, 90), 90);
  assert.equal(photo.rotation, 90);

  assert.equal(PhotoCollage.rotatePhoto(photo, 90), 180);
  assert.equal(PhotoCollage.rotatePhoto(photo, 90), 270);
  assert.equal(PhotoCollage.rotatePhoto(photo, 90), 0, 'Cycles cleanly back to 0');

  // Negative / counter-clockwise rotation
  assert.equal(PhotoCollage.rotatePhoto(photo, -90), 270);
});

test('swapPhotos exchanges positions between two slots', () => {
  const p1 = PhotoCollage.createPhotoItem('img1.png', 'p1');
  const p2 = PhotoCollage.createPhotoItem('img2.png', 'p2');
  const list = [p1, p2];

  assert.ok(PhotoCollage.swapPhotos(list, 0, 1));
  assert.equal(list[0].name, 'p2');
  assert.equal(list[1].name, 'p1');

  // Sparse swap
  assert.ok(PhotoCollage.swapPhotos(list, 1, 3));
  assert.equal(list[1], null);
  assert.equal(list[3].name, 'p1');
});

test('removePhotoAt splices photo item from list', () => {
  const p1 = PhotoCollage.createPhotoItem('img1.png', 'p1');
  const p2 = PhotoCollage.createPhotoItem('img2.png', 'p2');
  const list = [p1, p2];

  const removed = PhotoCollage.removePhotoAt(list, 0);
  assert.equal(removed.name, 'p1');
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'p2');
});

test('index.html redirects to photo-collage.html and detects theme', () => {
  const html = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
  assert.match(html, /photo-collage\.html/);
  assert.match(html, /sites-hub\.theme/);
});

test('photo-collage.html contains title bar action buttons, toolbar controls, and drop zone', () => {
  const html = fs.readFileSync(path.join(appDir, 'photo-collage.html'), 'utf8');
  assert.match(html, /id="titlebar"/);
  assert.match(html, /class="titlebar-actions"/);
  assert.match(html, /id="layout-select"/);
  assert.match(html, /id="orient-select"/);
  assert.match(html, /id="paper-select"/);
  assert.match(html, /id="btn-undo"/);
  assert.match(html, /id="btn-redo"/);
  assert.match(html, /id="btn-add-photos"/);
  assert.match(html, /id="btn-add-page"/);
  assert.match(html, /id="btn-print"/);
  assert.match(html, /id="btn-pdf"/);
  assert.match(html, /id="btn-clear"/);
  assert.match(html, /id="sheets-container"/);
  assert.match(html, /id="global-drop-zone"/);
  assert.match(html, /vendor\/jspdf\.umd\.min\.js/);
});

test('photo-collage.css specifies @media print rules and sheet page sizing', () => {
  const css = fs.readFileSync(path.join(appDir, 'photo-collage.css'), 'utf8');
  assert.match(css, /@media print/);
  assert.match(css, /@page/);
  assert.match(css, /page-break-after:\s*always/);
  assert.match(css, /break-after:\s*page/);
  assert.match(css, /210mm/);
  assert.match(css, /297mm/);
});

test('Bundled jspdf vendor file exists and is valid', () => {
  const jspdfPath = path.join(appDir, 'vendor', 'jspdf.umd.min.js');
  assert.ok(fs.existsSync(jspdfPath));
  const stat = fs.statSync(jspdfPath);
  assert.ok(stat.size > 100000, 'jsPDF vendor size should exceed 100KB');
});

test('photo-collage_icon.png exists and is a valid PNG', () => {
  const iconPath = path.join(appDir, 'photo-collage_icon.png');
  assert.ok(fs.existsSync(iconPath));
  const buffer = fs.readFileSync(iconPath);
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  assert.equal(buffer[0], 0x89);
  assert.equal(buffer[1], 0x50);
  assert.equal(buffer[2], 0x4e);
  assert.equal(buffer[3], 0x47);
});

test('apps/media/media-apps.csv has Photo Collage registered under Photo section', () => {
  const csvPath = path.resolve(appDir, '..', 'media-apps.csv');
  const csv = fs.readFileSync(csvPath, 'utf8');
  assert.match(csv, /^Photo Collage,\s*photo-collage\/,\s*,\s*,\s*Photo,/m);
});

test('calcPrintSlotDimensions computes 3:1 aspect ratio on 2-stack A4 landscape', () => {
  const dims = PhotoCollage.calcPrintSlotDimensions('a4', 'landscape', '2-stack', 'normal');
  assert.equal(dims.pageW, 297);
  assert.equal(dims.pageH, 210);
  assert.ok(dims.slotW > 280, 'Slot width should exceed 280mm');
  assert.ok(dims.slotH < 95, 'Slot height should be ~93mm');
  assert.ok(dims.aspect > 2.8 && dims.aspect < 3.2, 'Aspect ratio should be ~3:1');
});

test('applySlotRotationAndFit applies transverse dimensions to 90 and 270 deg rotated images in 2-photo slot', () => {
  const photo = PhotoCollage.createPhotoItem('sample.jpg', 'sample.jpg');
  const dummySlot = {
    styleMap: {},
    style: {
      setProperty: function (k, v) { dummySlot.styleMap[k] = v; }
    },
    getBoundingClientRect: function () {
      return { width: 300, height: 100 };
    },
    offsetWidth: 300,
    offsetHeight: 100
  };

  const dummyImg = {
    attrs: {},
    style: {},
    className: '',
    setAttribute: function (k, v) { dummyImg.attrs[k] = String(v); }
  };

  // Test 0 deg
  PhotoCollage.applySlotRotationAndFit(dummyImg, dummySlot, photo);
  assert.equal(dummyImg.style.width, '100%');
  assert.equal(dummyImg.style.height, '100%');
  assert.equal(dummySlot.styleMap['--slot-w'], '300px');
  assert.equal(dummySlot.styleMap['--slot-h'], '100px');

  // Test 90 deg rotation -> transverse inversion (width becomes slotHeight, height becomes slotWidth)
  photo.rotation = 90;
  PhotoCollage.applySlotRotationAndFit(dummyImg, dummySlot, photo);
  assert.equal(dummyImg.style.width, '100px', 'Rotated image width must match slot height to prevent horizontal gaps');
  assert.equal(dummyImg.style.height, '300px', 'Rotated image height must match slot width');

  // Test 270 deg rotation
  photo.rotation = 270;
  PhotoCollage.applySlotRotationAndFit(dummyImg, dummySlot, photo);
  assert.equal(dummyImg.style.width, '100px');
  assert.equal(dummyImg.style.height, '300px');

  // Test 180 deg rotation
  photo.rotation = 180;
  PhotoCollage.applySlotRotationAndFit(dummyImg, dummySlot, photo);
  assert.equal(dummyImg.style.width, '100%');
  assert.equal(dummyImg.style.height, '100%');
});

test('serializeState generates versioned payload with complete photo and layout metadata', () => {
  const p1 = PhotoCollage.createPhotoItem('data:image/png;base64,abc', 'vacation.jpg');
  p1.rotation = 90;
  p1.fit = 'contain';

  const mockState = {
    layout: '2-stack',
    orientation: 'landscape',
    paper: 'letter',
    margin: 'wide',
    bgColor: '#faf8f5',
    manualPages: 3,
    photos: [p1, null]
  };

  const payload = PhotoCollage.serializeState(mockState);
  assert.equal(payload.version, 1);
  assert.equal(payload.layout, '2-stack');
  assert.equal(payload.orientation, 'landscape');
  assert.equal(payload.paper, 'letter');
  assert.equal(payload.margin, 'wide');
  assert.equal(payload.bgColor, '#faf8f5');
  assert.equal(payload.manualPages, 3);
  assert.equal(payload.photos.length, 2);
  assert.equal(payload.photos[0].name, 'vacation.jpg');
  assert.equal(payload.photos[0].rotation, 90);
  assert.equal(payload.photos[0].fit, 'contain');
  assert.equal(payload.photos[1], null);
  assert.ok(payload.savedAt > 0);
});

test('deserializeState hydrates target state accurately and sanitizes invalid values', () => {
  const targetState = {
    layout: '4-grid',
    orientation: 'portrait',
    paper: 'a4',
    margin: 'normal',
    bgColor: '#ffffff',
    manualPages: 1,
    photos: []
  };

  const record = {
    layout: '2-split',
    orientation: 'landscape',
    paper: 'letter',
    margin: 'small',
    bgColor: '#181a1f',
    manualPages: 2,
    photos: [
      { id: 'custom_1', src: 'data:img1', name: 'photo1.jpg', rotation: 270, fit: 'contain' }
    ]
  };

  const ok = PhotoCollage.deserializeState(record, targetState);
  assert.ok(ok);
  assert.equal(targetState.layout, '2-split');
  assert.equal(targetState.orientation, 'landscape');
  assert.equal(targetState.paper, 'letter');
  assert.equal(targetState.margin, 'small');
  assert.equal(targetState.bgColor, '#181a1f');
  assert.equal(targetState.manualPages, 2);
  assert.equal(targetState.photos.length, 1);
  assert.equal(targetState.photos[0].id, 'custom_1');
  assert.equal(targetState.photos[0].rotation, 270);
  assert.equal(targetState.photos[0].fit, 'contain');

  // Rejects invalid payload gracefully
  assert.equal(PhotoCollage.deserializeState(null, targetState), false);
  assert.equal(PhotoCollage.deserializeState('string', targetState), false);
});

test('history manager createSnapshot and restoreSnapshot perform deep state cloning', () => {
  const source = {
    layout: '2-stack',
    orientation: 'landscape',
    paper: 'letter',
    margin: 'wide',
    bgColor: '#faf8f5',
    manualPages: 2,
    photos: [
      { id: 'p1', src: 'data:img1', name: 'photo1.jpg', rotation: 90, fit: 'cover' }
    ]
  };

  const snap = PhotoCollage.createSnapshot(source);
  assert.equal(snap.layout, '2-stack');
  assert.equal(snap.photos[0].rotation, 90);

  const dest = { layout: '4-grid', photos: [] };
  const ok = PhotoCollage.restoreSnapshot(snap, dest);
  assert.ok(ok);
  assert.equal(dest.layout, '2-stack');
  assert.equal(dest.photos.length, 1);
  assert.equal(dest.photos[0].id, 'p1');

  // Mutating dest does not alter snapshot
  dest.photos[0].rotation = 180;
  assert.equal(snap.photos[0].rotation, 90);
});

test('pushHistory, undo, and redo manage bounded history stack reversibility', () => {
  PhotoCollage.clearHistory();
  const hist0 = PhotoCollage.getHistoryState();
  assert.equal(hist0.undoCount, 0);
  assert.equal(hist0.redoCount, 0);

  // Undo and redo on empty stack return false
  assert.equal(PhotoCollage.undo(), false);
  assert.equal(PhotoCollage.redo(), false);

  const currentState = PhotoCollage.getState();
  currentState.layout = '4-grid';
  currentState.photos = [];

  // Action 1: Add a photo
  PhotoCollage.pushHistory(currentState);
  currentState.photos.push(PhotoCollage.createPhotoItem('data:img1', 'img1.jpg'));

  let hist = PhotoCollage.getHistoryState();
  assert.equal(hist.undoCount, 1);
  assert.equal(hist.redoCount, 0);

  // Action 2: Rotate photo to 90 deg
  PhotoCollage.pushHistory(currentState);
  currentState.photos[0].rotation = 90;

  hist = PhotoCollage.getHistoryState();
  assert.equal(hist.undoCount, 2);

  // Undo 1: Reverts rotation back to 0
  const undo1 = PhotoCollage.undo();
  assert.ok(undo1);
  assert.equal(currentState.photos[0].rotation, 0);
  hist = PhotoCollage.getHistoryState();
  assert.equal(hist.undoCount, 1);
  assert.equal(hist.redoCount, 1);

  // Redo 1: Re-applies rotation to 90
  const redo1 = PhotoCollage.redo();
  assert.ok(redo1);
  assert.equal(currentState.photos[0].rotation, 90);
  hist = PhotoCollage.getHistoryState();
  assert.equal(hist.undoCount, 2);
  assert.equal(hist.redoCount, 0);

  // Undo 2: Reverts rotation to 0, then Undo 3: Reverts back to 0 photos
  PhotoCollage.undo(); // back to rot 0
  assert.equal(currentState.photos[0].rotation, 0);
  PhotoCollage.undo(); // back to empty photos
  assert.equal(currentState.photos.length, 0);

  // History stack is bounded at 30 entries
  PhotoCollage.clearHistory();
  for (let i = 0; i < 35; i++) {
    PhotoCollage.pushHistory(currentState);
  }
  hist = PhotoCollage.getHistoryState();
  assert.equal(hist.undoCount, 30);
});

test('undo safely restores photos cleared via Clear All action', () => {
  PhotoCollage.clearHistory();
  const st = PhotoCollage.getState();
  st.photos = [
    PhotoCollage.createPhotoItem('data:sample1', 'sample1.jpg'),
    PhotoCollage.createPhotoItem('data:sample2', 'sample2.jpg')
  ];
  st.manualPages = 2;

  // Simulate user clicking Clear All
  PhotoCollage.pushHistory(st);
  st.photos = [];
  st.manualPages = 1;

  assert.equal(st.photos.length, 0);

  // Undo restores both photos and page count
  const reverted = PhotoCollage.undo();
  assert.ok(reverted);
  assert.equal(st.photos.length, 2);
  assert.equal(st.photos[0].name, 'sample1.jpg');
  assert.equal(st.photos[1].name, 'sample2.jpg');
  assert.equal(st.manualPages, 2);
});

test('photo-collage.html and photo-collage.css contain crop modal and tile crop button support', () => {
  const html = fs.readFileSync(path.join(appDir, 'photo-collage.html'), 'utf8');
  const css = fs.readFileSync(path.join(appDir, 'photo-collage.css'), 'utf8');
  assert.match(html, /id="crop-modal"/);
  assert.match(html, /id="crop-canvas"/);
  assert.match(html, /id="crop-box"/);
  assert.match(html, /id="btn-crop-apply"/);
  assert.match(html, /id="btn-crop-reset"/);
  assert.match(css, /\.crop-modal\b/);
  assert.match(css, /95dvw/);
  assert.match(css, /95dvh/);
  assert.match(css, /\.crop-box\b/);
  assert.match(css, /\.crop-handle\b/);
});

test('normalizeCrop clamps out-of-bounds values and treats full frame as null', () => {
  assert.equal(PhotoCollage.normalizeCrop(null), null);
  assert.equal(PhotoCollage.normalizeCrop({ x: 0, y: 0, w: 1, h: 1 }), null);
  assert.equal(PhotoCollage.normalizeCrop({ x: -0.1, y: 0, w: 1.2, h: 1.1 }), null);
  assert.equal(PhotoCollage.normalizeCrop({ x: 0, y: 0, w: 0, h: 0.5 }), null);

  const clamped = PhotoCollage.normalizeCrop({ x: -0.2, y: 0.98, w: 0.01, h: 0.5 });
  assert.ok(clamped);
  assert.equal(clamped.x, 0);
  assert.ok(clamped.y <= 0.95);
  assert.ok(clamped.w >= 0.05);
  assert.ok(clamped.y + clamped.h <= 1.0001);
});

test('cropToVisual and visualToCrop round-trip across 0, 90, 180, and 270 degree rotations', () => {
  const orig = { x: 0.1, y: 0.2, w: 0.4, h: 0.3 };
  [0, 90, 180, 270].forEach((rot) => {
    const visual = PhotoCollage.cropToVisual(orig, rot);
    const back = PhotoCollage.visualToCrop(visual, rot);
    assert.ok(back, 'Round-trip should not be null for rotation ' + rot);
    assert.ok(Math.abs(back.x - orig.x) < 1e-3, 'x mismatch at ' + rot);
    assert.ok(Math.abs(back.y - orig.y) < 1e-3, 'y mismatch at ' + rot);
    assert.ok(Math.abs(back.w - orig.w) < 1e-3, 'w mismatch at ' + rot);
    assert.ok(Math.abs(back.h - orig.h) < 1e-3, 'h mismatch at ' + rot);
  });
});

test('calcSourceCropRect and computeAspectCropRect compute pixel bounds and centered ratios accurately', () => {
  const full = PhotoCollage.calcSourceCropRect(2000, 1000, null);
  assert.deepEqual(full, { sx: 0, sy: 0, sw: 2000, sh: 1000 });

  const sub = PhotoCollage.calcSourceCropRect(2000, 1000, { x: 0.25, y: 0.1, w: 0.5, h: 0.8 });
  assert.deepEqual(sub, { sx: 500, sy: 100, sw: 1000, sh: 800 });

  const squareOnWide = PhotoCollage.computeAspectCropRect(2000, 1000, 1);
  assert.equal(squareOnWide.w, 0.5);
  assert.equal(squareOnWide.h, 1);
  assert.equal(squareOnWide.x, 0.25);
  assert.equal(squareOnWide.y, 0);
});

test('stepCropBoxDrag supports moving, free resize, and aspect-locked corner resize', () => {
  const moved = PhotoCollage.stepCropBoxDrag({ x: 0.2, y: 0.2, w: 0.4, h: 0.4 }, 'move', 0.9, -0.5, 1000, 1000, null);
  assert.equal(moved.x, 0.6);
  assert.equal(moved.y, 0);
  assert.equal(moved.w, 0.4);

  const freeSe = PhotoCollage.stepCropBoxDrag({ x: 0.1, y: 0.1, w: 0.4, h: 0.4 }, 'se', 0.2, -0.1, 1000, 1000, null);
  assert.equal(freeSe.x, 0.1);
  assert.equal(freeSe.y, 0.1);
  assert.equal(freeSe.w, 0.6);
  assert.equal(freeSe.h, 0.3);

  const lockedSe = PhotoCollage.stepCropBoxDrag({ x: 0.1, y: 0.1, w: 0.4, h: 0.2 }, 'se', 0.2, 0.05, 1000, 1000, 2);
  assert.equal(lockedSe.w, 0.6);
  assert.equal(lockedSe.h, 0.3);
});

test('serializeState, deserializeState, and Undo/Redo preserve photo crop metadata', () => {
  PhotoCollage.clearHistory();
  const st = PhotoCollage.getState();
  const item = PhotoCollage.createPhotoItem('data:img1', 'portrait.jpg');
  assert.equal(item.crop, null);
  st.photos = [item];

  PhotoCollage.pushHistory(st);
  item.crop = { x: 0.1, y: 0.15, w: 0.7, h: 0.65 };

  const serialized = PhotoCollage.serializeState(st);
  assert.deepEqual(serialized.photos[0].crop, { x: 0.1, y: 0.15, w: 0.7, h: 0.65 });

  const restored = { layout: '4-grid', orientation: 'portrait', paper: 'a4', margin: 'normal', bgColor: '#ffffff', manualPages: 1, photos: [] };
  assert.ok(PhotoCollage.deserializeState(serialized, restored));
  assert.deepEqual(restored.photos[0].crop, { x: 0.1, y: 0.15, w: 0.7, h: 0.65 });

  assert.ok(PhotoCollage.undo());
  assert.equal(st.photos[0].crop, null);
  assert.ok(PhotoCollage.redo());
  assert.deepEqual(st.photos[0].crop, { x: 0.1, y: 0.15, w: 0.7, h: 0.65 });
});
