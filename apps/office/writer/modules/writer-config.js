/* ============================================================
   FILE: modules/writer-config.js
   DF25: was modules/draftly-config.js; the global Draftly is now
         Writer and the localStorage keys are writer_* (copied once
         from the old draftly_* keys by migrateKeys below).
   PROJECT: Writer
   ROLE: Single source of magic values.
   RULE: Other modules read Writer.config. They must not
         hard-code sizes, keys, timings, or default copy.
   ISOLATION: Attaches only Writer.config. Safe if later
              modules fail to load.
   ============================================================ */

/* Shared namespace. Created once; later modules reuse it. */
/* (before DF25) var Draftly = window.Draftly || {}; */
/* (before DF25) window.Draftly = Draftly; */
var Writer = window.Writer || {};
window.Writer = Writer;
/* DF25: the old global name stays as an alias of the same object, for any
   script or bookmarklet that still says Draftly. New code uses Writer. */
window.Draftly = Writer;

/* All tunable values for paper, type, storage, and timing. */
Writer.config = {
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
  /* Margin presets in cm (DF2: Writer-only values; the shared
     OfficePage presets used by Spreadsheet are not changed). */
  marginPresets: {
    normal: { label: 'Normal', top: 0.5, bottom: 0.6, left: 2, right: 2, cm: 2 },
    narrow: { label: 'Narrow', top: 0.5, bottom: 0.6, left: 1, right: 1, cm: 1 }
  },
  /* Defaults when nothing is stored yet. */
  defaultPaperSize: 'A4',
  defaultMarginPreset: 'normal',
  /* Active choices (set by setPage). */
  paperSize: 'A4',
  marginPreset: 'normal',
  /* Custom margins (cm, per side) used when marginPreset is 'custom'. */
  marginCustom: { top: 0.5, bottom: 0.6, left: 2, right: 2 },
  marginCustomMin: 0.5,
  marginCustomMax: 5,
  storageKeyMarginCustom: 'writer_margin_custom',   /* (before DF25) storageKeyMarginCustom: 'draftly_margin_custom' */
  /* App version (not shown in the UI). */
  version: '0.8',
  /* DF25: release id (also in the page title, Writer DF25). */
  release: 'DF25',

  /* ----- Margins (cm) ----- */
  /* Top page margin. */
  marginTopCm: 0.5,
  /* Bottom page margin. */
  marginBottomCm: 0.6,
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
  /* DF25: unchanged on purpose. Writer no longer keeps documents here (HOW1: .how files). */
  dbName: 'draftly',
  /* IndexedDB version. */
  dbVersion: 1,
  /* Object store for named documents. */
  storeName: 'documents',
  /* Prefix for an autofilled name. */
  namePrefix: 'Doc_',
  /* Key for the last opened document name. */
  storageKeyLastName: 'writer_last_name',   /* (before DF25) storageKeyLastName: 'draftly_last_name' */
  storageKeyBackup: 'writer-backup',   /* (before DF25) storageKeyBackup: 'draftly-backup' */
  /* Key for light/dark theme. */
  storageKeyTheme: 'writer_theme',   /* (before DF25) storageKeyTheme: 'draftly_theme' */
  /* Key for non-printing character toggle. */
  storageKeyNonPrint: 'writer_nonprinting',   /* (before DF25) storageKeyNonPrint: 'draftly_nonprinting' */
  /* Legacy key for saved margins: removed at startup, margins come from this file. */
  storageKeyMargins: 'draftly_margins',   /* DF25: kept: an old key, only ever removed at start-up */
  /* Keys for page prefs. */
  storageKeyOrientation: 'writer_orientation',   /* (before DF25) storageKeyOrientation: 'draftly_orientation' */
  /* Old key: before 2026-10-21 orientation was saved under the literal key 'undefined'
     (storageKeyOrientation was missing). Migrated once at start-up, see storage.migrateOrientation. */
  storageKeyOrientationLegacy: 'undefined',
  /* Stored orientation values. */
  orientations: ['portrait', 'landscape'],
  storageKeyPaperSize: 'writer_paper_size',   /* (before DF25) storageKeyPaperSize: 'draftly_paper_size' */
  storageKeyMarginPreset: 'writer_margin_preset',   /* (before DF25) storageKeyMarginPreset: 'draftly_margin_preset' */
  storageKeyPageNumbers: 'writer_page_numbers',   /* (before DF25) storageKeyPageNumbers: 'draftly_page_numbers' */
  storageKeyPageNumberPos: 'writer_page_number_pos',   /* (before DF25) storageKeyPageNumberPos: 'draftly_page_number_pos' */
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

/* DF25: one-time copy of this device's old draftly_* / draftly- / draftly. localStorage
   keys to the new writer_* names, so theme, margins, ruler, zoom and the rest survive the
   rename. Runs at load, before storage / settings read anything. A key is copied only when
   the new key is still empty (never overwrites). The old keys are left in place, so a
   rollback to a pre-DF25 build still finds its settings. 'draftly_margins' is not copied
   (an old key that start-up removes). After the copy the flag key is set and only the new
   keys are used. ls = a Storage-like object (tests pass a fake). Returns the copied count,
   or -1 when it already ran or storage is blocked. */
Writer.config.migrateFlag = 'writer_df25_migrated';
Writer.config.oldKeyRe = /^draftly([_.\-])(.+)$/;
Writer.config.migrateKeys = function migrateKeys(ls) {
  var cfg = Writer.config;
  try {
    ls = ls || window.localStorage;
    if (!ls || ls.getItem(cfg.migrateFlag) === '1') return -1;
    var names = [], i, n = 0;
    for (i = 0; i < ls.length; i++) names.push(ls.key(i));
    names.forEach(function (k) {
      var m = cfg.oldKeyRe.exec(k || '');
      if (!m || k === 'draftly_margins') return;
      var nk = 'writer' + m[1] + m[2];
      if (ls.getItem(nk) !== null) return;
      var v = ls.getItem(k);
      if (v === null) return;
      ls.setItem(nk, v);
      n++;
    });
    ls.setItem(cfg.migrateFlag, '1');
    return n;
  } catch (e) {
    return -1;   /* storage blocked or full: the app still opens with defaults */
  }
};
if (typeof window !== 'undefined') Writer.config.migrateKeys();

/* Pick paper size and margin preset; updates every derived value. */
Writer.config.setPage = function setPage(size, preset, custom) {
  var cfg = Writer.config;
  var p = cfg.paperSizes[size] || cfg.paperSizes[cfg.defaultPaperSize];
  var isCustom = preset === 'custom';
  var m = cfg.marginPresets[preset] || cfg.marginPresets[cfg.defaultMarginPreset];
  if (isCustom && custom) cfg.marginCustom = cfg.clampMargins(custom);
  cfg.paperSize = cfg.paperSizes[size] ? size : cfg.defaultPaperSize;
  cfg.marginPreset = isCustom ? 'custom' : (cfg.marginPresets[preset] ? preset : cfg.defaultMarginPreset);
  cfg.paperWidthCm = p.widthCm;
  cfg.paperHeightCm = p.heightCm;
  cfg.pageSizeName = p.label;
  var mc = isCustom ? cfg.marginCustom : { top: m.top, bottom: m.bottom, left: m.left, right: m.right };
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
Writer.config.clampMargins = function clampMargins(m) {
  var cfg = Writer.config;
  /* Shared with the Spreadsheet Page tab: apps/office/shared/office-page.js */
  return OfficePage.clampMargins(m, {
    min: cfg.marginCustomMin,
    max: cfg.marginCustomMax,
    fallback: cfg.marginPresets[cfg.defaultMarginPreset].cm
  });
};

/* Label of the active margins, e.g. 'Normal' or 'Custom'. */
Writer.config.marginLabel = function marginLabel() {
  var cfg = Writer.config;
  return cfg.marginPreset === 'custom' ? 'Custom' : cfg.marginPresets[cfg.marginPreset].label;
};

/* Apply paper, type, and gap values onto :root so CSS stays in sync. */
Writer.config.applyToDocument = function applyToDocument() {
  var root = document.documentElement;
  var cfg = Writer.config;
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
