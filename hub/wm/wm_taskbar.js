/*
 * Hub taskbar (hub/wm/wm_taskbar.js) — Desktop mode only (wm_mode.js), bottom of the screen
 * (or the top: Settings → Sizes, html.hub-task-top in wm.css; menus then open downward).
 * - Start button (Hub icon + HUB_MENU_LABEL from hub_config.js): opens the CURRENT Hub menu
 *   (same menu as the top-left button, with flyout + sections) just above the taskbar.
 *   Hover-to-open (mouse only; Hub settings switch, localStorage 'sites-hub.startHover',
 *   default on): opens ~150 ms after pointing at Start, stays open while the pointer is over
 *   Start / menu / flyout, closes ~300 ms after leaving them. A click still toggles; a click
 *   right after a hover-open keeps it open (pinned, closes like a clicked menu).
 * - Show Desktop button right after Start: click = minimise every window (remembers which were
 *   open), click again = bring exactly those back (focus as before). Opening / restoring any
 *   window in between forgets the list (like any OS).
 * - Workspace switcher "1" "2" right after Show Desktop: wm_workspaces.js. Show Desktop and
 *   the window buttons cover the current workspace only.
 * - One button per open window of the current workspace (HubWM.list() + HubWM.onWs): click = focus / restore, or minimise when it is
 *   already the active window. Active window highlighted, minimised ones dimmed.
 *   Right-click / long-press = menu: New window (another instance), Move to workspace 1 / 2,
 *   Minimise / Restore, Close.
 *   Middle-click = New window.
 * - Right-click menus (shared look, hub_ctx.js; they open above the bar, or below it when the
 *   taskbar is at the top): Start → Settings, Files, About; empty bar → Show desktop,
 *   Taskbar at top / bottom, Settings; app button → the menu above.
 * - Tray on the right: the old top bar's right side (.header-right: Pooh Chat, the
 *   Devices / SharedLink button with its device count, version) is MOVED here in Desktop
 *   mode and moved back to the top bar in Phone mode (same elements, so their own scripts
 *   keep working; their popovers open upward, see wm.css).
 * - Clock: 12-hour with AM/PM (11:56 PM), date in the tooltip.
 * Redraws on 'hub-wm-change' (wm_windows.js). Look in wm.css.
 */
(function () {
  'use strict';
  const catBtn = document.getElementById('cat-btn');
  const menu = document.getElementById('menu');
  if (!catBtn || !menu || !window.HubWM) return;

  const bar = document.createElement('nav');
  bar.id = 'wm-taskbar';
  bar.setAttribute('aria-label', 'Taskbar');

  const start = document.createElement('button');
  start.type = 'button';
  start.id = 'wm-start';
  start.setAttribute('aria-haspopup', 'true');
  start.setAttribute('aria-expanded', 'false');
  const logo = document.createElement('img');
  logo.className = 'wm-start-logo'; logo.alt = ''; logo.src = 'shared/image/hub_icon_192.png';
  const label = document.createElement('span');
  label.textContent = window.HUB_MENU_LABEL || 'Home';
  start.append(logo, label);

  const tasks = document.createElement('div');
  tasks.className = 'wm-tasks';
  const tray = document.createElement('div');
  tray.className = 'wm-tray';
  const clock = document.createElement('time');
  clock.className = 'wm-clock';
  const showDesk = document.createElement('button');
  showDesk.type = 'button';
  showDesk.id = 'wm-showdesk';
  showDesk.title = 'Show desktop';
  showDesk.setAttribute('aria-label', 'Show desktop');
  showDesk.setAttribute('aria-pressed', 'false');
  showDesk.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>';
  bar.append(start, showDesk, tasks, tray, clock);
  document.body.appendChild(bar);

  // Old top bar items ↔ tray
  const header = document.getElementById('header');
  const right = header && header.querySelector('.header-right');
  function placeTray() {
    if (!right) return;
    const desk = !!(window.HubMode && window.HubMode.isDesktop());
    if (desk && right.parentNode !== tray) tray.appendChild(right);
    else if (!desk && right.parentNode !== header) header.appendChild(right);
  }
  placeTray();
  window.addEventListener('hub-wm-mode', placeTray);

  // Start = the Hub menu button (hub.js toggles the menu; the outside-click check skips #wm-start)
  const HOVER_KEY = 'sites-hub.startHover';
  const OPEN_MS = 150, CLOSE_MS = 300, PIN_MS = 600;
  const hoverOn = () => { try { return localStorage.getItem(HOVER_KEY) !== '0'; } catch (_) { return true; } };
  const isOpen = () => menu.classList.contains('open');
  let openT = 0, closeT = 0, hoverOpened = false, hoverAt = 0;

  start.addEventListener('click', (e) => {
    e.stopPropagation();
    clearTimeout(openT); clearTimeout(closeT);
    if (isOpen() && hoverOpened) {
      hoverOpened = false;                              // pin it
      if (Date.now() - hoverAt < PIN_MS) return;        // the click that "opens" a hover-opened menu
    }
    catBtn.click();
  });

  /** Pointer inside Start, the menu or its flyout? */
  const inside = (t) => !!(t && t.closest && (t.closest('#wm-start') || t.closest('#menu') || t.closest('#menu-fly')));
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse' || !window.HubMode || !window.HubMode.isDesktop() || !hoverOn()) return;
    const t = e.target;
    if (inside(t)) {
      clearTimeout(closeT);
      if (!isOpen() && t.closest('#wm-start')) {
        clearTimeout(openT);
        openT = setTimeout(() => {
          if (isOpen()) return;
          catBtn.click();
          hoverOpened = isOpen();
          hoverAt = Date.now();
        }, OPEN_MS);
      }
      return;
    }
    clearTimeout(openT);
    if (isOpen() && hoverOpened) {
      clearTimeout(closeT);
      closeT = setTimeout(() => { if (isOpen() && hoverOpened) catBtn.click(); }, CLOSE_MS);
    }
  }, true);
  // Pointer left the window entirely
  document.documentElement.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(openT);
    if (isOpen() && hoverOpened) { clearTimeout(closeT); closeT = setTimeout(() => { if (isOpen() && hoverOpened) catBtn.click(); }, CLOSE_MS); }
  });
  new MutationObserver(() => {
    const open = menu.classList.contains('open');
    start.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (!open) { hoverOpened = false; clearTimeout(closeT); }
  }).observe(menu, { attributes: true, attributeFilter: ['class'] });

  // Show Desktop: minimise all ↔ restore those windows
  let shown = null;   // { wins: [windows that were visible, by z], active } while the desktop is shown
  function setShown(v) { shown = v; showDesk.classList.toggle('on', !!v); showDesk.setAttribute('aria-pressed', v ? 'true' : 'false'); }
  showDesk.addEventListener('click', () => {
    if (window.CtxMenu) CtxMenu.close();
    if (menu.classList.contains('open')) catBtn.click();
    const all = HubWM.list();
    if (shown) {
      const back = shown.wins.filter((w) => all.indexOf(w) >= 0), act = shown.active;
      setShown(null);
      back.forEach((w) => HubWM.focus(w, true));
      if (act && back.indexOf(act) >= 0) HubWM.focus(act); else if (back.length) HubWM.focus(back[back.length - 1]);
      return;
    }
    const vis = all.filter((w) => !w.min && HubWM.onWs(w)).sort((a, b) => +a.el.style.zIndex - +b.el.style.zIndex);
    // AH1-F1: Home button = App Hub (Settings → Desktop): show the desktop, then App Hub on it
    const appHub = !!(window.__hubHomeAppHub && window.__hubHomeAppHub() && window.__hubHome);
    if (!vis.length) { if (appHub) window.__hubHome(); return; }
    const act = HubWM.active;
    HubWM.minimiseAll();
    setShown({ wins: vis, active: act });
    if (appHub) window.__hubHome();
  });
  window.addEventListener('hub-wm-change', () => { if (shown && HubWM.list().some((w) => !w.min && HubWM.onWs(w))) setShown(null); });
  window.addEventListener('hub-wm-ws', () => { if (shown) setShown(null); });

  // Right-click menus (hub_ctx.js + shared/ctxmenu): anchored to the bar, above it (bottom) / below it (top)
  const taskOf = new WeakMap();   // task button → window
  function newWindow(w) {
    HubWM.open({ key: w.key, name: w.baseName || w.name, icon: w.icon, url: w.url, app: w.app, newInstance: true });
  }
  /** Anchor a menu to el's column, just outside the bar (above it, or below it at the top). */
  const at = (list, el) => {
    const r = el.getBoundingClientRect(), br = bar.getBoundingClientRect();
    list.opts = { anchor: { left: r.left, right: r.right, top: br.top, bottom: br.bottom } };
    return list;
  };
  const C = window.HubCtx;
  if (C) {
    C.add('.wm-task', (b) => {
      const w = taskOf.get(b);
      if (!w) return null;
      return at([
        { label: 'New window', icon: '\u29C9', action: () => newWindow(w) },
        ...HubWM.wsItems(w),
        { label: w.min ? 'Restore' : 'Minimise', icon: w.min ? '\u2750' : '\u2013', action: () => (w.min ? HubWM.focus(w) : HubWM.minimise(w)) },
        { sep: true },
        { label: 'Close', icon: '\u00D7', danger: true, action: () => HubWM.close(w) }
      ], b);
    }, { touch: true });
    C.add('#wm-start', (b) => at([
      { label: 'Settings', icon: '\u2699', action: () => C.openApp(C.SETTINGS) },
      { label: 'Files', icon: '\uD83D\uDCC2', action: () => C.openApp(C.FILES) },
      { sep: true },
      { label: 'About', icon: '\u2139', action: () => C.openApp(C.SETTINGS, { hash: 'about' }) }
    ], b), { touch: true });
    C.add('#wm-taskbar', (b, e) => {
      if (e.target.closest && e.target.closest('.header-right button, .header-right a, .wm-tray input')) return null;
      const top = document.documentElement.classList.contains('hub-task-top');
      const shown = showDesk.getAttribute('aria-pressed') === 'true';
      const list = [
        { label: shown ? 'Restore windows' : 'Show desktop', icon: '\uD83D\uDDA5', disabled: !HubWM.list().some(HubWM.onWs), action: () => showDesk.click() },
        { label: top ? 'Taskbar at the bottom' : 'Taskbar at the top', icon: top ? '\u2193' : '\u2191', action: () => {
          try { if (top) localStorage.removeItem('sites-hub.taskPos'); else localStorage.setItem('sites-hub.taskPos', 'top'); } catch (_) { return; }
          if (window.HubPrefs) HubPrefs.apply();
        } },
        { sep: true },
        { label: 'Settings', icon: '\u2699', action: () => C.openApp(C.SETTINGS) }
      ];
      const br = bar.getBoundingClientRect();
      list.opts = { anchor: { left: e.clientX, right: e.clientX, top: br.top, bottom: br.bottom } };
      return list;
    }, { touch: true });
  }

  function draw() {
    const act = HubWM.active;
    tasks.replaceChildren(...HubWM.list().filter(HubWM.onWs).map((w) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'wm-task' + (w === act ? ' active' : '') + (w.min ? ' min' : '');
      b.title = w.name;
      b.setAttribute('aria-pressed', w === act ? 'true' : 'false');
      const img = document.createElement('img');
      img.alt = ''; img.src = w.icon || '';
      img.addEventListener('error', () => img.classList.add('missing'));
      const n = document.createElement('span');
      n.textContent = w.name;
      b.append(img, n);
      b.addEventListener('click', () => {
        if (w === HubWM.active && !w.min) HubWM.minimise(w);
        else HubWM.focus(w);
      });
      taskOf.set(b, w);
      b.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
      b.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); newWindow(w); } });
      return b;
    }));
  }
  window.addEventListener('hub-wm-change', draw);

  function tick() {
    const d = new Date();
    clock.textContent = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    clock.title = d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    clock.dateTime = d.toISOString();
  }
  tick();
  setInterval(tick, 10000);
  draw();
})();
