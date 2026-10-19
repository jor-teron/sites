/*
 * Context menu (shared/ctxmenu/ctxmenu.js + ctxmenu.css) — a small reusable right-click /
 * long-press menu (Files app now, the rest of the Hub later). Big rows, jelly pop, kept on
 * screen, keyboard: ↑ ↓ Home End to move, Enter / Space to run, Esc / Tab / click outside closes.
 *
 * API window.CtxMenu:
 *   open(x, y, items)   items: [{ label, icon?, hint?, disabled?, danger?, action() } | { sep: true }]
 *   close(), isOpen()
 *   longPress(el, fn(e, x, y), ms = 500)   touch / pen hold on el → fn (a moved finger cancels);
 *                                           the click that follows a long press is swallowed
 */
window.CtxMenu = (function () {
  'use strict';
  let menu = null, restore = null;

  function close() {
    if (!menu) return;
    menu.remove();
    menu = null;
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', key, true);
    window.removeEventListener('blur', close);
    window.removeEventListener('resize', close);
    if (restore && restore.focus) { try { restore.focus({ preventScroll: true }); } catch (_) { /* gone */ } }
    restore = null;
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
    if (k === 'ArrowDown') move(1); else if (k === 'ArrowUp') move(-1);
    else if (k === 'Home') move('home'); else if (k === 'End') move('end');
    else if (k === 'Enter' || k === ' ') { if (document.activeElement && menu.contains(document.activeElement)) document.activeElement.click(); }
    else return;
    e.preventDefault(); e.stopPropagation();
  }

  function open(x, y, items) {
    close();
    restore = document.activeElement;
    menu = document.createElement('div');
    menu.className = 'ctx';
    menu.setAttribute('role', 'menu');
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
      if (it.hint) { const h = document.createElement('span'); h.className = 'ctx-hint'; h.textContent = it.hint; b.appendChild(h); }
      b.addEventListener('click', (e) => { e.stopPropagation(); close(); if (it.action) it.action(); });
      menu.appendChild(b);
    });
    // trim leading / trailing / double separators
    Array.from(menu.children).forEach((c, i, a) => {
      if (c.className === 'ctx-sep' && (i === 0 || i === a.length - 1 || (a[i - 1] && a[i - 1].className === 'ctx-sep'))) c.remove();
    });
    document.body.appendChild(menu);
    const w = menu.offsetWidth, h = menu.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    menu.style.left = Math.max(4, Math.min(x, vw - w - 4)) + 'px';
    menu.style.top = Math.max(4, y + h > vh - 4 ? Math.max(4, y - h) : y) + 'px';
    menu.style.transformOrigin = (x + w > vw ? 'right' : 'left') + ' ' + (y + h > vh ? 'bottom' : 'top');
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

  return { open, close, isOpen: () => !!menu, longPress };
})();
