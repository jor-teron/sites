/*
 * Project: sketchbook
 * File: sk_export.js
 * Role: Download the current page as PNG, whole sketchbook as PDF (local
 *   vendor/jspdf.umd.min.js). Both include the crumple wrinkles (SVG → Image → drawn over the page, multiply).
 */
// Current canvas + the page's wrinkles → data URL (wrinkles drawn with multiply, like on screen)
async function pageDataUrl(page, type, quality) {
  const img = await wrinkleImage(page, canvas.width, canvas.height);
  if (!img) return canvas.toDataURL(type, quality);
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  const cx = c.getContext('2d');
  cx.drawImage(canvas, 0, 0);
  cx.globalCompositeOperation = 'multiply';
  try { cx.drawImage(img, 0, 0); } catch (e) { console.warn('Wrinkles not exported', e); }
  try { return c.toDataURL(type, quality); }
  catch (e) { console.warn('Wrinkles not exported (tainted canvas)', e); return canvas.toDataURL(type, quality); }
}

// Download current page as PNG
async function downloadPNG() {
  const link = document.createElement('a');
  link.download = 'sketchbook-page-' + (currentPage + 1) + '.png';
  link.href = await pageDataUrl(currentPage, 'image/png');
  link.click();
}

// Download whole sketchbook as PDF (uses local vendor/jspdf.umd.min.js)
async function downloadPDF() {
  if (typeof window.jspdf === 'undefined') {
    alert('PDF library loading... try again in a moment.');
    return;
  }
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [canvas.width, canvas.height] });
  const originalPage = currentPage;
  for (let i = 0; i < TOTAL_PAGES; i++) {
    currentPage = i;
    redraw();
    const img = await pageDataUrl(i, 'image/jpeg', 0.7);
    if (i > 0) pdf.addPage([canvas.width, canvas.height]);
    pdf.addImage(img, 'JPEG', 0, 0, canvas.width, canvas.height);
  }
  currentPage = originalPage;
  redraw();
  pdf.save('sketchbook.pdf');
}
