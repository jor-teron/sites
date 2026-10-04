/* ============================================================
   FILE: modules/draftly-config.js
   PROJECT: Draftly
   ROLE: Single source of magic values.
   RULE: Other modules read Draftly.config. They must not
         hard-code sizes, keys, timings, or default copy.
   ISOLATION: Attaches only Draftly.config. Safe if later
              modules fail to load.
   ============================================================ */

/* Shared namespace. Created once; later modules reuse it. */
var Draftly = window.Draftly || {};
window.Draftly = Draftly;

/* All tunable values for paper, type, storage, and timing. */
Draftly.config = {
  /* ----- Paper ----- */
  /* A4 portrait width in centimetres. */
  paperWidthCm: 21,
  /* A4 portrait height in centimetres. */
  paperHeightCm: 29.7,
  /* Orientation when nothing is stored yet. */
  defaultOrientation: 'portrait',
  /* App version (not shown in the UI). */
  version: '0.8',

  /* ----- Margins (cm) ----- */
  /* Top page margin. */
  marginTopCm: 0.5,
  /* Bottom page margin. */
  marginBottomCm: 0.5,
  /* Left page margin. */
  marginLeftCm: 2,
  /* Right page margin. */
  marginRightCm: 2,

  /* ----- Type ----- */
  /* Default face. Not embedded. Uses the machine font. */
  fontCommandName: 'Times New Roman',
  /* Embedded fallback. Files live in assets/fonts/tinos/. */
  embeddedFamily: 'Tinos',
  /* Named fallback. Not embedded. Used only if installed. */
  systemFallbackFamily: 'Liberation Serif',
  /* Last generic fallback. */
  genericFamily: 'serif',
  /* Full stack: machine Times, then embedded Tinos, then Liberation Serif. */
  fontFamily: "'Times New Roman', Tinos, 'Liberation Serif', serif",
  /* Default body size in points. */
  fontSizePt: 12,
  /* execCommand fontSize token that maps to about 12pt. */
  defaultFontSizeCommand: '3',
  /* Editor line-height multiplier. */
  lineHeight: 1.6,
  /* Space after every paragraph, in points. Same on screen, print, DOCX, PDF. */
  paragraphSpacingPt: 6,

  /* ----- Layout chrome ----- */
  /* Gap between page cards in the workspace, in pixels. */
  pageGapPx: 24,

  /* ----- Storage keys ----- */
  /* IndexedDB database name. */
  dbName: 'draftly',
  /* IndexedDB version. */
  dbVersion: 1,
  /* Object store for named documents. */
  storeName: 'documents',
  /* Prefix for an autofilled name. */
  namePrefix: 'Doc_',
  /* Key for the last opened document name. */
  storageKeyLastName: 'draftly_last_name',
  /* Key for light/dark theme. */
  storageKeyTheme: 'draftly_theme',
  /* Key for non-printing character toggle. */
  storageKeyNonPrint: 'draftly_nonprinting',
  /* Legacy key for saved margins: removed at startup, margins come from this file. */
  storageKeyMargins: 'draftly_margins',
  /* Default list kind: bullet | 1 | a | A. */
  defaultListKind: 'bullet',
  /* Default numbered suffix: . | , | ) | none. */
  defaultListSuffix: '.',
  /* Class of legacy inline format marks (old saves). Stripped on load / save. */
  markClass: 'np-mark',
  /* Stored value that means dark theme is on. */
  themeDarkValue: 'dark',
  /* Stored value that means non-printing marks are on. */
  nonPrintOnValue: '1',
  /* Stored value that means non-printing marks are off. */
  nonPrintOffValue: '0',

  /* ----- Timings (ms) ----- */
  /* How long the toast stays visible. */
  toastMs: 2200,
  /* Delay before pagination after a line or paragraph insert. */
  paginationAfterInsertMs: 20,
  /* Debounce for typing before save and reflow. */
  inputDebounceMs: 800,
  /* Debounce for window resize reflow. */
  resizeDebounceMs: 300,
  /* Wait for first layout before the first pagination pass. */
  initialPaginationMs: 100,
  /* Debounce between typing and the line-by-line page flow. */
  flowDebounceMs: 40,
  /* Delay before non-printing marks are redrawn. */
  marksDelayMs: 30,
  /* Fallback cleanup if afterprint never fires. */
  printCleanupMs: 1500,
  /* How long to keep a DOCX object URL before revoke. */
  docxUrlRevokeMs: 2000,

  /* ----- Pagination ----- */
  /* Extra pixels allowed before a page is treated as overflow. */
  paginationSlackPx: 2,
  /* Fallback content height if the paper node is missing. */
  fallbackContentHeightPx: 1000,

  /* ----- Export ----- */
  /* Download filename for DOCX when the name box is empty. */
  docxFileName: 'document.docx',
  /* Page size token used in @page and html-docx-js. */
  pageSizeName: 'A4',
  /* DOCX margin top in twips (0.5cm). */
  docxMarginTop: 283,
  /* DOCX margin right in twips (2cm). */
  docxMarginRight: 1134,
  /* DOCX margin bottom in twips (0.5cm). */
  docxMarginBottom: 283,
  /* DOCX margin left in twips (2cm). */
  docxMarginLeft: 1134,
  /* PDF: render scale per page (2 = sharp, bigger file). */
  pdfScale: 2,
  /* PDF: JPEG quality of each page image. */
  pdfJpegQuality: 0.92,
  /* PDF: file name when the name box is empty. */
  pdfFileName: 'document',
  /* HTML inserted between exported pages (unused: Word paginates by itself). */
  pageBreakHtml: '<br clear="all" style="page-break-before:always" />',

  /* ----- Copy ----- */
  /* Placeholder shown in an empty editor. */
  placeholder: 'Start typing here…',
  /* First-run body when nothing is stored. */
  defaultHtml: '<p>Welcome to Draftly. Use the toolbar to format text.</p>',
  /* Fallback body if storage throws. */
  fallbackHtml: '<p>Welcome to Draftly.</p>',

  /* ----- DOM hooks ----- */
  /* Class used on every page editor. Ids are not duplicated. */
  editorClass: 'editor',
  /* Class toggled on an editor to show paragraph and break marks. */
  nonPrintClass: 'show-nonprinting',
  /* Body class for landscape paper. */
  landscapeClass: 'landscape',
  /* Body class for dark theme. */
  darkClass: 'dark',
  /* Id of the injected print stylesheet. */
  printStyleId: 'dynamic-print-style'
};

/* Apply paper, type, and gap values onto :root so CSS stays in sync. */
Draftly.config.applyToDocument = function applyToDocument() {
  var root = document.documentElement;
  var cfg = Draftly.config;
  root.style.setProperty('--paper-width-cm', String(cfg.paperWidthCm));
  root.style.setProperty('--paper-height-cm', String(cfg.paperHeightCm));
  root.style.setProperty('--margin-top-cm', String(cfg.marginTopCm));
  root.style.setProperty('--margin-bottom-cm', String(cfg.marginBottomCm));
  root.style.setProperty('--margin-left-cm', String(cfg.marginLeftCm));
  root.style.setProperty('--margin-right-cm', String(cfg.marginRightCm));
  root.style.setProperty('--font-family', cfg.fontFamily);
  root.style.setProperty('--font-size-pt', String(cfg.fontSizePt));
  root.style.setProperty('--line-height', String(cfg.lineHeight));
  root.style.setProperty('--para-space', cfg.paragraphSpacingPt + 'pt');
  root.style.setProperty('--page-gap', cfg.pageGapPx + 'px');
};
