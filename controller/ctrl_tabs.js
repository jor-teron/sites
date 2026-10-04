/*
 * Gamepad Controller — pages + the Keyboard & Mouse 3-way switch.
 * Pages come from CONTROLLER_CONFIG.tabs: 🎮 Gamepad → ⌨️ Keyboard & Mouse → 📤 Send Files.
 * There is no tab bar: the compact round mode button (#mode-btn, controller_logic.js) cycles
 * the pages in that order (tap = next, swipe = previous / next, hold = menu) and shows the
 * icon of the NEXT page. A page shows one controller mode (CONTROLLER_CONFIG.modes);
 * Keyboard & Mouse shows the mode picked on its switch (PC Keys / Trackpad / Phone Keys,
 * remembered in storage.kmMode). The last page is remembered through the last mode
 * (storage.mode, controller_logic.js).
 * A small ⋯ button next to the mode button opens the existing menu (modes, fullscreen,
 * light / dark, diagnostics).
 * controller_logic.js calls CTRL_TABS.init(app) once, CTRL_TABS.render(modeId, paired)
 * whenever the view changes and CTRL_TABS.step(dir) from the mode button. Switching modes
 * still goes through app.setMode, so every held button / key is released exactly as before.
 */
(function () {
  'use strict';

  const CFG = CONTROLLER_CONFIG;
  const TXT = CFG.text;
  const TABS = CFG.tabs || [];
  const SW = CFG.kmSwitch || [];
  let app = null;
  let more = null;
  let sw = null;

  function load(key, fb) { try { const v = localStorage.getItem(key); return v == null ? fb : v; } catch (_) { return fb; } }
  function save(key, v) { try { localStorage.setItem(key, String(v)); } catch (_) { /* ignore */ } }

  function tabOf(modeId) { return TABS.find((t) => t.modes.indexOf(modeId) >= 0) || TABS[0]; }
  function kmTab() { return TABS.find((t) => t.id === 'km'); }
  function kmMode() {
    const km = kmTab();
    const m = load(CFG.storage.kmMode, CFG.defaultKmMode);
    return km && km.modes.indexOf(m) >= 0 ? m : (CFG.defaultKmMode || (km && km.modes[0]));
  }

  /** Tap = pointerup on the same element (the pages block click via touchstart). */
  function onTap(el, fn) {
    let id = null;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      id = e.pointerId;
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      el.classList.add('active');
    });
    el.addEventListener('pointerup', (e) => {
      if (e.pointerId !== id) return;
      id = null;
      el.classList.remove('active');
      const r = el.getBoundingClientRect();
      if (e.clientX >= r.left - 8 && e.clientX <= r.right + 8 && e.clientY >= r.top - 8 && e.clientY <= r.bottom + 8) fn();
    });
    el.addEventListener('pointercancel', () => { id = null; el.classList.remove('active'); });
    el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  }

  function pickTab(t) {
    const cur = app.getMode();
    if (t.modes.indexOf(cur) >= 0) return;
    const target = t.id === 'km' ? kmMode() : t.modes[0];
    app.setMode(target);
  }

  /** Page after (dir 1) / before (dir -1) the page of modeId, wrapping around. */
  function tabAfter(modeId, dir) {
    const i = Math.max(0, TABS.indexOf(tabOf(modeId)));
    return TABS[(i + (dir || 1) + TABS.length) % TABS.length];
  }

  /** Mode button: go to the next / previous page. */
  function step(dir) {
    if (TABS.length) pickTab(tabAfter(app.getMode(), dir));
  }

  function pickKm(mode) {
    save(CFG.storage.kmMode, mode);
    if (app.getMode() !== mode) app.setMode(mode);
  }

  function build() {
    more = document.createElement('button');
    more.type = 'button';
    more.id = 'ctrl-more';
    more.textContent = '⋯';
    more.title = TXT.tabsMenu;
    more.setAttribute('aria-label', TXT.tabsMenu);
    more.hidden = true;
    onTap(more, () => app.openMenu());
    document.body.appendChild(more);

    sw = document.createElement('div');
    sw.id = 'km-switch';
    sw.setAttribute('role', 'radiogroup');
    sw.setAttribute('aria-label', 'Keyboard & Mouse');
    for (const o of SW) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'km-opt';
      b.dataset.mode = o.mode;
      b.textContent = o.label;
      b.setAttribute('role', 'radio');
      onTap(b, () => pickKm(o.mode));
      sw.appendChild(b);
    }
    const kbBar = document.getElementById('kb-bar');
    const led = document.getElementById('kb-led');
    if (kbBar) kbBar.insertBefore(sw, led ? led.nextSibling : kbBar.firstChild);
  }

  function render(modeId, paired) {
    if (!more) return;
    more.hidden = !paired;
    const t = tabOf(modeId);
    const inKm = t.id === 'km';
    sw.hidden = !inKm;
    document.body.classList.toggle('tab-km', inKm);
    if (inKm) {
      save(CFG.storage.kmMode, modeId);
      sw.querySelectorAll('[data-mode]').forEach((b) => {
        const on = b.dataset.mode === modeId;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
    }
  }

  window.CTRL_TABS = {
    init(a) { app = a; if (TABS.length) build(); },
    render: render,
    step: step,
    tabOf: tabOf,
    nextTab: (modeId) => tabAfter(modeId, 1),
    kmMode: kmMode,
  };
})();
