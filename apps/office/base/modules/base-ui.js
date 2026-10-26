/*
 * base-ui.js  (BS1)
 * Base app shell: ribbon (shared office-ribbon / hover / collapse), Settings panel (office-settings,
 * key 'base_settings'), File menu, table + field + record commands, view switch, starter templates, boot.
 * Field editing uses OfficeDialog.form: one "name : type" box per field (empty = delete field).
 * Types typed as text / number / date / yes-no.
 */
var BASE_RIBBON_TABS = [{ id: "home", label: "Home" }, { id: "view", label: "View" }];
var BASE_VERSION = "BS1";
var BASE_RIBBON = null, BASE_COLLAPSE = null, BASE_SETTINGS = null;
var BASE_TYPES = { text: "Text", number: "Number", date: "Date", bool: "Yes/No" };

function ribbonSelectTab(id, focus) { if (BASE_RIBBON) BASE_RIBBON.select(id, focus); }
function ribbonSetFile(show) { if (BASE_RIBBON) BASE_RIBBON.setFile(show); }

function baseApplySetting(k) {
  var s = BASE_SETTINGS.s;
  if (!k || k === "theme") OfficeTheme.apply(OfficeTheme.isDark(s.theme), { lightClass: "base-light", key: "base_theme" });
  if ((!k || k === "ribbonCollapsed") && BASE_COLLAPSE) BASE_COLLAPSE.apply(s.ribbonCollapsed);
}

var BaseUI = (function () {
  function $(id) { return document.getElementById(id); }
  function toast(m) { if (typeof OfficeToast !== "undefined") OfficeToast.show(m, 2500); }
  function status(m) { $("status").textContent = m; }
  function typeLabel(t) { return BASE_TYPES[t] || "Text"; }
  function parseType(s) {
    s = String(s || "").trim().toLowerCase();
    if (/^num/.test(s)) return "number"; if (/^date/.test(s)) return "date";
    if (/^(yes|bool|y\/n|check)/.test(s)) return "bool"; if (!s || /^te?xt/.test(s)) return "text";
    return null;
  }
  function render() {
    var t = BaseStore.table();
    if (t) BASE.db.current = t.id;
    var sel = $("table-sel"); sel.textContent = "";
    BASE.db.tables.forEach(function (x) { var o = document.createElement("option"); o.value = x.id; o.textContent = x.name; o.selected = t && x.id === t.id; sel.appendChild(o); });
    var ft = $("file-tables"); ft.textContent = "";
    BASE.db.tables.forEach(function (x) {
      var b = document.createElement("button"); b.type = "button"; b.className = "file-item" + (t && x.id === t.id ? " on" : ""); b.setAttribute("role", "menuitem");
      b.textContent = x.name; b.addEventListener("click", function () { ribbonSetFile(false); switchTable(x.id); }); ft.appendChild(b);
    });
    $("grid-wrap").hidden = BASE.view !== "grid"; $("form-wrap").hidden = BASE.view !== "form";
    $("btn-view-grid").classList.toggle("on", BASE.view === "grid"); $("btn-view-form").classList.toggle("on", BASE.view === "form");
    if (BASE.view === "grid") BaseGrid.render(); else BaseForm.render();
    if (typeof BASE_HUB !== "undefined" && BASE_HUB.sendTitle) BASE_HUB.sendTitle();
  }
  function switchTable(id) { BASE.db.current = id; BASE.sort = null; BASE.selRow = null; BASE.formIndex = 0; BaseStore.save(); render(); }
  function renderEmpty(wrap) {
    var d = document.createElement("div"); d.className = "base-empty";
    d.appendChild(document.createTextNode("No tables yet. Start from a template:"));
    var row = document.createElement("div"); row.className = "base-tpl";
    Object.keys(BaseStore.templates).forEach(function (k) {
      var b = document.createElement("button"); b.type = "button"; b.className = "base-btn" + (k === "Blank" ? "" : " primary"); b.textContent = k;
      b.addEventListener("click", function () { fromTemplate(k, k === "Blank" ? "Table" : k); }); row.appendChild(b);
    });
    d.appendChild(row); wrap.appendChild(d); status("");
  }
  function uniqueName(n) { var base = n, i = 2; while (BASE.db.tables.some(function (t) { return t.name === n; })) n = base + " " + i++; return n; }
  function fromTemplate(k, name) { var tp = BaseStore.templates[k]; BaseStore.newTable(uniqueName(name), tp.fields, tp.rows); BASE.sort = null; BASE.selRow = null; render(); toast("Table “" + BaseStore.table().name + "” created"); }
  function newTable() {
    OfficeDialog.form({ title: "New table", message: "Template: Contacts, Expenses, Stock or Blank",
      fields: [{ key: "name", label: "Table name", value: "Table" }, { key: "tpl", label: "Template", value: "Blank" }],
      validate: function (v) { return !v.name.trim() ? "Enter a name" : matchTpl(v.tpl) ? "" : "Template: Contacts, Expenses, Stock or Blank"; }
    }).then(function (v) { if (v) fromTemplate(matchTpl(v.tpl), v.name.trim()); });
  }
  function matchTpl(s) { s = String(s || "").trim().toLowerCase() || "blank"; return Object.keys(BaseStore.templates).filter(function (k) { return k.toLowerCase().indexOf(s) === 0; })[0]; }
  function renameTable() {
    var t = BaseStore.table(); if (!t) return;
    OfficeDialog.prompt({ title: "Rename table", label: "Name", value: t.name }).then(function (v) { if (v) { t.name = v.trim(); BaseStore.save(); render(); } });
  }
  function deleteTable() {
    var t = BaseStore.table(); if (!t) return;
    OfficeDialog.confirm({ title: "Delete table?", message: "Delete “" + t.name + "” and its " + t.rows.length + " records?", okLabel: "Delete", danger: true }).then(function (ok) {
      if (!ok) return; BASE.db.tables = BASE.db.tables.filter(function (x) { return x !== t; }); BASE.db.current = BASE.db.tables[0] ? BASE.db.tables[0].id : null; BaseStore.save(); render();
    });
  }
  function addRow() {
    var t = BaseStore.table(); if (!t) return;
    var r = { id: BaseStore.uid(), v: {} }; t.fields.forEach(function (f) { r.v[f.id] = f.type === "bool" ? false : ""; });
    t.rows.push(r); BASE.selRow = r.id; BASE.search = ""; $("search").value = ""; BASE.sort = null; BaseStore.save(); BASE.focusForm = true; render();
    var tr = document.querySelector(".base-grid tr.sel"); if (tr) { tr.classList.add("pop"); tr.scrollIntoView({ block: "nearest" }); var i = tr.querySelector("input"); if (i) i.focus(); }
  }
  function deleteRow() {
    var t = BaseStore.table(); if (!t) return;
    var r = t.rows.filter(function (x) { return x.id === BASE.selRow; })[0];
    if (!r) return toast("Click a row number (or a cell) to pick a record first");
    t.rows.splice(t.rows.indexOf(r), 1); BASE.selRow = null; BaseStore.save(); render(); toast("Record deleted");
  }
  function addField() {
    var t = BaseStore.table(); if (!t) return;
    OfficeDialog.form({ title: "Add field", fields: [{ key: "name", label: "Field name", value: "" }, { key: "type", label: "Type: text, number, date, yes/no", value: "text" }],
      validate: function (v) { return !v.name.trim() ? "Enter a name" : parseType(v.type) ? "" : "Type must be text, number, date or yes/no"; }
    }).then(function (v) {
      if (!v) return; var f = { id: BaseStore.uid(), name: v.name.trim(), type: parseType(v.type) };
      t.fields.push(f); t.rows.forEach(function (r) { r.v[f.id] = f.type === "bool" ? false : ""; }); BaseStore.save(); render();
    });
  }
  function editFields() {
    var t = BaseStore.table(); if (!t) return;
    OfficeDialog.form({ title: "Fields of " + t.name, message: "Edit “name : type” (text, number, date, yes/no). Clear a box to delete that field.",
      fields: t.fields.map(function (f, i) { return { key: f.id, label: "Field " + (i + 1), value: f.name + " : " + typeLabel(f.type) }; }),
      validate: function (v) {
        var keep = 0, bad = "";
        t.fields.forEach(function (f) { var s = v[f.id].trim(); if (!s) return; keep++; var p = s.split(":"); if (!p[0].trim()) bad = "A field needs a name"; else if (!parseType(p[1])) bad = "Unknown type in “" + s + "”"; });
        return bad || (keep ? "" : "Keep at least one field");
      }
    }).then(function (v) {
      if (!v) return;
      t.fields = t.fields.filter(function (f) {
        var s = v[f.id].trim(); if (!s) { t.rows.forEach(function (r) { delete r.v[f.id]; }); return false; }
        var p = s.split(":"), nt = parseType(p[1]); f.name = p[0].trim();
        if (nt !== f.type) { t.rows.forEach(function (r) { r.v[f.id] = BaseCsv.cast(String(r.v[f.id] === true ? "yes" : r.v[f.id] === false ? "" : r.v[f.id]), nt); if (nt === "number" && isNaN(r.v[f.id])) r.v[f.id] = ""; }); f.type = nt; }
        return true;
      });
      BASE.sort = null; BaseStore.save(); render();
    });
  }
  function setView(v) { BASE.view = v; render(); }
  function importFile(file) {
    var rd = new FileReader();
    rd.onload = function () { var t = BaseCsv.importText(uniqueName(file.name.replace(/\.[^.]+$/, "")), String(rd.result)); if (!t) return toast("That CSV is empty"); BASE.sort = null; render(); toast("Imported " + t.rows.length + " records"); };
    rd.readAsText(file);
  }
  return { render: render, renderEmpty: renderEmpty, status: status, typeLabel: typeLabel, addRow: addRow, deleteRow: deleteRow,
    newTable: newTable, renameTable: renameTable, deleteTable: deleteTable, addField: addField, editFields: editFields,
    setView: setView, switchTable: switchTable, importFile: importFile };
})();

function initBaseRibbon() {
  var tabsEl = document.getElementById("of-tabs"), fb = document.getElementById("of-file-btn"), fm = document.getElementById("of-file-menu");
  BASE_RIBBON = OfficeRibbon.create({ tabs: BASE_RIBBON_TABS, storageKey: "base-ribbon-tab", tabsEl: tabsEl, fileBtn: fb, fileMenu: fm });
  if (typeof OfficeHover !== "undefined") OfficeHover.attach({
    tabsEl: tabsEl, tabSelector: ".of-tab",
    selectTab: function (id) { ribbonSelectTab(id); if (BASE_COLLAPSE) BASE_COLLAPSE.peek(); },
    fileBtn: fb, fileMenu: fm, isFileOpen: function () { return !fm.hidden; }, setFile: ribbonSetFile,
    enabled: function () { return !BASE_SETTINGS || BASE_SETTINGS.s.hoverTabs !== false; }
  });
  var rib = document.getElementById("of-ribbon");
  if (typeof OfficeCollapse !== "undefined") {
    rib.classList.add("of-collapsible");
    BASE_COLLAPSE = OfficeCollapse.attach({ tabsEl: tabsEl, tabSelector: ".of-tab", ribbonEl: rib, docEl: document.getElementById("base-main"),
      collapsed: !!(BASE_SETTINGS && BASE_SETTINGS.s.ribbonCollapsed),
      onUserChange: function (v) { if (BASE_SETTINGS) BASE_SETTINGS.set("ribbonCollapsed", v); else BASE_COLLAPSE.apply(v); } });
  }
}

function initBaseSettings() {
  BASE_SETTINGS = OfficeSettings.create({
    key: "base_settings",
    defaults: { theme: "dark", hoverTabs: true, ribbonCollapsed: false },
    gearBtn: document.getElementById("settingsBtn"),
    validate: function (s) { if (["light", "dark", "auto"].indexOf(s.theme) === -1) s.theme = "dark"; },
    sections: [
      { title: "View", rows: [
        { key: "theme", type: "select", id: "set-theme", label: "Theme", options: OfficeTheme.modes },
        { key: "hoverTabs", type: "switch", id: "set-hover-tabs", label: "Open tabs on hover" },
        { key: "ribbonCollapsed", type: "switch", id: "set-ribbon-collapsed", label: "Collapse ribbon" } ] },
      { title: "About", rows: [{ type: "about", id: "set-version", text: "Base " + BASE_VERSION }] }
    ],
    onChange: function (k) { baseApplySetting(k); },
    onReset: function () { baseApplySetting(); },
    confirm: function (msg) { return OfficeDialog.confirm({ title: "Reset settings?", message: msg, okLabel: "Reset" }); },
    toast: function (m) { OfficeToast.show(m); }
  });
  baseApplySetting();
  if (typeof OfficeTheme.watch === "function") OfficeTheme.watch(function () { if (BASE_SETTINGS.s.theme === "auto") baseApplySetting("theme"); });
}

(function boot() {
  function $(id) { return document.getElementById(id); }
  if (typeof OfficeIcons !== "undefined") OfficeIcons.fill(document);
  initBaseSettings();
  initBaseRibbon();
  function menu(id, fn) { $(id).addEventListener("click", function () { ribbonSetFile(false); fn(); }); }
  menu("btn-new-table", BaseUI.newTable);
  menu("btn-export", function () { var t = BaseStore.table(); if (t) BaseCsv.exportTable(t); });
  menu("btn-print", function () { window.print(); });
  menu("settingsMenuBtn", function () { BASE_SETTINGS.open(); });
  $("file-import").addEventListener("change", function (e) { var f = e.target.files[0]; ribbonSetFile(false); if (f) BaseUI.importFile(f); e.target.value = ""; });
  $("table-sel").addEventListener("change", function (e) { BaseUI.switchTable(e.target.value); });
  $("btn-table-rename").addEventListener("click", BaseUI.renameTable);
  $("btn-table-delete").addEventListener("click", BaseUI.deleteTable);
  $("btn-row-add").addEventListener("click", BaseUI.addRow);
  $("btn-row-del").addEventListener("click", BaseUI.deleteRow);
  $("btn-field-add").addEventListener("click", BaseUI.addField);
  $("btn-field-edit").addEventListener("click", BaseUI.editFields);
  $("btn-view-grid").addEventListener("click", function () { BaseUI.setView("grid"); });
  $("btn-view-form").addEventListener("click", function () { BaseUI.setView("form"); });
  $("btn-sort-clear").addEventListener("click", function () { BASE.sort = null; BaseUI.render(); });
  var st = null;
  $("search").addEventListener("input", function (e) { clearTimeout(st); st = setTimeout(function () { BASE.search = e.target.value; BaseUI.render(); }, 150); });
  window.addEventListener("pagehide", BaseStore.saveNow);
  BaseStore.load(function () { BaseUI.render(); if (typeof BASE_HUB !== "undefined" && BASE_HUB.start) BASE_HUB.start(); });
})();
