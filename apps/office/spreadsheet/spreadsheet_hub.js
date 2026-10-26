/*
 * spreadsheet_hub.js
 * SH3 Sites hub title-bar bridge for Spreadsheet. Same v:1 protocol as Draftly's
 * ../draftly/modules/draftly-hub.js. Only active in a frame.
 *   app -> hub {type:'hub-ready'}                                     on load
 *   hub -> app {type:'hub-hello'}            -> body.in-hub (own top row hidden), reply hub-app + caps
 *   app -> hub {type:'hub-app', app:'Spreadsheet', tabs:[{id,label,menu?}], activeTab, title}
 *   app -> hub {type:'hub-tab', id}            ribbon tab changed
 *   app -> hub {type:'hub-title', value}       sheet name changed (import CSV / New)
 *   hub -> app {type:'hub-action', id:'tab:<id>', hover?}  switch tab; 'tab:file' opens File menu
 *              (hover:true = open-only, marked hover-opened; collapsed ribbon peeks)
 *   hub -> app {type:'hub-menu-leave', id, delay}  close a hover-opened File menu after delay ms
 *              unless the pointer is on it (click-opened menus ignore this)
 *   hub -> app {type:'hub-settings'}           open the Settings panel
 *   app -> hub {type:'hub-app-caps', settings, hoverTabs, ribbonCollapsed}  on hello + setting change
 * Sheet name: Spreadsheet has no rename; the name is the last imported CSV's file name
 * (without extension), "Sheet" after New / Clear. Stored in localStorage 'spreadsheet-name'.
 * DEPENDS: SHEET_RIBBON_TABS, SHEET_RIBBON, SHEET_COLLAPSE, SHEET_SETTINGS, sheetApplySetting,
 *          ribbonSelectTab, ribbonSetFile, emptyGrid. Load after spreadsheet_keys.js.
 */
var SHEET_HUB = { V: 1, linked: false, menuInset: 8, NAME_KEY: "spreadsheet-name", DEFAULT_NAME: "Sheet" };

SHEET_INIT.push(function () {   /* runs in boot(), after initRibbon() */
  var H = SHEET_HUB;
  var IN_FRAME = (function () { try { return window.parent && window.parent !== window; } catch (e) { return true; } })();
  if (!IN_FRAME) return;
  var lastTitle = null, lastTab = null;
  H.tabs = [{ id: "file", label: "File", menu: true }].concat(SHEET_RIBBON_TABS.map(function (t) { return { id: t.id, label: t.label }; }));

  function post(msg) { try { window.parent.postMessage(Object.assign({ v: H.V }, msg), "*"); } catch (e) {} }
  function originOk(origin) {
    return origin === location.origin || origin === "null" || location.origin === "null" || String(origin).indexOf("file:") === 0;
  }
  function fm() { return document.getElementById("of-file-menu"); }
  function isFileOpen() { var m = fm(); return !!(m && !m.hidden); }
  function activeTab() {
    var t = document.querySelector("#of-tabs .of-tab[aria-selected='true']");
    return t ? t.getAttribute("data-tab") : "home";
  }
  H.title = function () { try { return localStorage.getItem(H.NAME_KEY) || H.DEFAULT_NAME; } catch (e) { return H.DEFAULT_NAME; } };
  H.setTitle = function (v) {
    try { localStorage.setItem(H.NAME_KEY, v || H.DEFAULT_NAME); } catch (e) {}
    sendTitle();
  };

  function sendCaps() {
    var st = SHEET_SETTINGS && SHEET_SETTINGS.s;
    post({ type: "hub-app-caps", settings: true, hoverTabs: !st || st.hoverTabs !== false, ribbonCollapsed: !!(st && st.ribbonCollapsed) });
  }
  if (typeof sheetApplySetting === "function") {
    var apply = sheetApplySetting;
    sheetApplySetting = function (k) { var r = apply.apply(this, arguments); if (H.linked && (k === "hoverTabs" || k === "ribbonCollapsed" || !k)) sendCaps(); return r; };
  }
  function sendApp() {
    lastTab = activeTab(); lastTitle = H.title();
    post({ type: "hub-app", app: "Spreadsheet", tabs: H.tabs, activeTab: lastTab, title: lastTitle });
    sendCaps();
  }
  function sendTab() { if (!H.linked) return; var t = activeTab(); if (t !== lastTab) { lastTab = t; post({ type: "hub-tab", id: t }); } }
  function sendTitle() { if (!H.linked) return; var v = H.title(); if (v !== lastTitle) { lastTitle = v; post({ type: "hub-title", value: v }); } }

  /* Tab changes: wrap the ribbon's select (also catches clicks / hover / keys). */
  if (SHEET_RIBBON) {
    var sel = SHEET_RIBBON.select;
    SHEET_RIBBON.select = function () { var r = sel.apply(this, arguments); sendTab(); return r; };
  }

  /* Name: import (capture runs before the toolbar resets the input) and New / Clear. */
  var imp = document.getElementById("file-import");
  if (imp) document.addEventListener("change", function (e) {
    if (e.target !== imp || !imp.files || !imp.files[0]) return;
    H.setTitle(imp.files[0].name.replace(/\.[^.]+$/, ""));
  }, true);
  var clearing = false;
  var clr = document.getElementById("btn-clear");
  if (clr) clr.addEventListener("click", function () { clearing = true; setTimeout(function () { clearing = false; }, 0); }, true);
  if (typeof emptyGrid === "function") {
    var eg = emptyGrid;
    emptyGrid = function () { var r = eg.apply(this, arguments); if (clearing) H.setTitle(H.DEFAULT_NAME); return r; };
  }

  /* File menu, anchored top-left inside the frame (its button is hidden in the hub). */
  var hoverFile = false, leaveT = null, overMenu = false;
  function clearLeave() { if (leaveT) { clearTimeout(leaveT); leaveT = null; } }
  function startLeave(ms) {
    clearLeave();
    leaveT = setTimeout(function () {
      leaveT = null;
      if (hoverFile && !overMenu && isFileOpen()) ribbonSetFile(false);
      if (!isFileOpen()) hoverFile = false;
    }, ms);
  }
  var m0 = fm();
  if (m0) {
    m0.addEventListener("pointerenter", function () { overMenu = true; clearLeave(); });
    m0.addEventListener("pointerleave", function () { overMenu = false; if (hoverFile && isFileOpen()) startLeave(300); });
  }
  H.menuLeave = function (ms) {
    if (!hoverFile || !isFileOpen()) return;
    var d = Number(ms); startLeave(d >= 0 && d < 5000 ? d : 300);
  };
  H.openFile = function (hover) {
    var open = isFileOpen();
    clearLeave();
    if (hover) { if (!open) { hoverFile = true; ribbonSetFile(true); } }
    else { hoverFile = false; ribbonSetFile(!open); }
    if (isFileOpen()) { var m = fm(); m.style.top = H.menuInset + "px"; m.style.left = H.menuInset + "px"; }
  };

  window.addEventListener("message", function (e) {
    if (e.source !== window.parent || !originOk(e.origin)) return;
    var d = e.data;
    if (!d || typeof d !== "object") return;
    if (d.type === "hub-settings") { if (SHEET_SETTINGS) SHEET_SETTINGS.open(); return; }
    if (d.v !== H.V) return;
    if (d.type === "hub-hello") {
      if (!H.linked) { H.linked = true; document.body.classList.add("in-hub"); }
      sendApp();
    } else if (d.type === "hub-action" && H.linked && typeof d.id === "string" && d.id.indexOf("tab:") === 0) {
      var id = d.id.slice(4);
      if (id === "file") H.openFile(d.hover === true);
      else if (H.tabs.some(function (t) { return t.id === id && !t.menu; })) {
        if (isFileOpen()) ribbonSetFile(false);
        ribbonSelectTab(id);
        if (SHEET_COLLAPSE) SHEET_COLLAPSE.peek(true);
      }
    } else if (d.type === "hub-menu-leave" && H.linked) {
      H.menuLeave(d.delay);
    }
  });
  post({ type: "hub-ready" });
});
