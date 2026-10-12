/*
 * Project: notebook
 * File: nb_export.js
 * Role: Download the current page as PNG (PDF export removed).
 *   Includes the crumple wrinkles (SVG → Image → drawn over the page, multiply).
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
  link.download = 'notebook-page-' + (currentPage + 1) + '.png';
  link.href = await pageDataUrl(currentPage, 'image/png');
  link.click();
}

