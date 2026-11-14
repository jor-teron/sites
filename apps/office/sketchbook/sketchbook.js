/*
 * Project: sketchbook
 * File: sketchbook.js
 * Role: Wiring and start-up: event listeners, then load + first draw. Loaded last.
 */
// Attach floating button events
floatBtn.addEventListener('pointerdown', onFloatDown);
floatBtn.addEventListener('pointermove', onFloatMove);
floatBtn.addEventListener('pointerup', onFloatUp);
floatBtn.addEventListener('pointercancel', onFloatCancel);
floatBtn.addEventListener('lostpointercapture', (e) => { if (floatStartTime) onFloatUp(e); });
// Android Chrome: no long-press menu / text selection / scrolling from the button
floatBtn.addEventListener('contextmenu', (e) => e.preventDefault());
floatBtn.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
floatBtn.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

// Page-49 PNG link
document.getElementById('dlPng').addEventListener('click', () => downloadPNG());
document.getElementById('dlPdf').addEventListener('click', () => downloadPDF());

// Close grid by tapping outside thumbnails (on the grid background)
document.getElementById('pagesGrid').addEventListener('click', (e) => {
  if (e.target.id === 'pagesGrid' || e.target.tagName === 'H3') closePagesGrid();
});

// Pointer events (works for mouse, touch, pen)
canvas.addEventListener('pointerdown', startDraw);
canvas.addEventListener('pointermove', draw);
canvas.addEventListener('pointerup', endDraw);
canvas.addEventListener('pointercancel', endDraw);
canvas.addEventListener('pointerleave', endDraw);

// Prevent scrolling while drawing
canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
canvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

// Init
window.addEventListener('resize', resizeCanvas);
loadFromStorage();
loadCrumple();
applyPrefs();
try { buildJelly(); } catch (e) { console.warn('Jelly button failed, using plain button', e); }
updatePageInfo();
resizeCanvas();
