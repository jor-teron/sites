/* ============================================================
   FILE: modules/draftly-ribbon.js
   PROJECT: Draftly
   ROLE: Ribbon tabs (Home | Insert | Page) and the File menu.
         Only UI wiring: every file action calls the existing
         Draftly.app / Draftly.storage functions, so storage can be
         swapped later (e.g. Hub storage) without touching this file.
   DEPENDS: Draftly.app, Draftly.view, Draftly.storage (at click time)
   ============================================================ */

var Draftly = window.Draftly || {};
window.Draftly = Draftly;

Draftly.ribbon = {};
Draftly.ribbon.storageKeyTab = 'draftly-ribbon-tab';

/* Show one tab panel, update aria, remember the choice. */
Draftly.ribbon.selectTab = function selectTab(name, focus) {
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
  try { localStorage.setItem(Draftly.ribbon.storageKeyTab, name); } catch (e) {}
  if (name === 'page' && Draftly.view) Draftly.view.syncPagePanel();
};

Draftly.ribbon.isFileOpen = function () {
  var m = document.getElementById('fileMenu');
  return !!(m && !m.hidden);
};

Draftly.ribbon.setFile = function setFile(show, focusFirst) {
  var menu = document.getElementById('fileMenu');
  var btn = document.getElementById('fileBtn');
  if (!menu || !btn) return;
  if (show && Draftly.view) Draftly.view.closePops();
  menu.hidden = !show;
  btn.classList.toggle('active', show);
  btn.setAttribute('aria-expanded', show ? 'true' : 'false');
  if (show) {
    var r = btn.getBoundingClientRect();
    var vw = document.documentElement.clientWidth;
    menu.style.top = Math.round(r.bottom + 8) + 'px';
    menu.style.left = Math.round(Math.max(8, Math.min(r.left, vw - menu.offsetWidth - 8))) + 'px';
    var recent = document.getElementById('recentMenu');
    if (recent && recent.hidden && Draftly.docs && Draftly.docs.toggleRecent) Draftly.docs.toggleRecent();
    if (focusFirst) { var first = menu.querySelector('.file-item'); if (first) first.focus(); }
  } else {
    var rm = document.getElementById('recentMenu');
    if (rm && !rm.hidden && Draftly.view) Draftly.view.togglePop('recentMenu', 'recentBtn', false);
  }
};

/* Ask for a new name and put it in the name box (hub-title follows via draftly-hub.js). */
Draftly.ribbon.rename = function rename() {
  var cur = Draftly.storage.currentName();
  return Draftly.dialog.prompt({ title: 'Rename document', label: 'Name', value: cur, okLabel: 'Rename' }).then(function (v) {
    if (v === null || v === cur) return false;
    Draftly.storage.setCurrentName(v, false);
    var input = document.getElementById('fileNameInput');
    if (input) { input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); }
    if (Draftly.ui && Draftly.ui.showToast) Draftly.ui.showToast('Renamed to ' + v);
    return true;
  });
};

Draftly.ribbon.init = function init() {
  var tabs = document.querySelectorAll('.ribbon-tab');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener('mousedown', function (e) { e.preventDefault(); });
    tabs[i].addEventListener('click', function (e) {
      Draftly.ribbon.selectTab(e.currentTarget.getAttribute('data-tab'));
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
      Draftly.ribbon.selectTab(list[next].getAttribute('data-tab'), true);
    });
  }
  var saved = 'home';
  try { saved = localStorage.getItem(Draftly.ribbon.storageKeyTab) || 'home'; } catch (e) {}
  Draftly.ribbon.selectTab(saved);

  var fileBtn = document.getElementById('fileBtn');
  var menu = document.getElementById('fileMenu');
  if (!fileBtn || !menu) return;
  fileBtn.addEventListener('mousedown', function (e) { e.preventDefault(); });
  fileBtn.addEventListener('click', function (e) {
    Draftly.ribbon.setFile(!Draftly.ribbon.isFileOpen(), e.detail === 0);
  });
  fileBtn.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); Draftly.ribbon.setFile(true, true); }
  });
  /* Arrow keys move between menu items; Esc closes and returns focus. */
  menu.addEventListener('keydown', function (e) {
    var items = Array.prototype.slice.call(menu.querySelectorAll('.file-item, .recent-item, .recent-del'));
    var idx = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); Draftly.ribbon.setFile(false); fileBtn.focus(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      var n = e.key === 'ArrowDown' ? idx + 1 : idx - 1;
      if (n < 0) n = items.length - 1;
      if (n >= items.length) n = 0;
      if (items[n]) items[n].focus();
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && Draftly.ribbon.isFileOpen()) Draftly.ribbon.setFile(false);
  });
  document.addEventListener('mousedown', function (e) {
    if (!Draftly.ribbon.isFileOpen()) return;
    if (menu.contains(e.target) || fileBtn.contains(e.target)) return;
    Draftly.ribbon.setFile(false);
  });
  /* DF13: hover opens tabs / File menu (shared ../shared/office-hover.js). */
  if (window.OfficeHover) OfficeHover.attach({
    tabsEl: document.querySelector('.ribbon-tab') ? document.querySelector('.ribbon-tab').parentNode : null,
    tabSelector: '.ribbon-tab',
    selectTab: function (id) { Draftly.ribbon.selectTab(id); if (Draftly.ribbon.collapse) Draftly.ribbon.collapse.peek(); },
    fileBtn: fileBtn, fileMenu: menu,
    isFileOpen: Draftly.ribbon.isFileOpen,
    setFile: function (v) { Draftly.ribbon.setFile(v); },
    enabled: function () { var st = Draftly.settings && (Draftly.settings.s || (Draftly.settings.panel && Draftly.settings.panel.s)); return !st || st.hoverTabs !== false; }
  });
  /* DF13c: Word-style collapse (shared ../shared/office-collapse.js); state in settings 'ribbonCollapsed'. */
  var ribEl = document.querySelector('nav.ribbon');
  if (window.OfficeCollapse && ribEl) {
    ribEl.classList.add('of-collapsible');
    var st0 = Draftly.settings && Draftly.settings.s;
    Draftly.ribbon.collapse = OfficeCollapse.attach({
      tabsEl: document.querySelector('.ribbon-tabs'), tabSelector: '.ribbon-tab',
      ribbonEl: ribEl, docEl: document.getElementById('workspace'),
      collapsed: !!(st0 && st0.ribbonCollapsed),
      onUserChange: function (v) { if (Draftly.settings && Draftly.settings.panel) Draftly.settings.set('ribbonCollapsed', v); else Draftly.ribbon.collapse.apply(v); },
      onLayout: function () {
        if (Draftly.pages && Draftly.app && Draftly.app.ready) Draftly.pages.layoutAll();
        if (Draftly.ruler && Draftly.ruler.on && Draftly.ruler.sync) Draftly.ruler.sync();
      }
    });
  }
  /* Any action (not the Recent header) closes the menu after it runs. */
  menu.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('button') : null;
    if (!t || t.id === 'recentBtn') return;
    setTimeout(function () { Draftly.ribbon.setFile(false); }, 0);
  });

  function bind(id, fn) {
    var n = document.getElementById(id);
    if (!n) return;
    n.addEventListener('mousedown', function (e) { e.preventDefault(); });
    n.addEventListener('click', function (e) {
      e.preventDefault();
      try { fn(); } catch (err) { console.warn('draftly: ' + id, err); }
    });
  }
  /* File > Rename: a dialog (standalone and in the hub). The name box itself still edits in place. */
  bind('renameBtn', function () { Draftly.ribbon.rename(); });
  bind('deleteCurrentBtn', function () {
    var name = Draftly.storage.loadedName || Draftly.storage.currentName();
    if (name) Draftly.docs.deleteDoc(name);
  });
};

Draftly.ribbon.init();
