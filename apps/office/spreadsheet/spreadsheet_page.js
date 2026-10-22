/*
 * spreadsheet_page.js
 * Page tab (print layout only): orientation, paper, margins (presets + custom cm),
 * gridlines / headings / fit-to-width when printing, Print. Uses ../shared/office-page.js for
 * paper and margin data, the @page rule and the custom-margins dialog. Settings are saved in
 * localStorage next to the sheet (key CFG.storage.key + "-page"); they don't touch cells or undo.
 * Print look: body classes print-no-grid / print-headings / print-fit (spreadsheet_page.css).
 */
var PAGE_STORE_KEY = CFG.storage.key + "-page";
var PAGE_STYLE_ID = "sheet-page-style";
var PAGE_DEFAULTS = {
  orientation: "portrait", paper: "A4", margins: "normal",
  custom: { top: 2.54, bottom: 2.54, left: 2.54, right: 2.54 },
  gridlines: true, headings: false, fit: false
};
var pageSetup = Object.assign({}, PAGE_DEFAULTS);

function loadPageSetup() {
  var raw, d;
  try { raw = localStorage.getItem(PAGE_STORE_KEY); d = raw ? JSON.parse(raw) : null; } catch (e) { d = null; }
  pageSetup = Object.assign({}, PAGE_DEFAULTS, d || {});
  if (pageSetup.orientation !== "landscape") pageSetup.orientation = "portrait";
  if (!OfficePage.papers[pageSetup.paper]) pageSetup.paper = PAGE_DEFAULTS.paper;
  if (pageSetup.margins !== "custom" && !OfficePage.marginPresets[pageSetup.margins]) pageSetup.margins = PAGE_DEFAULTS.margins;
  pageSetup.custom = OfficePage.clampMargins(pageSetup.custom);
}

function savePageSetup() {
  try { localStorage.setItem(PAGE_STORE_KEY, JSON.stringify(pageSetup)); } catch (e) {}
}

/* The @page rule for the current settings */
function pageRuleText() {
  return OfficePage.pageRule({
    paper: pageSetup.paper,
    orientation: pageSetup.orientation,
    margins: OfficePage.margins(pageSetup.margins, pageSetup.custom)
  });
}

/* Inject @page, set print classes, sync the Page tab buttons */
function applyPageSetup() {
  var b = document.body, i, btns, k;
  OfficePage.inject(PAGE_STYLE_ID, pageRuleText());
  b.classList.toggle("print-no-grid", !pageSetup.gridlines);
  b.classList.toggle("print-headings", !!pageSetup.headings);
  b.classList.toggle("print-fit", !!pageSetup.fit);
  btns = document.querySelectorAll("[data-page-orientation],[data-page-paper],[data-page-margins],[data-page-toggle]");
  for (i = 0; i < btns.length; i++) {
    var d = btns[i].dataset, on;
    if (d.pageOrientation) on = d.pageOrientation === pageSetup.orientation;
    else if (d.pagePaper) on = d.pagePaper === pageSetup.paper;
    else if (d.pageMargins) on = d.pageMargins === pageSetup.margins;
    else { k = d.pageToggle; on = !!pageSetup[k]; }
    btns[i].setAttribute("aria-pressed", on ? "true" : "false");
  }
}

function setPage(change) {
  Object.assign(pageSetup, change);
  savePageSetup();
  applyPageSetup();
}

/* Fit width: scale the table to the printable width just before printing */
function fitForPrint() {
  var table = document.querySelector("table." + CLS.table), m, p, w, avail, z;
  if (!table) return;
  table.style.zoom = "";
  if (!pageSetup.fit) return;
  m = OfficePage.margins(pageSetup.margins, pageSetup.custom);
  p = OfficePage.papers[pageSetup.paper];
  w = pageSetup.orientation === "landscape" ? p.heightCm : p.widthCm;
  avail = (w - m.left - m.right) * 96 / 2.54;          // printable width in CSS px
  z = avail / Math.max(1, table.scrollWidth);
  if (z < 1) table.style.zoom = String(Math.floor(z * 1000) / 1000);
}

function initPageSetup() {
  var panel = document.getElementById("of-panel-page");
  loadPageSetup();
  applyPageSetup();
  window.addEventListener("beforeprint", fitForPrint);
  window.addEventListener("afterprint", function () {
    var t = document.querySelector("table." + CLS.table);
    if (t) t.style.zoom = "";
  });
  if (!panel) return;
  panel.addEventListener("click", function (ev) {
    var btn = ev.target.closest("button");
    if (!btn) return;
    var d = btn.dataset;
    if (d.pageOrientation) setPage({ orientation: d.pageOrientation });
    else if (d.pagePaper) setPage({ paper: d.pagePaper });
    else if (d.pageMargins === "custom") {
      OfficePage.customMarginsDialog(OfficePage.margins(pageSetup.margins, pageSetup.custom)).then(function (m) {
        if (m) setPage({ margins: "custom", custom: m });
      });
    } else if (d.pageMargins) setPage({ margins: d.pageMargins });
    else if (d.pageToggle) { var c = {}; c[d.pageToggle] = !pageSetup[d.pageToggle]; setPage(c); }
    else if (btn.id === "page-print") printSheet();
  });
}
