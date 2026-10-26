/*
 * base_hub.js  (BS1)
 * Sites hub title-bar bridge for Base. Same v:1 protocol as ../../spreadsheet/spreadsheet_hub.js
 * and Draftly's draftly-hub.js. Only active in a frame.
 *   app -> hub {type:'hub-ready'} on load; hub -> app {type:'hub-hello'} -> body.in-hub, reply hub-app + caps
 *   app -> hub {type:'hub-app', app:'Base', tabs, activeTab, title}  title = current table name
 *   app -> hub {type:'hub-tab', id} / {type:'hub-title', value}
 *   hub -> app {type:'hub-action', id:'tab:<id>', hover?} · {type:'hub-menu-leave', delay} · {type:'hub-settings'}
 *   app -> hub {type:'hub-app-caps', settings, hoverTabs, ribbonCollapsed}  on hello + setting change
 * DEPENDS: BASE_RIBBON_TABS, BASE_RIBBON, BASE_COLLAPSE, BASE_SETTINGS, baseApplySetting, ribbonSelectTab,
 *          ribbonSetFile, BaseStore. BASE_HUB.start() is called by base-ui.js after the data loads.
 */
var BASE_HUB = { V: 1, linked: false, menuInset: 8, DEFAULT_NAME: "Base" };

BASE_HUB.start = function () {
  var H = BASE_HUB;
  var IN_FRAME = (function () { try { return window.parent && window.parent !== window; } catch (e) { return true; } })();
  if (!IN_FRAME) return;
  var lastTitle = null, lastTab = null;
  H.tabs = [{ id: "file", label: "File", menu: true }].concat(BASE_RIBBON_TABS.map(function (t) { return { id: t.id, label: t.label }; }));
  function post(msg) { try { window.parent.postMessage(Object.assign({ v: H.V }, msg), "*"); } catch (e) {} }
  function originOk(o) { return o === location.origin || o === "null" || location.origin === "null" || String(o).indexOf("file:") === 0; }
  function fm() { return document.getElementById("of-file-menu"); }
  function isFileOpen() { var m = fm(); return !!(m && !m.hidden); }
  function activeTab() { var t = document.querySelector("#of-tabs .of-tab[aria-selected='true']"); return t ? t.getAttribute("data-tab") : "home"; }
  H.title = function () { var t = BaseStore.table(); return t ? t.name : H.DEFAULT_NAME; };
  function sendCaps() { var s = BASE_SETTINGS && BASE_SETTINGS.s; post({ type: "hub-app-caps", settings: true, hoverTabs: !s || s.hoverTabs !== false, ribbonCollapsed: !!(s && s.ribbonCollapsed) }); }
  var apply = baseApplySetting;
  baseApplySetting = function (k) { var r = apply.apply(this, arguments); if (H.linked && (k === "hoverTabs" || k === "ribbonCollapsed" || !k)) sendCaps(); return r; };
  function sendApp() { lastTab = activeTab(); lastTitle = H.title(); post({ type: "hub-app", app: "Base", tabs: H.tabs, activeTab: lastTab, title: lastTitle }); sendCaps(); }
  function sendTab() { if (!H.linked) return; var t = activeTab(); if (t !== lastTab) { lastTab = t; post({ type: "hub-tab", id: t }); } }
  H.sendTitle = function () { if (!H.linked) return; var v = H.title(); if (v !== lastTitle) { lastTitle = v; post({ type: "hub-title", value: v }); } };
  if (BASE_RIBBON) { var sel = BASE_RIBBON.select; BASE_RIBBON.select = function () { var r = sel.apply(this, arguments); sendTab(); return r; }; }

  var hoverFile = false, leaveT = null, overMenu = false;
  function clearLeave() { if (leaveT) { clearTimeout(leaveT); leaveT = null; } }
  function startLeave(ms) {
    clearLeave();
    leaveT = setTimeout(function () { leaveT = null; if (hoverFile && !overMenu && isFileOpen()) ribbonSetFile(false); if (!isFileOpen()) hoverFile = false; }, ms);
  }
  var m0 = fm();
  m0.addEventListener("pointerenter", function () { overMenu = true; clearLeave(); });
  m0.addEventListener("pointerleave", function () { overMenu = false; if (hoverFile && isFileOpen()) startLeave(300); });
  function openFile(hover) {
    var open = isFileOpen(); clearLeave();
    if (hover) { if (!open) { hoverFile = true; ribbonSetFile(true); } } else { hoverFile = false; ribbonSetFile(!open); }
    if (isFileOpen()) { var m = fm(); m.style.top = H.menuInset + "px"; m.style.left = H.menuInset + "px"; }
  }
  window.addEventListener("message", function (e) {
    if (e.source !== window.parent || !originOk(e.origin)) return;
    var d = e.data; if (!d || typeof d !== "object") return;
    if (d.type === "hub-settings") { if (BASE_SETTINGS) BASE_SETTINGS.open(); return; }
    if (d.v !== H.V) return;
    if (d.type === "hub-hello") { if (!H.linked) { H.linked = true; document.body.classList.add("in-hub"); } sendApp(); }
    else if (d.type === "hub-action" && H.linked && typeof d.id === "string" && d.id.indexOf("tab:") === 0) {
      var id = d.id.slice(4);
      if (id === "file") openFile(d.hover === true);
      else if (H.tabs.some(function (t) { return t.id === id && !t.menu; })) { if (isFileOpen()) ribbonSetFile(false); ribbonSelectTab(id); if (BASE_COLLAPSE) BASE_COLLAPSE.peek(true); }
    } else if (d.type === "hub-menu-leave" && H.linked) {
      if (hoverFile && isFileOpen()) { var ms = Number(d.delay); startLeave(ms >= 0 && ms < 5000 ? ms : 300); }
    }
  });
  post({ type: "hub-ready" });
};
