/*
 * apps/office/shared/office-quick.js  (HO1 Hub Office Quick Access)
 * One Quick Access bar for the Office apps: Undo | Redo | Save | Print, then the ribbon tabs.
 *   OfficeQuick.register({
 *     app,                         name (for messages)
 *     undo(), redo(), canUndo(), canRedo(),   leave undo out = Undo/Redo stay disabled
 *     save() -> true | false | Promise,       "save now"; the bar shows a ✓ Saved tick
 *     canSave(), print(),
 *     undoKey(ev) -> bool,         route Ctrl/Cmd+Z / Ctrl+Y / Ctrl+Shift+Z to undo/redo here
 *                                  (false = let the browser's own text undo run, e.g. in a field)
 *     tabs() -> [{id,label}], activeTab() -> id, onTab(id)   for the Hub title bar (File first)
 *     mount, before,               in-app bar goes into mount (the app's top row) before `before`
 *     fallback                     in the Hub (top row hidden) the bar moves to the start of this
 *   })
 *   OfficeQuick.refresh()          call after anything that changes undo/redo/save state or tab
 *   OfficeQuick.run(id)            'undo' | 'redo' | 'save' | 'print'
 * Shortcuts (window, capture): Ctrl/Cmd+S save, Ctrl/Cmd+P print (browser Save / Print dialogs
 * prevented), Ctrl/Cmd+Z undo, Ctrl+Y / Ctrl/Cmd+Shift+Z redo (when undoKey says so).
 * Hub: with HubTitleBar (office-hubbar.js) the same buttons + tabs go to the Hub window title bar
 * after hubTitleBarHello, and the in-app bar hides (body.hub-titlebar). Before that it stays.
 * Look: office-quick.css. Labels hide on phones (icons only). No dependencies besides OfficeNotify (optional).
 */
var OfficeQuick = (function () {
  var RELEASE = "HO1";
  var ICONS = {
    undo: '<path d="M9 7 4.5 11.5 9 16"/><path d="M5 11.5h9.5a5 5 0 0 1 0 10H11"/>',
    redo: '<path d="M15 7l4.5 4.5L15 16"/><path d="M19 11.5H9.5a5 5 0 0 0 0 10H13"/>',
    save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
    print: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="7" rx="1.5"/><path d="M7 14h10v6H7z"/>'
  };
  var MAC = /Mac|iPhone|iPad/.test(navigator.platform || "");
  var MOD = MAC ? "⌘" : "Ctrl+";
  var DEFS = [
    { id: "undo", label: "Undo", glyph: "↶", title: "Undo (" + MOD + "Z)" },
    { id: "redo", label: "Redo", glyph: "↷", title: MAC ? "Redo (⌘⇧Z)" : "Redo (Ctrl+Y)" },
    { id: "save", label: "Save", glyph: "💾", title: "Save (" + MOD + "S)" },
    { id: "print", label: "Print", glyph: "🖨", title: "Print (" + MOD + "P)" }
  ];
  var A = null, bar = null, btns = {}, state = {}, lastTab = null, tickT = 0, saving = false;

  function call(fn, dflt) { try { return typeof fn === "function" ? fn() : dflt; } catch (e) { console.warn("OfficeQuick", e); return dflt; } }
  function enabled(id) {
    if (!A) return false;
    if (id === "undo") return !!(A.undo && call(A.canUndo, false));
    if (id === "redo") return !!(A.redo && call(A.canRedo, false));
    if (id === "save") return !!A.save && !saving && call(A.canSave, true) !== false;
    if (id === "print") return !!A.print;
    return false;
  }
  function note(m) { if (typeof OfficeNotify !== "undefined") OfficeNotify.show(m, 3000); }

  function hubButtons() {
    return DEFS.map(function (d) { return { id: d.id, label: d.label, icon: d.glyph, enabled: enabled(d.id), title: d.title }; });
  }
  function hubSet() {
    if (typeof HubTitleBar === "undefined" || !HubTitleBar.linked || !A) return;
    lastTab = call(A.activeTab, null);
    HubTitleBar.set({ buttons: hubButtons(), tabs: call(A.tabs, []) || [], activeTab: lastTab });
    DEFS.forEach(function (d) { state[d.id] = enabled(d.id); });
  }

  function refresh() {
    if (!A) return;
    var patch = [];
    DEFS.forEach(function (d) {
      var on = enabled(d.id);
      if (btns[d.id]) { btns[d.id].disabled = !on; btns[d.id].setAttribute("aria-disabled", on ? "false" : "true"); }
      if (state[d.id] !== on) { state[d.id] = on; patch.push({ id: d.id, enabled: on }); }
    });
    if (typeof HubTitleBar !== "undefined" && HubTitleBar.linked) {
      var t = call(A.activeTab, null), m = {};
      if (patch.length) m.buttons = patch;
      if (t != null && t !== lastTab) { lastTab = t; m.activeTab = t; }
      if (m.buttons || m.activeTab != null) HubTitleBar.update(m);
    }
  }

  function showTick(ok) {
    var b = btns.save;
    clearTimeout(tickT);
    if (b) { b.classList.toggle("of-q-saved", ok); b.classList.toggle("of-q-fail", !ok); }
    if (bar) { var live = bar.querySelector(".of-q-live"); if (live) live.textContent = ok ? "Saved" : "Could not save"; }
    if (typeof HubTitleBar !== "undefined" && HubTitleBar.linked) HubTitleBar.update({ buttons: [{ id: "save", label: ok ? "✓ Saved" : "Save failed" }] });
    if (!ok) note("Could not save");
    tickT = setTimeout(function () {
      if (b) b.classList.remove("of-q-saved", "of-q-fail");
      if (typeof HubTitleBar !== "undefined" && HubTitleBar.linked) HubTitleBar.update({ buttons: [{ id: "save", label: "Save" }] });
    }, 1800);
  }
  function doSave() {
    if (!enabled("save")) return;
    var r;
    try { r = A.save(); } catch (e) { console.warn("OfficeQuick save", e); r = false; }
    if (r && typeof r.then === "function") {
      saving = true; refresh();
      r.then(function (v) { saving = false; refresh(); showTick(v !== false); }, function () { saving = false; refresh(); showTick(false); });
    } else showTick(r !== false);
  }
  function run(id) {
    if (!A || !enabled(id)) return false;
    if (id === "save") doSave();
    else { call(A[id]); refresh(); }
    return true;
  }

  function onKey(ev) {
    if (!A || !(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
    var k = String(ev.key || "").toLowerCase();
    if (k === "s" || k === "p") {
      if (ev.shiftKey) return;
      ev.preventDefault();                       // never the browser's Save page / Print dialog
      if (!ev.repeat) run(k === "s" ? "save" : "print");
      return;
    }
    var isUndo = k === "z" && !ev.shiftKey, isRedo = (k === "z" && ev.shiftKey) || (k === "y" && !ev.shiftKey);
    if (!isUndo && !isRedo) return;
    var route = typeof A.undoKey === "function" ? !!call(function () { return A.undoKey(ev); }, false) : !!A.undo;
    if (!route) return;                          // native text undo in fields
    ev.preventDefault();
    run(isUndo ? "undo" : "redo");
  }

  function build() {
    bar = document.createElement("div");
    bar.className = "of-quick";
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "Quick access");
    DEFS.forEach(function (d) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "of-q-btn of-q-" + d.id; b.title = d.title;
      b.setAttribute("aria-label", d.label); b.dataset.quick = d.id;
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[d.id] + '</svg><span class="of-q-label">' + d.label + "</span>" +
        (d.id === "save" ? '<span class="of-q-tick" aria-hidden="true">✓ Saved</span>' : "");
      b.addEventListener("mousedown", function (ev) { ev.preventDefault(); });   // keep the caret / cell selection
      b.addEventListener("click", function (ev) { ev.preventDefault(); run(d.id); });
      btns[d.id] = b; bar.appendChild(b);
    });
    var live = document.createElement("span");
    live.className = "of-q-live"; live.setAttribute("aria-live", "polite");
    bar.appendChild(live);
  }
  function place() {
    if (!bar || !A) return;
    var inHub = document.body.classList.contains("in-hub");
    var host = inHub && A.fallback ? A.fallback : A.mount;
    if (!host) return;
    bar.classList.toggle("of-quick-fallback", host === A.fallback && inHub);
    if (host === A.mount) { if (bar.parentNode !== host || bar.nextSibling !== (A.before || null)) host.insertBefore(bar, A.before && A.before.parentNode === host ? A.before : host.firstChild); }
    else if (bar.parentNode !== host || host.firstChild !== bar) host.insertBefore(bar, host.firstChild);
  }

  function register(o) {
    A = o || {};
    if (!bar) build();
    place();
    if (window.MutationObserver) new MutationObserver(place).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("keydown", onKey, true);
    if (typeof HubTitleBar !== "undefined") {
      HubTitleBar.onHello(hubSet);
      HubTitleBar.onClick(function (kind, id) {
        if (kind === "button") run(id);
        else if (kind === "tab" && typeof A.onTab === "function") { call(function () { A.onTab(id); }); refresh(); }
      });
    }
    refresh();
    return api;
  }
  var api = { RELEASE: RELEASE, register: register, refresh: refresh, run: run, buttons: btns, defs: DEFS };
  return api;
})();
