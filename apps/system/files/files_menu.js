/*
 * Files menu + keys (apps/system/files/files_menu.js) — the right-click / long-press menu
 * (shared/ctxmenu) for the selection or for the open folder, and the keyboard:
 *   Enter open · Delete delete · F2 rename · Ctrl/Cmd+C copy · +X cut · +V paste · +A select all
 *   Backspace or Alt+↑ up a folder · Alt+← back · Alt+→ forward (H106) · Esc clear selection · arrows move between items
 * The folder (blank space) menu has Terminal (H121): the Terminal app opened at this folder.
 * H126: "Open in new tab" in both menus (a folder / this folder); tab keys live in files_tabs.js.
 * H108a: forMore(x, y) — phone More menu: Forward + cmd-bar commands (New folder, Upload, Sort,
 *   Grid/List, Refresh) then the usual folder / selection actions (desktop More stays forItems/forFolder).
 * API FX.menu: forItems(x, y), forFolder(x, y), forMore(x, y).
 */
(function () {
  'use strict';
  const { st, $ } = FX;
  const A = () => FX.act;
  const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '\u2318' : 'Ctrl+';

  function forItems(x, y) {
    const sel = FX.selected();
    if (!sel.length) { forFolder(x, y); return; }
    const one = sel.length === 1 ? sel[0] : null;
    const file = one && one.kind === 'file';
    CtxMenu.open(x, y, [
      { label: one && one.kind === 'directory' ? 'Open folder' : 'Open', icon: '\u2197', hint: 'Enter', disabled: !one, action: () => A().open(one) },
      ...(one && one.kind === 'directory' ? [{ label: 'Open in new tab', icon: '\u29C9', action: () => FX.tabs.openFolder(one) }] : []),   // H126
      file ? { label: 'Open with', icon: '\u2726', sub: A().withItems(one) } : { label: 'Open with', icon: '\u2726', disabled: true },
      { sep: true },
      { label: 'Cut', icon: '\u2702', hint: MOD + 'X', action: () => A().clip('cut') },
      { label: 'Copy', icon: '\u2398', hint: MOD + 'C', action: () => A().clip('copy') },
      { label: one && one.kind === 'directory' ? 'Paste into folder' : 'Paste', icon: '\uD83D\uDCCB', hint: MOD + 'V', disabled: !st.clip,
        action: () => A().paste(one && one.kind === 'directory' ? one.handle : null) },
      { sep: true },
      { label: 'Rename', icon: '\u270E', hint: 'F2', disabled: !one, action: () => A().rename(one) },
      { label: 'Download', icon: '\u2B07', disabled: !sel.some((e) => e.kind === 'file'), action: () => A().download(sel) },
      { label: 'Delete', icon: '\uD83D\uDDD1', hint: 'Del', danger: true, action: () => A().remove(sel) },
      { sep: true },
      { label: 'New folder', icon: '\uFF0B', action: () => A().newFolder() },
      { label: 'Properties', icon: '\u2139', action: () => A().props(sel) }
    ]);
  }
  function forFolder(x, y) {
    if (!FX.cur()) return;
    CtxMenu.open(x, y, [
      { label: 'New folder', icon: '\uFF0B', action: () => A().newFolder() },
      { label: 'Upload files\u2026', icon: '\u21EA', action: () => $('file-in').click() },
      { label: 'Open in new tab', icon: '\u29C9', hint: MOD + 'T', action: () => FX.tabs.add({ driveId: st.driveId, driveName: st.driveName, stack: st.stack.slice(), path: st.stack.slice(1).map((s) => s.name).join('/'), view: st.view }) },   // H126: this folder in a new tab
      { label: 'Paste', icon: '\uD83D\uDCCB', hint: MOD + 'V', disabled: !st.clip, action: () => A().paste() },
      { label: 'Terminal', icon: '>_', disabled: !A().terminalOk(), action: () => A().terminal() },   // H121: Terminal at this folder (not on network drives)
      { sep: true },
      { label: 'Select all', icon: '\u2611', hint: MOD + 'A', disabled: !st.shown.length, action: () => FX.view.selectAll() },
      { label: st.view === 'grid' ? 'List view' : 'Grid view', icon: st.view === 'grid' ? '\u2630' : '\u25A6', action: () => FX.view.toggle() },
      { label: 'Refresh', icon: '\u21BB', action: () => FX.view.load() },
      { label: FX.singleClick() ? 'Open with double click' : 'Open with single click', icon: '\uD83D\uDDB1',
        action: () => { FX.setSingleClick(!FX.singleClick()); FX.say(FX.singleClick() ? 'A single click now opens items.' : 'A double click now opens items.'); } },
      { label: FX.thumbs.on() ? 'Hide thumbnails' : 'Show thumbnails', icon: '\uD83D\uDDBC', action: () => FX.thumbs.set(!FX.thumbs.on()) },
      { label: 'Clear thumbnail cache', icon: '\uD83E\uDDF9', action: () => FX.thumbs.clearCache() },
      { sep: true },
      { label: 'Properties', icon: '\u2139', action: () => A().props([]) }
    ]);
  }

  /** Arrow keys: move focus (and selection) between items; grid rows by the column count. */
  function arrow(k, shift) {
    const items = Array.from(document.querySelectorAll('#list .item'));
    if (!items.length) return;
    let i = items.indexOf(document.activeElement);
    if (i < 0) i = 0;
    else {
      let cols = 1;
      if (st.view === 'grid') { const top = items[0].offsetTop; cols = items.filter((x) => x.offsetTop === top).length || 1; }
      const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols, Home: -1e6, End: 1e6 }[k];
      i = Math.max(0, Math.min(items.length - 1, i + d));
    }
    items[i].focus();
    FX.view.pick(items[i].dataset.name, shift ? 'range' : 'one');
  }

  document.addEventListener('keydown', (e) => {
    if (FX.viewer.isOpen() || CtxMenu.isOpen() || document.querySelector('.uid-back')) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key;
    const sel = FX.selected();
    const focusedItem = t && t.classList && t.classList.contains('item') ? FX.view.entryOf(t) : null;
    let used = true;
    if (mod && (k === 'a' || k === 'A')) FX.view.selectAll();
    else if (mod && (k === 'c' || k === 'C')) A().clip('copy');
    else if (mod && (k === 'x' || k === 'X')) A().clip('cut');
    else if (mod && (k === 'v' || k === 'V')) A().paste();
    else if (k === 'Delete') { if (sel.length) A().remove(sel); else used = false; }
    else if (k === 'F2') { if (sel.length === 1) A().rename(sel[0]); else used = false; }
    else if (k === 'Enter') { const e1 = sel.length === 1 ? sel[0] : focusedItem; if (e1) A().open(e1); else used = false; }
    else if (k === 'Backspace' || (e.altKey && k === 'ArrowUp')) FX.drives.up();
    else if (e.altKey && k === 'ArrowLeft') FX.drives.back();      // H106
    else if (e.altKey && k === 'ArrowRight') FX.drives.forward();  // H106
    else if (k === 'Escape') { if (st.sel.size) FX.view.clear(); else used = false; }
    else if (!mod && !e.altKey && ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].indexOf(k) >= 0) arrow(k, e.shiftKey);
    else if (k === 'ContextMenu' || (e.shiftKey && k === 'F10')) {
      const r = (focusedItem && t.getBoundingClientRect()) || $('list').getBoundingClientRect();
      if (sel.length) forItems(r.left + 20, r.top + 20); else forFolder(r.left + 20, r.top + 20);
    } else used = false;
    if (used) e.preventDefault();
  });

  /* H108a: phone More = toolbar commands (cmd-bar is hidden) + Forward, then folder / selection actions. */
  const phone = () => window.matchMedia('(max-width: 639px)').matches;
  const SORTS = [
    ['name-asc', 'Name (A\u2013Z)'], ['name-desc', 'Name (Z\u2013A)'],
    ['size-asc', 'Size (smallest)'], ['size-desc', 'Size (largest)'],
    ['modified-desc', 'Date (newest)'], ['modified-asc', 'Date (oldest)']
  ];
  function sortSub() {
    const cur = $('sort').value;
    return SORTS.map(([v, label]) => ({
      label: label, icon: v === cur ? '\u2713' : '',
      action: () => { $('sort').value = v; $('sort').dispatchEvent(new Event('change', { bubbles: true })); }
    }));
  }
  function toolItems() {
    return [
      { label: 'Forward', icon: '\u2192', hint: 'Alt+\u2192', disabled: !$('fwd') || $('fwd').disabled, action: () => FX.drives.forward() },
      { sep: true },
      { label: 'New folder', icon: '\uFF0B', action: () => A().newFolder() },
      { label: 'Upload files\u2026', icon: '\u21EA', action: () => $('file-in').click() },
      { label: 'Sort', icon: '\u2195', sub: sortSub() },
      { label: 'Grid view', icon: st.view === 'grid' ? '\u2713' : '\u25A6',
        action: () => { const b = $('view').querySelector('[data-v="grid"]'); if (b) b.click(); } },
      { label: 'List view', icon: st.view === 'list' ? '\u2713' : '\u2630',
        action: () => { const b = $('view').querySelector('[data-v="list"]'); if (b) b.click(); } },
      { label: 'Refresh', icon: '\u21BB', action: () => FX.view.load() }
    ];
  }
  function forMore(x, y) {
    if (!phone()) { if (st.sel.size) forItems(x, y); else forFolder(x, y); return; }
    const tools = toolItems();
    const sel = FX.selected();
    if (sel.length) {
      const one = sel.length === 1 ? sel[0] : null;
      const file = one && one.kind === 'file';
      CtxMenu.open(x, y, tools.concat([
        { sep: true },
        { label: one && one.kind === 'directory' ? 'Open folder' : 'Open', icon: '\u2197', hint: 'Enter', disabled: !one, action: () => A().open(one) },
        ...(one && one.kind === 'directory' ? [{ label: 'Open in new tab', icon: '\u29C9', action: () => FX.tabs.openFolder(one) }] : []),
        file ? { label: 'Open with', icon: '\u2726', sub: A().withItems(one) } : { label: 'Open with', icon: '\u2726', disabled: true },
        { sep: true },
        { label: 'Cut', icon: '\u2702', hint: MOD + 'X', action: () => A().clip('cut') },
        { label: 'Copy', icon: '\u2398', hint: MOD + 'C', action: () => A().clip('copy') },
        { label: one && one.kind === 'directory' ? 'Paste into folder' : 'Paste', icon: '\uD83D\uDCCB', hint: MOD + 'V', disabled: !st.clip,
          action: () => A().paste(one && one.kind === 'directory' ? one.handle : null) },
        { sep: true },
        { label: 'Rename', icon: '\u270E', hint: 'F2', disabled: !one, action: () => A().rename(one) },
        { label: 'Download', icon: '\u2B07', disabled: !sel.some((e) => e.kind === 'file'), action: () => A().download(sel) },
        { label: 'Delete', icon: '\uD83D\uDDD1', hint: 'Del', danger: true, action: () => A().remove(sel) },
        { sep: true },
        { label: 'Properties', icon: '\u2139', action: () => A().props(sel) }
      ]));
      return;
    }
    if (!FX.cur()) { CtxMenu.open(x, y, tools); return; }
    CtxMenu.open(x, y, tools.concat([
      { sep: true },
      { label: 'Open in new tab', icon: '\u29C9', hint: MOD + 'T', action: () => FX.tabs.add({ driveId: st.driveId, driveName: st.driveName, stack: st.stack.slice(), path: st.stack.slice(1).map((s) => s.name).join('/'), view: st.view }) },
      { label: 'Paste', icon: '\uD83D\uDCCB', hint: MOD + 'V', disabled: !st.clip, action: () => A().paste() },
      { label: 'Terminal', icon: '>_', disabled: !A().terminalOk(), action: () => A().terminal() },
      { sep: true },
      { label: 'Select all', icon: '\u2611', hint: MOD + 'A', disabled: !st.shown.length, action: () => FX.view.selectAll() },
      { label: FX.singleClick() ? 'Open with double click' : 'Open with single click', icon: '\uD83D\uDDB1',
        action: () => { FX.setSingleClick(!FX.singleClick()); FX.say(FX.singleClick() ? 'A single click now opens items.' : 'A double click now opens items.'); } },
      { label: FX.thumbs.on() ? 'Hide thumbnails' : 'Show thumbnails', icon: '\uD83D\uDDBC', action: () => FX.thumbs.set(!FX.thumbs.on()) },
      { label: 'Clear thumbnail cache', icon: '\uD83E\uDDF9', action: () => FX.thumbs.clearCache() },
      { sep: true },
      { label: 'Properties', icon: '\u2139', action: () => A().props([]) }
    ]));
  }

  FX.menu = { forItems, forFolder, forMore };
})();
