/*
 * Project: notebook
 * File: nb_export.js
 * Role: Download current page as PNG, whole notebook as PDF (local vendor/jspdf.umd.min.js).
 */
// Download current page as PNG
function downloadPNG() {
  const link = document.createElement('a');
  link.download = 'notebook-page-' + (currentPage + 1) + '.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// Download whole notebook as PDF (uses local vendor/jspdf.umd.min.js)
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
    const img = canvas.toDataURL('image/jpeg', 0.7);
    if (i > 0) pdf.addPage([canvas.width, canvas.height]);
    pdf.addImage(img, 'JPEG', 0, 0, canvas.width, canvas.height);
  }
  currentPage = originalPage;
  redraw();
  pdf.save('paper-notebook.pdf');
}
