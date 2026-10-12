/*
 * Project: notebook
 * File: notebook.js
 * Role: Wiring and start-up: event listeners, then load + first draw. Loaded last.
 */
// Attach floating button events
floatBtn.addEventListener('pointerdown', onFloatDown);
floatBtn.addEventListener('pointermove', onFloatMove);
floatBtn.addEventListener('pointerup', onFloatUp);
floatBtn.addEventListener('pointercancel', () => { if (floatHoldTimer) clearTimeout(floatHoldTimer); floatStartTime = 0; });

// Settings buttons
document.getElementById('closeSettings').addEventListener('click', closeSettings);
document.getElementById('dlPng').addEventListener('click', () => { downloadPNG(); closeSettings(); });
document.getElementById('dlPdf').addEventListener('click', () => { downloadPDF(); closeSettings(); });
document.getElementById('resetNotebook').addEventListener('click', () => {
  if (confirm('Reset entire notebook? All pages will be cleared.')) {
    initPages();
    saveToStorage();
    goToPage(0);
    closeSettings();
  }
});

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
updatePageInfo();
resizeCanvas();
