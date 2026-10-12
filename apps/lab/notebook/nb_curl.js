/*
 * Project: notebook
 * File: nb_curl.js
 * Role: Page-curl animation driven by a horizontal drag on ☰ (no libraries, CSS clip-path only).
 *   On the first horizontal move a copy of the page canvas is taken (#curlPage). The drag
 *   progress folds a corner: the page is clipped along a fold line and the lifted flap (#curlFlap,
 *   the paper's back with a soft shadow) is the reflected corner. The real target page is rendered on the
 *   main canvas underneath. Next folds the bottom-right corner, previous the bottom-left. Release past the armed
 *   distance completes the flip, else it springs back. No curl past the first / last page.
 */
const curlEl = document.getElementById('curl');
const curlPage = document.getElementById('curlPage');
const curlFlap = document.getElementById('curlFlap');
let curlDir = '';        // 'next' | 'prev' | ''
let curlP = 0;           // 0 = flat … 1 = armed … ~1.9 = gone
let curlAnim = 0;
let curlFrom = -1;       // page under the finger when the curl started (restored on cancel)

// Copy the current page onto the lifting sheet, then render the REAL target page on the main
// canvas underneath (lines, strokes, number, wrinkles, covers / index / page 49 layers).
function curlStart(dir) {
  const target = currentPage + (dir === 'next' ? 1 : -1);
  if (target < 0 || target >= TOTAL_PAGES) return false;
  curlDir = dir;
  curlPage.width = canvas.width;
  curlPage.height = canvas.height;
  const pc = curlPage.getContext('2d');
  pc.drawImage(canvas, 0, 0);
  const wr = document.querySelector('#wrinkle svg');   // current wrinkles onto the sheet too
  if (wr) wrinkleImage(currentPage, canvas.width, canvas.height).then((img) => {
    if (img && curlDir === dir) { pc.globalCompositeOperation = 'multiply'; pc.drawImage(img, 0, 0); pc.globalCompositeOperation = 'source-over'; }
  });
  curlFrom = currentPage;
  currentPage = target;
  redraw();
  curlEl.hidden = false;
  return true;
}

// Fold geometry for progress p (corner C, fold points A on the bottom edge, B on the side edge).
function curlDraw(p) {
  const w = curlPage.width, h = curlPage.height;
  const a = Math.max(0.01, p) * w * 0.62;        // along the bottom
  const b = a * 1.35;                             // up the side
  const right = curlDir === 'next';
  const C = { x: right ? w : 0, y: h };
  const A = { x: right ? w - a : a, y: h };
  const B = { x: C.x, y: h - b };
  // reflect C across line AB → tip of the flap
  const dx = B.x - A.x, dy = B.y - A.y, L = dx * dx + dy * dy;
  const t = ((C.x - A.x) * dx + (C.y - A.y) * dy) / L;
  const px = A.x + t * dx, py = A.y + t * dy;
  const T = { x: 2 * px - C.x, y: 2 * py - C.y };
  const pt = (q) => q.x.toFixed(1) + 'px ' + q.y.toFixed(1) + 'px';
  // page minus the folded triangle (works for A/B beyond the page edges too)
  const far = right ? 0 : w;
  curlPage.style.clipPath = 'polygon(' + [pt({ x: far, y: 0 }), pt({ x: C.x, y: 0 }), pt(B), pt(A), pt({ x: far, y: h })].join(',') + ')';
  curlFlap.style.clipPath = 'polygon(' + [pt(A), pt(B), pt(T)].join(',') + ')';
  // the paper's back: light at the fold, a touch darker at the tip
  const ang = Math.atan2(T.y - (A.y + B.y) / 2, T.x - (A.x + B.x) / 2) * 180 / Math.PI + 90;
  curlFlap.style.background = 'linear-gradient(' + ang.toFixed(0) + 'deg, #f4efe4 0%, #fffdf6 45%, #e2dccd 100%)';
  curlEl.style.setProperty('--shade', Math.min(0.35, 0.12 + p * 0.15).toFixed(2));
}

// Drag update: dir from the swipe, p = progress (1 = armed distance).
function curlUpdate(dir, p) {
  if (curlAnim) return;
  if (dir !== curlDir) {
    curlEnd();
    if (!dir || !curlStart(dir)) return;
  }
  curlP = Math.max(0, Math.min(1.3, p));
  curlDraw(curlP);
}

// Hide the curl; restore = put the original page back (cancelled curl).
function curlEnd(restore) {
  if (curlAnim) cancelAnimationFrame(curlAnim);
  curlAnim = 0;
  curlDir = '';
  curlEl.hidden = true;
  if (restore !== false && curlFrom >= 0 && currentPage !== curlFrom) { currentPage = curlFrom; redraw(); }
  curlFrom = -1;
}

// Release: complete (then onDone, e.g. goToPage) or spring back.
function curlFinish(complete, onDone) {
  if (!curlDir) { if (onDone) onDone(); return; }
  const from = curlP, to = complete ? 1.95 : 0;
  const t0 = performance.now(), dur = complete ? 260 : 220;
  if (complete) { if (onDone) onDone(); curlFrom = -1; }   // target already under the sheet
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    const e = complete ? k * k : 1 - Math.pow(1 - k, 3);
    curlDraw(from + (to - from) * e);
    if (k < 1) curlAnim = requestAnimationFrame(step);
    else { curlAnim = 0; curlEnd(); }
  };
  curlAnim = requestAnimationFrame(step);
}
