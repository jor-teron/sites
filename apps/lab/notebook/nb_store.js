/*
 * Project: notebook
 * File: nb_store.js
 * Role: Shared state (pages, current page, canvas refs) and LocalStorage load/save. Keys paperNotebook_v2 (pages), paperNotebook_pen (pen colour),
 *   paperNotebook_btnPos (bottom|top), paperNotebook_swap (1|0).
 */
// Total number of pages (fixed, light version)
const TOTAL_PAGES = 50;

// LocalStorage key (v2 for 50 pages)
const STORAGE_KEY = 'paperNotebook_v2';

// Pen colour (quick menu dots), saved separately
const PEN_KEY = 'paperNotebook_pen';
const PEN_COLORS = { black: '#222', blue: '#1f4fbf', red: '#c62828' };
let penName = 'black';
try { const v = localStorage.getItem(PEN_KEY); if (PEN_COLORS[v]) penName = v; } catch (_) { /* ignore */ }
function setPen(name) {
  if (!PEN_COLORS[name]) return;
  penName = name;
  try { localStorage.setItem(PEN_KEY, name); } catch (_) { /* ignore */ }
}

// Button position ('bottom' default | 'top') and swapped gestures, saved separately
const BTNPOS_KEY = 'paperNotebook_btnPos';
const SWAP_KEY = 'paperNotebook_swap';
let btnTop = false, swapGestures = false;
try { btnTop = localStorage.getItem(BTNPOS_KEY) === 'top'; swapGestures = localStorage.getItem(SWAP_KEY) === '1'; } catch (_) { /* ignore */ }
function savePrefs() {
  try { localStorage.setItem(BTNPOS_KEY, btnTop ? 'top' : 'bottom'); localStorage.setItem(SWAP_KEY, swapGestures ? '1' : '0'); } catch (_) { /* ignore */ }
}
// Direction → action. Book style: drag left = next, right = previous, up = grid, down = crumple.
function gestureFor(dir) {
  const m = swapGestures
    ? { left: 'prev', right: 'next', up: 'crumple', down: 'grid' }
    : { left: 'next', right: 'prev', up: 'grid', down: 'crumple' };
  return m[dir] || '';
}

// Current page index (0-based)
let currentPage = 0;

// All pages data: array of stroke arrays
// Each stroke: { color: string, width: number, points: [{x,y}] }
let pages = [];

// Drawing state
let isDrawing = false;
let currentStroke = null;

// Canvas and context
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const floatBtn = document.getElementById('floatBtn');
const pageToast = document.getElementById('pageToast');

// Initialize pages array (empty strokes for each)
function initPages() {
  pages = Array.from({ length: TOTAL_PAGES }, () => []);
}

// Load from LocalStorage
function loadFromStorage() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length === TOTAL_PAGES) {
        pages = parsed;
        return;
      }
    }
  } catch (e) {
    console.warn('Failed to load storage', e);
  }
  initPages();
}

// Save to LocalStorage
function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
  } catch (e) {
    console.warn('Storage full or failed', e);
    alert('Could not save (storage limit). Try crumpling some pages.');
  }
}
