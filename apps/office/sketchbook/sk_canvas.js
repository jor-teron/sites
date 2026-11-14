/*
 * Project: sketchbook
 * File: sk_canvas.js
 * Role: Canvas resize, page backgrounds (cloth covers + index via sk_cover.js, ruled pages),
 *   redraw of strokes, notes heading, settings text toggle on page 49.
 */
// Resize canvas to fit container
function resizeCanvas() {
  const main = document.getElementById('main');
  const rect = main.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  redraw();
}

// First rule (raised for more writing space) and rule spacing; index / notes / page 49 align to these
const RULE_TOP = 56;
const RULE_GAP = 28;

// Draw sketchbook lines and margin (only on main drawing pages)
// Top area is left blank (no lines) as a header margin
function drawBackground() {
  const w = canvas.width;
  const h = canvas.height;

  // Covers: woven cloth (sk_cover.js); no page number on them
  if (currentPage === 0 || currentPage === TOTAL_PAGES - 1) {
    drawCover(currentPage === 0);
    return;
  }
  ctx.fillStyle = '#fffef9';
  ctx.fillRect(0, 0, w, h);
  // Pages 2–3: printed index table
  if (currentPage === 1 || currentPage === 2) drawIndexTable();

  // Ruled lines on pages 4–49 (notes and the settings page use the same rules)
  if (currentPage >= 3 && currentPage <= TOTAL_PAGES - 2) {   // 4–44 drawing, 45–48 notes, 49 settings
    // Top blank margin (no lines)
    const topMargin = RULE_TOP;
    // Horizontal rules starting after top margin
    ctx.strokeStyle = '#e8e4dc';
    ctx.lineWidth = 1;
    const lineSpacing = RULE_GAP;
    for (let y = topMargin; y < h - 40; y += lineSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    // Left margin line (starts after top margin)
    ctx.strokeStyle = '#d4a5a5';
    ctx.lineWidth = 1.5;
    const marginX = w * 0.09;
    ctx.beginPath();
    ctx.moveTo(marginX, topMargin);
    ctx.lineTo(marginX, h - 30);
    ctx.stroke();
    // Notes pages 45–48: small printed heading + date line on the first rule
    if (currentPage >= 44 && currentPage < TOTAL_PAGES - 2) {
      ctx.fillStyle = '#7b6a55';
      ctx.font = '600 13px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText('N O T E S', marginX + 10, RULE_TOP - 18);
      ctx.fillStyle = '#9a8a75';
      ctx.font = '14px system-ui';
      ctx.fillText('Date: ________________', marginX + 10, RULE_TOP + RULE_GAP - 7);
    }
  }

}

// Big handwritten page number "n/50", tucked into the top-right corner (clear of ☰ at top-centre). Not a stroke;
// drawn on the canvas so PNG / PDF exports include it.
function drawPageNumber() {
  const w = canvas.width;
  ctx.save();
  ctx.font = '26px "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  const cover = currentPage === 0 || currentPage === TOTAL_PAGES - 1;
  ctx.fillStyle = cover ? 'rgba(255,248,225,0.9)' : 'rgba(44,74,122,0.75)';
  ctx.fillText((currentPage + 1) + '/' + TOTAL_PAGES, w - (cover ? 64 : 10), 30);
  ctx.restore();
}

// Redraw current page
function redraw() {
  drawBackground();
  drawPageNumber();
  const strokes = pages[currentPage] || [];
  strokes.forEach(stroke => {
    if (!stroke.points || stroke.points.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = stroke.color || '#222';
    ctx.lineWidth = stroke.width || 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.stroke();
  });
  updateOverlay();
  updateWrinkle();
}

// Page that carries the settings text (ruled like a normal page)
const SETTINGS_PAGE = TOTAL_PAGES - 2;

// Update special page overlay text
function updateOverlay() {
  overlay.classList.remove('hidden');
  overlay.innerHTML = '';
  // Page 49 (index TOTAL_PAGES-2) = printed settings card (CSS .backcover)
  document.getElementById('settingsPanel').classList.toggle('onpage', currentPage === SETTINGS_PAGE);
  overlay.classList.add('hidden');   // notes pages are drawn on the canvas now
}
