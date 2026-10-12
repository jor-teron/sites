/*
 * Project: notebook
 * File: nb_pages.js
 * Role: Page navigation, crumple (adds wrinkles, nb_wrinkle.js), page toast, pages grid.
 */
// Update page info display (now only used for toast)
function updatePageInfo() {
  // kept for compatibility, toast shows on demand
}

// Go to page
function goToPage(index) {
  if (index < 0 || index >= TOTAL_PAGES) return;
  // Save current (already in memory)
  currentPage = index;
  updatePageInfo();
  redraw();
  saveToStorage();
}

// Crumple current page: strokes stay, wrinkles grow one level (permanent, no undo, cap CRUMPLE_MAX)
function crumblePage() {
  addCrumple();
}

// Show temporary page number
function showPageToast() {
  pageToast.textContent = 'Page ' + (currentPage + 1) + ' / ' + TOTAL_PAGES;
  pageToast.classList.add('show');
  setTimeout(() => pageToast.classList.remove('show'), 1200);
}

// Open pages grid
function openPagesGrid() {
  const container = document.getElementById('gridContainer');
  container.innerHTML = '';
  const cols = window.innerWidth < 600 ? 2 : 4;
  container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  for (let i = 0; i < TOTAL_PAGES; i++) {
    const div = document.createElement('div');
    div.className = 'pageThumb';
    const c = document.createElement('canvas');
    c.width = 120;
    c.height = 160;
    div.appendChild(c);
    const span = document.createElement('span');
    span.textContent = (i + 1);
    div.appendChild(span);
    // Mini draw
    const mctx = c.getContext('2d');
    mctx.fillStyle = '#fffef9';
    mctx.fillRect(0, 0, 120, 160);
    const strokes = pages[i] || [];
    const scaleX = 120 / canvas.width;
    const scaleY = 160 / canvas.height;
    strokes.forEach(s => {
      if (!s.points || s.points.length < 2) return;
      mctx.beginPath();
      mctx.strokeStyle = s.color || '#222';
      mctx.lineWidth = 1;
      mctx.moveTo(s.points[0].x * scaleX, s.points[0].y * scaleY);
      for (let p = 1; p < s.points.length; p++) {
        mctx.lineTo(s.points[p].x * scaleX, s.points[p].y * scaleY);
      }
      mctx.stroke();
    });
    div.addEventListener('click', () => {
      goToPage(i);
      closePagesGrid();
    });
    container.appendChild(div);
  }
  document.getElementById('pagesGrid').classList.add('show');
}

function closePagesGrid() {
  document.getElementById('pagesGrid').classList.remove('show');
}
