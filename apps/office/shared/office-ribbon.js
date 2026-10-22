/*
 * apps/office/shared/office-ribbon.js
 * Ribbon behaviour shared by the Office apps (markup / look: office-ribbon.css).
 *   var rb = OfficeRibbon.create({ tabs: [{id, label}], storageKey, tabsEl, fileBtn, fileMenu,
 *                                   panelSelector, onTab(id) });
 *   rb.select(id, focus) · rb.setFile(show) · rb.tabs
 * Tabs are plain data so a host (e.g. the Hub title bar) can render them and call select(id).
 * Tab buttons get id "<prefix>tab-<id>" (prefix default "of-") and control "<prefix>panel-<id>".
 */
var OfficeRibbon = window.OfficeRibbon || {};
window.OfficeRibbon = OfficeRibbon;

OfficeRibbon.create = function (o) {
  var prefix = o.prefix || 'of-';
  var tabs = o.tabs, tabsEl = o.tabsEl, fileBtn = o.fileBtn, menu = o.fileMenu;
  var panelSel = o.panelSelector || '.of-panel';
  var rb = { tabs: tabs };

  rb.select = function (id, focus) {
    var i, t, on, btns = tabsEl.querySelectorAll('.of-tab'), panels = document.querySelectorAll(panelSel);
    if (!tabs.some(function (x) { return x.id === id; })) id = tabs[0].id;
    for (i = 0; i < btns.length; i++) {
      t = btns[i]; on = t.dataset.tab === id;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    }
    for (i = 0; i < panels.length; i++) panels[i].hidden = panels[i].dataset.tab !== id;
    rb.current = id;
    if (o.storageKey) { try { localStorage.setItem(o.storageKey, id); } catch (e) {} }
    if (o.onTab) o.onTab(id);
  };

  rb.setFile = function (show) {
    if (!menu || !fileBtn) return;
    menu.hidden = !show;
    fileBtn.classList.toggle('active', show);
    fileBtn.setAttribute('aria-expanded', show ? 'true' : 'false');
    if (show) {
      var r = fileBtn.getBoundingClientRect();
      menu.style.top = Math.round(r.bottom + 6) + 'px';
      menu.style.left = Math.round(Math.max(6, r.left)) + 'px';
    }
  };

  tabsEl.innerHTML = '';
  tabs.forEach(function (tab) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'of-tab'; b.setAttribute('role', 'tab');
    b.id = prefix + 'tab-' + tab.id; b.dataset.tab = tab.id;
    b.setAttribute('aria-controls', prefix + 'panel-' + tab.id);
    b.textContent = tab.label;
    b.addEventListener('click', function () { rb.setFile(false); rb.select(tab.id); });
    tabsEl.appendChild(b);
  });
  tabsEl.addEventListener('keydown', function (ev) {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    var ids = tabs.map(function (x) { return x.id; }), i = ids.indexOf(ev.target.dataset.tab);
    if (i < 0) return;
    ev.preventDefault(); ev.stopPropagation();
    rb.select(ids[(i + (ev.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length], true);
  });
  var saved = null;
  if (o.storageKey) { try { saved = localStorage.getItem(o.storageKey); } catch (e) {} }
  rb.select(saved || tabs[0].id);

  if (fileBtn && menu) {
    fileBtn.addEventListener('click', function () { rb.setFile(menu.hidden); });
    menu.addEventListener('click', function (ev) { if (ev.target.closest('button, a')) rb.setFile(false); });
    menu.addEventListener('change', function () { rb.setFile(false); });   // file inputs inside the menu
    document.addEventListener('mousedown', function (ev) {
      if (!menu.hidden && !menu.contains(ev.target) && ev.target !== fileBtn) rb.setFile(false);
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !menu.hidden) { rb.setFile(false); fileBtn.focus(); }
    });
    window.addEventListener('resize', function () { rb.setFile(false); });
  }
  return rb;
};
