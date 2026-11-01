/*
  Water Kingdom - Children's Learning App
  water-kingdom.js - Main book controller
  Project: water-kingdom
  Handles page navigation, chapter switching, and UI updates.
  Modular: chapters expose window.chapterN objects.
*/

// Current state
let currentPage = 0;
let totalPages = 0;
let currentChapter = 0;
let chapterPages = [];

// DOM references
const pageContent = document.getElementById('page-content');
const pageIndicator = document.getElementById('page-indicator');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const doneBtn = document.getElementById('done-btn');   // LRN-WK1: was missing (ReferenceError on start)
const chapterTitle = document.getElementById('chapter-title');
const chapterMenu = document.getElementById('chapter-menu');
const bookContainer = document.getElementById('book-container');
const navControls = document.querySelector('.nav-controls');

/**
 * Initializes the book viewer and chapter menu.
 */
function initBook() {
  // Show menu first, hide book
  if (chapterMenu) chapterMenu.style.display = 'flex';
  if (bookContainer) bookContainer.style.display = 'none';
  if (navControls) navControls.style.display = 'none';

  // Chapter button listeners
  document.querySelectorAll('.chapter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const ch = parseInt(this.getAttribute('data-chapter'), 10);
      loadChapter(ch);
    });
  });

  // Navigation listeners
  prevBtn.addEventListener('click', goPrev);
  nextBtn.addEventListener('click', goNext);
  doneBtn.addEventListener('click', backToMenu);

  document.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowRight') goNext();
    if (e.key === 'ArrowLeft') goPrev();
  });
}

/**
 * Loads a chapter by number and shows its first page.
 * @param {number} num - Chapter number (1, 2, or 3)
 */
function loadChapter(num) {
  let data = null;
  if (num === 1 && window.chapter1) data = window.chapter1;
  if (num === 2 && window.chapter2) data = window.chapter2;
  if (num === 3 && window.chapter3) data = window.chapter3;
  if (num === 4 && window.chapter4) data = window.chapter4;
  if (num === 5 && window.chapter5) data = window.chapter5;
  if (num === 6 && window.chapter6) data = window.chapter6;
  if (num === 7 && window.chapter7) data = window.chapter7;

  if (!data) {
    pageContent.innerHTML = '<p>Chapter not found.</p>';
    return;
  }

  currentChapter = num;
  chapterPages = data.pages;
  totalPages = chapterPages.length;
  chapterTitle.textContent = `Chapter ${num}: ${data.name}`;

  // Hide menu, show book
  if (chapterMenu) chapterMenu.style.display = 'none';
  if (bookContainer) bookContainer.style.display = 'flex';
  if (navControls) navControls.style.display = 'flex';

  showPage(0);
}

/**
 * Displays a specific page by index.
 * @param {number} index - Zero-based page index
 */
function showPage(index) {
  if (index < 0 || index >= totalPages) return;

  currentPage = index;
  const page = chapterPages[index];

  pageContent.className = 'page';
  if (page.theme) {
    pageContent.classList.add(page.theme);
  }

  let html = '';
  if (page.title) html += `<h2>${page.title}</h2>`;
  if (page.illustration) {
    html += `<div class="illustration ${page.illustrationClass || ''}">${page.illustration}</div>`;
  }
  if (page.text) html += `<p>${page.text}</p>`;
  if (page.extra) html += `<p>${page.extra}</p>`;

  pageContent.innerHTML = html;
  pageIndicator.textContent = `${currentPage + 1} / ${totalPages}`;

  prevBtn.disabled = currentPage === 0;
  nextBtn.disabled = currentPage === totalPages - 1;

  // Show Done button only on the last page
  if (currentPage === totalPages - 1) {
    doneBtn.style.display = 'inline-block';
    nextBtn.style.display = 'none';
  } else {
    doneBtn.style.display = 'none';
    nextBtn.style.display = 'inline-block';
  }
}

/**
 * Goes to the previous page.
 */
function goPrev() {
  if (currentPage > 0) showPage(currentPage - 1);
}

/**
 * Goes to the next page.
 */
function goNext() {
  if (currentPage < totalPages - 1) showPage(currentPage + 1);
}

/**
 * Returns to the chapter menu.
 */
function backToMenu() {
  if (chapterMenu) chapterMenu.style.display = 'flex';
  if (bookContainer) bookContainer.style.display = 'none';
  if (navControls) navControls.style.display = 'none';
  chapterTitle.textContent = 'Choose a Chapter';
  currentChapter = 0;
  currentPage = 0;
}

// Start when ready
document.addEventListener('DOMContentLoaded', initBook);
