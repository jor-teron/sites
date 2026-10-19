/*
 * Context menu (shared/ctxmenu/ctxmenu.js + ctxmenu.css) — the one reusable right-click /
 * long-press menu of the site (Files app, the Hub chrome via hub/hub_ctx.js, and every
 * same-origin app inside the Hub via ctx_in_app.js). Big rows, jelly pop, keyboard: ↑ ↓ Home End
 * to move, Enter / Space to run, Esc / Tab / click outside / window blur closes.
 * Placement: opens right / below the point and FLIPS to the left / above near an edge, kept
 * inside CtxMenu.bounds() (default: the viewport; the Hub leaves out its taskbar).
 *
 * API window.CtxMenu:
 *   open(x, y, items, opts?)  items: [{ label, icon?, hint?, disabled?, danger?, action() } | { sep: true }
 *                             | { label, icon?, sub: [items] }] — a sub row ("▸") swaps the menu
 *                             for its items in the same place, with "◂ Back" on top (also ← /
 *                             Backspace; → opens a focused sub row): works the same for touch
 *                             (null / false items are skipped); opts.anchor = a DOMRect to open
 *                             below (or above, when there is no room) instead of at x, y
 *   close(), isOpen()
 *   bounds                    function → {left, top, right, bottom}; replace to keep menus off chrome
 *   longPress(el, fn(e, x, y), ms = 500)   touch / pen hold on el → fn (a moved finger cancels);
 *                                           the click that follows a long press is swallowed
 */
window.CtxMenu = (function () {
  'use strict';
  let menu = null, restore = null, back = null;

  function close() {
    if (!menu) return;
    menu.remove();
    menu = null;
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', key, true);
    window.removeEventListener('blur', close);
    window.removeEventListener('resize', close);
    if (restore && restore.focus) { try { restore.focus({ preventScroll: true }); } catch (_) { /* gone */ } }
    restore = null; back = null;
  }
  function outside(e) { if (menu && !menu.contains(e.target)) close(); }
  const rows = () => (menu ? Array.from(menu.querySelectorAll('.ctx-item:not([disabled])')) : []);
  function move(d) {
    const r = rows(); if (!r.length) return;
    let i = r.indexOf(document.activeElement);
    i = d === 'home' ? 0 : d === 'end' ? r.length - 1 : (i + d + r.length) % r.length;
    r[i].focus();
  }
  function key(e) {
    if (!menu) return;
    const k = e.key;
    if (k === 'Escape' || k === 'Tab') { e.preventDefault(); e.stopPropagation(); close(); return; }
    const a = document.activeElement;
    if ((k === 'ArrowLeft' || k === 'Backspace') && back) { e.preventDefault(); e.stopPropagation(); back(); return; }
    if (k === 'ArrowRight' && a && a.dataset && a.dataset.sub && menu.contains(a)) { e.preventDefault(); e.stopPropagation(); a.click(); return; }
    if (k === 'ArrowDown') move(1); else if (k === 'ArrowUp') move(-1);
    else if (k === 'Home') move('home'); else if (k === 'End') move('end');
    else if (k === 'Enter' || k === ' ') { if (document.activeElement && menu.contains(document.activeElement)) document.activeElement.click(); }
    else return;
    e.preventDefault(); e.stopPropagation();
  }

  function open(x, y, items, opts) {
    const keep = opts && opts._restore;
    close();
    restore = keep || document.activeElement;
    back = opts && opts._back ? opts._back : null;
    if (back) items = [{ label: 'Back', icon: '\u25C2', action: back }, { sep: true }].concat(items);
    menu = document.createElement('div');
    menu.className = 'ctx';
    menu.setAttribute('role', 'menu');
    const items0 = opts && opts._back ? items.slice(2) : items;
    items.forEach((it) => {
      if (!it) return;
      if (it.sep) { const s = document.createElement('div'); s.className = 'ctx-sep'; s.setAttribute('role', 'separator'); menu.appendChild(s); return; }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ctx-item' + (it.danger ? ' danger' : '');
      b.setAttribute('role', 'menuitem');
      if (it.disabled) b.disabled = true;
      const ic = document.createElement('span'); ic.className = 'ctx-ico'; ic.textContent = it.icon || '';
      const l = document.createElement('span'); l.className = 'ctx-label'; l.textContent = it.label;
      b.append(ic, l);
      const hint = it.sub ? '\u25B8' : it.hint;
      if (hint) { const h = document.createElement('span'); h.className = 'ctx-hint'; h.textContent = hint; b.appendChild(h); }
      if (it.sub) {
        b.dataset.sub = '1';
        b.setAttribute('aria-haspopup', 'menu');
        const r0 = restore;
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          const reopen = () => open(x, y, items0, Object.assign({}, opts, { _restore: r0 }));
          open(x, y, it.sub, Object.assign({}, opts, { _back: reopen, _restore: r0 }));
        });
      } else b.addEventListener('click', (e) => { e.stopPropagation(); close(); if (it.action) it.action(); });
      menu.appendChild(b);
    });
    // trim leading / trailing / double separators
    Array.from(menu.children).forEach((c, i, a) => {
      if (c.className === 'ctx-sep' && (i === 0 || i === a.length - 1 || (a[i - 1] && a[i - 1].className === 'ctx-sep'))) c.remove();
    });
    document.body.appendChild(menu);
    const w = menu.offsetWidth, h = menu.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    let b = null;
    try { b = api.bounds && api.bounds(); } catch (_) { b = null; }
    if (!b) b = { left: 0, top: 0, right: vw, bottom: vh };
    const a = opts && opts.anchor;
    let left, top, flipX = false, flipY = false;
    if (a) {
      // beside an element (e.g. a taskbar button): below it, else above it; the whole viewport
      left = a.left;
      if (left + w > vw - 4) { left = a.right - w; flipX = true; }
      if (a.bottom + 4 + h <= vh - 4) top = a.bottom + 4;
      else { top = a.top - 4 - h; flipY = true; }
      left = Math.max(4, Math.min(left, vw - w - 4));
      top = Math.max(4, Math.min(top, vh - h - 4));
    } else {
      const L = b.left + 4, T = b.top + 4, R = b.right - 4, B = b.bottom - 4;
      left = x; top = y;
      if (left + w > R) { left = x - w; flipX = true; }      // flip near the right edge
      if (top + h > B) { top = y - h; flipY = true; }        // flip near the bottom (or the taskbar)
      left = Math.max(L, Math.min(left, R - w));
      top = Math.max(T, Math.min(top, B - h));
      if (top < 4) top = 4;
    }
    menu.style.left = Math.round(left) + 'px';
    menu.style.top = Math.round(top) + 'px';
    menu.style.transformOrigin = (flipX ? 'right' : 'left') + ' ' + (flipY ? 'bottom' : 'top');
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    const first = rows()[0];
    if (first) first.focus({ preventScroll: true });
  }

  function longPress(el, fn, ms) {
    ms = ms || 500;
    let t = 0, sx = 0, sy = 0, fired = false;
    const clear = () => { clearTimeout(t); t = 0; };
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      fired = false; sx = e.clientX; sy = e.clientY;
      clear();
      t = setTimeout(() => { fired = true; t = 0; fn(e, sx, sy); }, ms);
    });
    el.addEventListener('pointermove', (e) => { if (t && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) clear(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => el.addEventListener(n, clear));
    el.addEventListener('click', (e) => { if (fired) { fired = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    el.addEventListener('contextmenu', (e) => { if (fired || t) e.preventDefault(); });
  }

  const api = { open, close, isOpen: () => !!menu, longPress, bounds: null };
  return api;
})();
