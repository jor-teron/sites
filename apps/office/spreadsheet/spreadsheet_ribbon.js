/*
 * spreadsheet_ribbon.js
 * Draftly-style ribbon: File menu + tabs (Home | Insert | Data), one row of controls per tab.
 * Only UI: the buttons keep their ids and are wired by spreadsheet_toolbar.js (wireUi),
 * which calls initRibbon() at the end. Tabs are plain data so a host (e.g. the Hub title bar)
 * can render them later and call ribbonSelectTab(id).
 */
var SHEET_RIBBON_TABS = [
  { id: "home", label: "Home" },
  { id: "insert", label: "Insert" },
  { id: "data", label: "Data" }
];
var RIBBON_TAB_KEY = "spreadsheet-ribbon-tab";

/* Show one tab panel, update aria, remember the choice */
function ribbonSelectTab(id, focus) {
  var i, t, on, panels = document.querySelectorAll(".sr-panel"), tabs = document.querySelectorAll(".sr-tab");
  var ok = SHEET_RIBBON_TABS.some(function (x) { return x.id === id; });
  if (!ok) id = SHEET_RIBBON_TABS[0].id;
  for (i = 0; i < tabs.length; i++) {
    t = tabs[i];
    on = t.dataset.tab === id;
    t.setAttribute("aria-selected", on ? "true" : "false");
    t.tabIndex = on ? 0 : -1;
    if (on && focus) t.focus();
  }
  for (i = 0; i < panels.length; i++) panels[i].hidden = panels[i].dataset.tab !== id;
  try { localStorage.setItem(RIBBON_TAB_KEY, id); } catch (e) {}
}

/* Open / close the File menu under the File button */
function ribbonSetFile(show) {
  var menu = document.getElementById("sr-file-menu"), btn = document.getElementById("sr-file-btn");
  if (!menu || !btn) return;
  menu.hidden = !show;
  btn.classList.toggle("active", show);
  btn.setAttribute("aria-expanded", show ? "true" : "false");
  if (show) {
    var r = btn.getBoundingClientRect();
    menu.style.top = Math.round(r.bottom + 6) + "px";
    menu.style.left = Math.round(Math.max(6, r.left)) + "px";
  }
}

/* Build the tab buttons from SHEET_RIBBON_TABS and wire the ribbon */
function initRibbon() {
  var bar = document.getElementById("sr-tabs"), saved = null;
  if (!bar) return;
  bar.innerHTML = "";
  SHEET_RIBBON_TABS.forEach(function (tab) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "sr-tab";
    b.setAttribute("role", "tab");
    b.id = "sr-tab-" + tab.id;
    b.dataset.tab = tab.id;
    b.setAttribute("aria-controls", "sr-panel-" + tab.id);
    b.textContent = tab.label;
    b.addEventListener("click", function () { ribbonSetFile(false); ribbonSelectTab(tab.id); });
    bar.appendChild(b);
  });
  bar.addEventListener("keydown", function (ev) {
    if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
    var ids = SHEET_RIBBON_TABS.map(function (x) { return x.id; });
    var i = ids.indexOf(ev.target.dataset.tab);
    if (i < 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    ribbonSelectTab(ids[(i + (ev.key === "ArrowRight" ? 1 : ids.length - 1)) % ids.length], true);
  });
  try { saved = localStorage.getItem(RIBBON_TAB_KEY); } catch (e) {}
  ribbonSelectTab(saved || SHEET_RIBBON_TABS[0].id);

  var fileBtn = document.getElementById("sr-file-btn"), menu = document.getElementById("sr-file-menu");
  fileBtn.addEventListener("click", function () { ribbonSetFile(menu.hidden); });
  menu.addEventListener("click", function (ev) {
    if (ev.target.closest("button, a")) ribbonSetFile(false);   // label opens the file picker; closes on change
  });
  document.getElementById("file-import").addEventListener("change", function () { ribbonSetFile(false); });
  document.addEventListener("mousedown", function (ev) {
    if (!menu.hidden && !menu.contains(ev.target) && ev.target !== fileBtn) ribbonSetFile(false);
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && !menu.hidden) { ribbonSetFile(false); fileBtn.focus(); }
  });
  window.addEventListener("resize", function () { ribbonSetFile(false); });
}
