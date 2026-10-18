/*
 * Hub taskbar (hub/wm_taskbar.js) — Desktop mode only (wm_mode.js), bottom of the screen.
 * - Start button (Hub icon + HUB_MENU_LABEL from hub_config.js): opens the CURRENT Hub menu
 *   (same menu as the top-left button, with flyout + sections) just above the taskbar.
 * - One button per open window (HubWM.list()): click = focus / restore, or minimise when it is
 *   already the active window. Active window highlighted, minimised ones dimmed.
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
  bar.append(start, tasks, tray, clock);
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
  start.addEventListener('click', (e) => { e.stopPropagation(); catBtn.click(); });
  new MutationObserver(() => {
    start.setAttribute('aria-expanded', menu.classList.contains('open') ? 'true' : 'false');
  }).observe(menu, { attributes: true, attributeFilter: ['class'] });

  function draw() {
    const act = HubWM.active;
    tasks.replaceChildren(...HubWM.list().map((w) => {
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
