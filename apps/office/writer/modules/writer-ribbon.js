/* ============================================================
   FILE: modules/writer-ribbon.js
   DF25: was modules/draftly-ribbon.js (global Draftly is now Writer).
   PROJECT: Writer
   ROLE: Ribbon tabs (Home | Insert | Page) and the File menu.
         Only UI wiring: every file action calls the existing
         Writer.app / Writer.storage functions, so storage can be
         swapped later (e.g. Hub storage) without touching this file.
   DEPENDS: Writer.app, Writer.view, Writer.storage (at click time)
   ============================================================ */

/* (before DF25) var Draftly = window.Draftly || {}; window.Draftly = Draftly; */
var Writer = window.Writer || {};
window.Writer = Writer;

Writer.ribbon = {};
Writer.ribbon.storageKeyTab = 'writer-ribbon-tab';   /* (before DF25) Writer.ribbon.storageKeyTab = 'draftly-ribbon-tab'; */

/* Show one tab panel, update aria, remember the choice. */
Writer.ribbon.selectTab = function selectTab(name, focus) {
  var tabs = document.querySelectorAll('.ribbon-tab');
  var found = false;
  for (var i = 0; i < tabs.length; i++) if (tabs[i].getAttribute('data-tab') === name) found = true;
  if (!found) name = 'home';
  for (var j = 0; j < tabs.length; j++) {
    var t = tabs[j];
    var on = t.getAttribute('data-tab') === name;
    t.setAttribute('aria-selected', on ? 'true' : 'false');
    t.tabIndex = on ? 0 : -1;
    t.classList.toggle('active', on);
    var panel = document.getElementById(t.getAttribute('aria-controls'));
    if (panel) panel.hidden = !on;
    if (on && focus) t.focus();
  }
  try { localStorage.setItem(Writer.ribbon.storageKeyTab, name); } catch (e) {}
  if (name === 'page' && Writer.view) Writer.view.syncPagePanel();
};

Writer.ribbon.isFileOpen = function () {
  var m = document.getElementById('fileMenu');
  return !!(m && !m.hidden);
};

Writer.ribbon.setFile = function setFile(show, focusFirst) {
  var menu = document.getElementById('fileMenu');
  var btn = document.getElementById('fileBtn');
  if (!menu || !btn) return;
  if (show && Writer.view) Writer.view.closePops();
  menu.hidden = !show;
  btn.classList.toggle('active', show);
  btn.setAttribute('aria-expanded', show ? 'true' : 'false');
  if (show) {
    var r = btn.getBoundingClientRect();
    var vw = document.documentElement.clientWidth;
    menu.style.top = Math.round(r.bottom + 8) + 'px';
    menu.style.left = Math.round(Math.max(8, Math.min(r.left, vw - menu.offsetWidth - 8))) + 'px';
    var recent = document.getElementById('recentMenu');
    if (recent && recent.hidden && Writer.docs && Writer.docs.toggleRecent) Writer.docs.toggleRecent();
    if (focusFirst) { var first = menu.querySelector('.file-item'); if (first) first.focus(); }
  } else {
    var rm = document.getElementById('recentMenu');
    if (rm && !rm.hidden && Writer.view) Writer.view.togglePop('recentMenu', 'recentBtn', false);
  }
};

/* Ask for a new name and put it in the name box (hub-title follows via writer-hub.js). */
Writer.ribbon.rename = function rename() {
  var cur = Writer.storage.currentName();
  return Writer.dialog.prompt({ title: 'Rename document', label: 'Name', value: cur, okLabel: 'Rename' }).then(function (v) {
    if (v === null || v === cur) return false;
    Writer.storage.setCurrentName(v, false);
    var input = document.getElementById('fileNameInput');
    if (input) { input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); }
    /* DF15-B1 legacy (toast before the move; save could overwrite a doc with that name):
    if (Writer.ui && Writer.ui.showToast) Writer.ui.showToast('Renamed to ' + v);
    */
    /* DF15-B1: save now; a name taken by another document opens the clash dialog instead.
       (before HOW1) return Draftly.storage.save().then(function (n) { if (n === v && Draftly.ui && Draftly.ui.showToast) Draftly.ui.showToast('Renamed to ' + v); return n === v; }); */
    var p = Writer.how ? Writer.how.autosave() : Writer.storage.save();
    return p.then(function (n) {
      var name = n && n.name ? n.name : n;
      var want = Writer.how ? Writer.how.stem(v) : v;
      if (name === want && Writer.ui && Writer.ui.showToast) Writer.ui.showToast('Renamed to ' + name);
      return name === want;
    });
  });
};

Writer.ribbon.init = function init() {
  var tabs = document.querySelectorAll('.ribbon-tab');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener('mousedown', function (e) { e.preventDefault(); });
    tabs[i].addEventListener('click', function (e) {
      Writer.ribbon.selectTab(e.currentTarget.getAttribute('data-tab'));
    });
    tabs[i].addEventListener('keydown', function (e) {
      var list = Array.prototype.slice.call(document.querySelectorAll('.ribbon-tab'));
      var idx = list.indexOf(e.currentTarget);
      var next = -1;
      if (e.key === 'ArrowRight') next = (idx + 1) % list.length;
      else if (e.key === 'ArrowLeft') next = (idx - 1 + list.length) % list.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = list.length - 1;
      if (next < 0) return;
      e.preventDefault();
      Writer.ribbon.selectTab(list[next].getAttribute('data-tab'), true);
    });
  }
  var saved = 'home';
  try { saved = localStorage.getItem(Writer.ribbon.storageKeyTab) || 'home'; } catch (e) {}
  Writer.ribbon.selectTab(saved);

  var fileBtn = document.getElementById('fileBtn');
  var menu = document.getElementById('fileMenu');
  if (!fileBtn || !menu) return;
  fileBtn.addEventListener('mousedown', function (e) { e.preventDefault(); });
  fileBtn.addEventListener('click', function (e) {
    Writer.ribbon.setFile(!Writer.ribbon.isFileOpen(), e.detail === 0);
  });
  fileBtn.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); Writer.ribbon.setFile(true, true); }
  });
  /* Arrow keys move between menu items; Esc closes and returns focus. */
  menu.addEventListener('keydown', function (e) {
    var items = Array.prototype.slice.call(menu.querySelectorAll('.file-item, .recent-item, .recent-del'));
    var idx = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); Writer.ribbon.setFile(false); fileBtn.focus(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      var n = e.key === 'ArrowDown' ? idx + 1 : idx - 1;
      if (n < 0) n = items.length - 1;
      if (n >= items.length) n = 0;
      if (items[n]) items[n].focus();
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && Writer.ribbon.isFileOpen()) Writer.ribbon.setFile(false);
  });
  document.addEventListener('mousedown', function (e) {
    if (!Writer.ribbon.isFileOpen()) return;
    if (menu.contains(e.target) || fileBtn.contains(e.target)) return;
    Writer.ribbon.setFile(false);
  });
  /* DF13: hover opens tabs / File menu (shared ../shared/office-hover.js). */
  if (window.OfficeHover) OfficeHover.attach({
    tabsEl: document.querySelector('.ribbon-tab') ? document.querySelector('.ribbon-tab').parentNode : null,
    tabSelector: '.ribbon-tab',
    selectTab: function (id) { Writer.ribbon.selectTab(id); if (Writer.ribbon.collapse) Writer.ribbon.collapse.peek(); },
    fileBtn: fileBtn, fileMenu: menu,
    isFileOpen: Writer.ribbon.isFileOpen,
    setFile: function (v) { Writer.ribbon.setFile(v); },
    enabled: function () { var st = Writer.settings && (Writer.settings.s || (Writer.settings.panel && Writer.settings.panel.s)); return !st || st.hoverTabs !== false; }
  });
  /* DF13c: Word-style collapse (shared ../shared/office-collapse.js); state in settings 'ribbonCollapsed'. */
  var ribEl = document.querySelector('nav.ribbon');
  if (window.OfficeCollapse && ribEl) {
    ribEl.classList.add('of-collapsible');
    var st0 = Writer.settings && Writer.settings.s;
    Writer.ribbon.collapse = OfficeCollapse.attach({
      tabsEl: document.querySelector('.ribbon-tabs'), tabSelector: '.ribbon-tab',
      ribbonEl: ribEl, docEl: document.getElementById('workspace'),
      collapsed: !!(st0 && st0.ribbonCollapsed),
      onUserChange: function (v) { if (Writer.settings && Writer.settings.panel) Writer.settings.set('ribbonCollapsed', v); else Writer.ribbon.collapse.apply(v); },
      onLayout: function () {
        if (Writer.pages && Writer.app && Writer.app.ready) Writer.pages.layoutAll();
        if (Writer.ruler && Writer.ruler.on && Writer.ruler.sync) Writer.ruler.sync();
      }
    });
  }
  /* Any action (not the Recent header) closes the menu after it runs. */
  menu.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('button') : null;
    if (!t || t.id === 'recentBtn') return;
    setTimeout(function () { Writer.ribbon.setFile(false); }, 0);
  });

  function bind(id, fn) {
    var n = document.getElementById(id);
    if (!n) return;
    n.addEventListener('mousedown', function (e) { e.preventDefault(); });
    n.addEventListener('click', function (e) {
      e.preventDefault();
      try { fn(); } catch (err) { console.warn('writer: ' + id, err); }
    });
  }
  /* File > Rename: a dialog (standalone and in the hub). The name box itself still edits in place. */
  bind('renameBtn', function () { Writer.ribbon.rename(); });
  /* DF15-B1: typing a new name in the name box saves (and checks for a clash) when the box is left.
     HOW1: storage.save writes the .how file (writer-how.js). */
  var nameBox = document.getElementById('fileNameInput');
  if (nameBox) nameBox.addEventListener('change', function () {
    /* (before HOW1) if (Draftly.app && Draftly.app.ready && Draftly.storage.currentName() !== Draftly.storage.loadedName) Draftly.storage.save().catch(function () {}); */
    if (Writer.app && Writer.app.ready && Writer.storage.currentName() !== Writer.storage.loadedName && Writer.how) Writer.how.autosave();
  });
  bind('deleteCurrentBtn', function () {
    var name = Writer.storage.loadedName || Writer.storage.currentName();
    if (name) Writer.docs.deleteDoc(name);
  });
};

Writer.ribbon.init();
