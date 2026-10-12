/*
 * Project: notebook
 * File: nb_wrinkle.js
 * Role: Crumple wrinkles. Per-page crumple level (0..CRUMPLE_MAX) in localStorage key
 *   paperNotebook_crumple; strokes are never erased. Wrinkles are an SVG overlay (#wrinkle,
 *   pointer-events:none) built from feTurbulence + diffuse/specular lighting and seeded crease
 *   lines (seed = page). Permanent: no undo, Reset Notebook does not clear them.
 *   wrinkleImage() turns the same SVG into an Image for PNG/PDF export.
 */
const CRUMPLE_KEY = 'paperNotebook_crumple';
const CRUMPLE_MAX = 6;
let crumple = [];

function loadCrumple() {
  crumple = Array.from({ length: TOTAL_PAGES }, () => 0);
  try {
    const a = JSON.parse(localStorage.getItem(CRUMPLE_KEY) || '[]');
    if (Array.isArray(a)) a.forEach((v, i) => { if (i < TOTAL_PAGES) crumple[i] = Math.max(0, Math.min(CRUMPLE_MAX, v | 0)); });
  } catch (e) { console.warn('Failed to load crumple levels', e); }
}

function saveCrumple() {
  try { localStorage.setItem(CRUMPLE_KEY, JSON.stringify(crumple)); }
  catch (e) { console.warn('Could not save crumple levels', e); }
}

// One more crumple on the current page (capped). Returns the new level.
function addCrumple() {
  crumple[currentPage] = Math.min(CRUMPLE_MAX, (crumple[currentPage] || 0) + 1);
  saveCrumple();
  updateWrinkle();
  return crumple[currentPage];
}

// Small seeded random (mulberry32) so a page always gets the same creases.
function seededRandom(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Full SVG markup for one page's wrinkles at w×h ('' when level 0).
function wrinkleSvg(page, w, h) {
  const level = crumple[page] || 0;
  if (!level || !w || !h) return '';
  const rnd = seededRandom((page + 1) * 7919 + level);
  const freq = (0.006 + level * 0.004).toFixed(4);
  const relief = (1 + level * 1.2).toFixed(2);
  const op = (0.18 + level * 0.07).toFixed(2);
  let lines = '';
  const n = level * 2;
  for (let i = 0; i < n; i++) {
    // crease: a slightly bent line across the page, dark side + light side
    const x1 = rnd() * w, y1 = rnd() * h, x2 = rnd() * w, y2 = rnd() * h;
    const cx = (x1 + x2) / 2 + (rnd() - 0.5) * w * 0.2, cy = (y1 + y2) / 2 + (rnd() - 0.5) * h * 0.2;
    const d = 'M' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' Q' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ' ' + x2.toFixed(1) + ' ' + y2.toFixed(1);
    lines += '<path d="' + d + '" stroke="rgba(0,0,0,0.10)" stroke-width="1.4" fill="none"/>' +
      '<path d="' + d + '" stroke="rgba(255,255,255,0.55)" stroke-width="1.2" fill="none" transform="translate(1.2 1.2)"/>';
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
    '<defs><filter id="wr' + page + '" x="0" y="0" width="100%" height="100%">' +
    '<feTurbulence type="fractalNoise" baseFrequency="' + freq + '" numOctaves="3" seed="' + (page + 1) + '" result="n"/>' +
    '<feDiffuseLighting in="n" surfaceScale="' + relief + '" lighting-color="#fff" result="d"><feDistantLight azimuth="235" elevation="50"/></feDiffuseLighting>' +
    '<feSpecularLighting in="n" surfaceScale="' + relief + '" specularConstant="0.6" specularExponent="18" lighting-color="#fff" result="s"><feDistantLight azimuth="235" elevation="55"/></feSpecularLighting>' +
    '<feComposite in="s" in2="d" operator="arithmetic" k1="0" k2="0.4" k3="1" k4="0"/>' +
    '</filter></defs>' +
    '<rect width="100%" height="100%" filter="url(#wr' + page + ')" opacity="' + op + '"/>' + lines + '</svg>';
}

// Show the current page's wrinkles in the overlay (blend: multiply via CSS).
function updateWrinkle() {
  const el = document.getElementById('wrinkle');
  if (!el) return;
  const svg = wrinkleSvg(currentPage, canvas.width, canvas.height);
  el.innerHTML = svg;
  el.hidden = !svg;
}

// Wrinkles of one page as a loaded Image (null when level 0 or on error).
function wrinkleImage(page, w, h) {
  const svg = wrinkleSvg(page, w, h);
  if (!svg) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}
