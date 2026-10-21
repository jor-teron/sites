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
  /* Paper sizes (portrait cm; docx in twips). Only A4 and Legal;
     an old saved 'Letter' falls back to A4 and the pref is rewritten. */
  paperSizes: {
    A4: { label: 'A4', widthCm: 21, heightCm: 29.7, pdf: 'a4', docxW: 11906, docxH: 16838 },
    Legal: { label: 'Legal', widthCm: 21.59, heightCm: 35.56, pdf: 'legal', docxW: 12240, docxH: 20160 }
  },
  /* Margin presets: same value on every side, in cm. */
  marginPresets: {
    normal: { label: 'Normal', cm: 2.54 },
    narrow: { label: 'Narrow', cm: 1.27 }
  },
  /* Defaults when nothing is stored yet. */
  defaultPaperSize: 'A4',
  defaultMarginPreset: 'normal',
  /* Active choices (set by setPage). */
  paperSize: 'A4',
  marginPreset: 'normal',
  /* Custom margins (cm, per side) used when marginPreset is 'custom'. */
  marginCustom: { top: 2.54, bottom: 2.54, left: 2.54, right: 2.54 },
  marginCustomMin: 0.5,
  marginCustomMax: 5,
  storageKeyMarginCustom: 'draftly_margin_custom',
  /* App version (not shown in the UI). */
  version: '0.8',

  /* ----- Margins (cm) ----- */
  /* Top page margin. */
  marginTopCm: 2.54,
  /* Bottom page margin. */
  marginBottomCm: 2.54,
  /* Left page margin. */
  marginLeftCm: 2.54,
  /* Right page margin. */
  marginRightCm: 2.54,

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
  storageKeyBackup: 'draftly-backup',
  /* Key for light/dark theme. */
  storageKeyTheme: 'draftly_theme',
  /* Key for non-printing character toggle. */
  storageKeyNonPrint: 'draftly_nonprinting',
  /* Legacy key for saved margins: removed at startup, margins come from this file. */
  storageKeyMargins: 'draftly_margins',
  /* Keys for page prefs. */
  storageKeyOrientation: 'draftly_orientation',
  storageKeyPaperSize: 'draftly_paper_size',
  storageKeyMarginPreset: 'draftly_margin_preset',
  storageKeyPageNumbers: 'draftly_page_numbers',
  storageKeyPageNumberPos: 'draftly_page_number_pos',
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
  defaultHtml: '<p><br></p>',
  /* Fallback body if storage throws. */
  fallbackHtml: '<p><br></p>',

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

/* Pick paper size and margin preset; updates every derived value. */
Draftly.config.setPage = function setPage(size, preset, custom) {
  var cfg = Draftly.config;
  var p = cfg.paperSizes[size] || cfg.paperSizes[cfg.defaultPaperSize];
  var isCustom = preset === 'custom';
  var m = cfg.marginPresets[preset] || cfg.marginPresets[cfg.defaultMarginPreset];
  if (isCustom && custom) cfg.marginCustom = cfg.clampMargins(custom);
  cfg.paperSize = cfg.paperSizes[size] ? size : cfg.defaultPaperSize;
  cfg.marginPreset = isCustom ? 'custom' : (cfg.marginPresets[preset] ? preset : cfg.defaultMarginPreset);
  cfg.paperWidthCm = p.widthCm;
  cfg.paperHeightCm = p.heightCm;
  cfg.pageSizeName = p.label;
  var mc = isCustom ? cfg.marginCustom : { top: m.cm, bottom: m.cm, left: m.cm, right: m.cm };
  cfg.marginTopCm = mc.top;
  cfg.marginBottomCm = mc.bottom;
  cfg.marginLeftCm = mc.left;
  cfg.marginRightCm = mc.right;
  cfg.docxMarginTop = Math.round(mc.top * 567);
  cfg.docxMarginBottom = Math.round(mc.bottom * 567);
  cfg.docxMarginLeft = Math.round(mc.left * 567);
  cfg.docxMarginRight = Math.round(mc.right * 567);
  cfg.applyToDocument();
};

/* Custom margins kept in range, rounded to 0.1 cm. */
Draftly.config.clampMargins = function clampMargins(m) {
  var cfg = Draftly.config;
  var one = function (v) {
    v = parseFloat(v);
    if (!isFinite(v)) v = cfg.marginPresets[cfg.defaultMarginPreset].cm;
    return Math.round(Math.min(cfg.marginCustomMax, Math.max(cfg.marginCustomMin, v)) * 10) / 10;
  };
  return { top: one(m.top), bottom: one(m.bottom), left: one(m.left), right: one(m.right) };
};

/* Label of the active margins, e.g. 'Normal' or 'Custom'. */
Draftly.config.marginLabel = function marginLabel() {
  var cfg = Draftly.config;
  return cfg.marginPreset === 'custom' ? 'Custom' : cfg.marginPresets[cfg.marginPreset].label;
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
