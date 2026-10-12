/*
 * Project: notebook
 * File: nb_store.js
 * Role: Shared state (pages, current page, canvas refs) and LocalStorage load/save. Key paperNotebook_v2.
 */
// Total number of pages (fixed, light version)
const TOTAL_PAGES = 50;

// LocalStorage key (v2 for 50 pages)
const STORAGE_KEY = 'paperNotebook_v2';

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
