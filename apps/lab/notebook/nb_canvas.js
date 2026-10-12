/*
 * Project: notebook
 * File: nb_canvas.js
 * Role: Canvas resize, ruled background, redraw of strokes, special-page overlay text.
 */
// Resize canvas to fit container
function resizeCanvas() {
  const main = document.getElementById('main');
  const rect = main.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  redraw();
}

// Draw notebook lines and margin (only on main drawing pages)
// Top area is left blank (no lines) as a header margin
function drawBackground() {
  const w = canvas.width;
  const h = canvas.height;

  // Cover colors - cool gradients
  if (currentPage === 0) {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#a8edea');
    grad.addColorStop(1, '#fed6e3');
    ctx.fillStyle = grad; // cool front cover
  } else if (currentPage === TOTAL_PAGES - 1) {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#d299c2');
    grad.addColorStop(1, '#fef9d7');
    ctx.fillStyle = grad; // cool back cover
  } else {
    ctx.fillStyle = '#fffef9';
  }
  ctx.fillRect(0, 0, w, h);

  // Only draw lines on main drawing pages (4 to 44 → 0-based 3 to 43)
  if (currentPage >= 3 && currentPage <= 43) {
    // Top blank margin (no lines)
    const topMargin = 90;
    // Horizontal rules starting after top margin
    ctx.strokeStyle = '#e8e4dc';
    ctx.lineWidth = 1;
    const lineSpacing = 28;
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
  }

  // Page number (subtle, bottom right) for all pages
  ctx.fillStyle = '#bbb';
  ctx.font = '12px system-ui';
  ctx.textAlign = 'right';
  ctx.fillText((currentPage + 1).toString(), w - 16, h - 12);
}

// Redraw current page
function redraw() {
  drawBackground();
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

// Update special page overlay text
function updateOverlay() {
  overlay.classList.remove('hidden');
  overlay.innerHTML = '';
  if (currentPage === 0) {
    overlay.innerHTML = '<h1>Sketch Notebook</h1><p>50 pages · Scribble freely</p>';
  } else if (currentPage === 1 || currentPage === 2) {
    overlay.innerHTML = '<h2>Index</h2><p>Page ' + (currentPage + 1) + '</p>';
  } else if (currentPage >= 44 && currentPage <= 48) {
    overlay.innerHTML = '<h2>Notes</h2><p>Page ' + (currentPage + 1) + '</p>';
  } else if (currentPage === TOTAL_PAGES - 1) {
    overlay.innerHTML = '<h1>Back Cover</h1><p>End of notebook</p>';
  } else {
    overlay.classList.add('hidden');
  }
}
