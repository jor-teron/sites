/*
 * H129d Hub mode switch (desktop/mode/hub_osmode.js) — window.HubOsMode, desktop page only.
 * The site root index.html is the mode entry (Desktop / Phone | Touch cards; saved choice in localStorage
 * 'sites-hub.mode' = 'desktop' | 'phone'). This file is the desktop side of switching:
 *   HubOsMode.switchTo('phone')  confirm with the Hub's own dialog (UiDialog) "Switch to Phone | Touch mode?
 *                                Open windows will close.", then save 'phone' and open index.html?os=phone, which
 *                                sends it to the phone page (its MODE_TARGET constant is the one place for that path).
 *   HubOsMode.choose()           confirm, then open index.html?choose (clears the saved choice, shows the cards).
 *   HubOsMode.get() / NAME       the saved mode ('' = none) / display names.
 * Callers: Settings › Desktop › Screen mode (apps/system/settings/sec_desktop.js, through the Hub window) and the
 * desktop right-click menu (desktop/menu/hub_ctx_menus.js). Both resolve false when cancelled.
 * Not the same as Settings › Desktop › Screen mode Phone (HubMode, wm_mode.js): that is phone mode INSIDE the
 * desktop page and stays as it is. No browser confirm(): without UiDialog nothing happens.
 */
(function () {
  'use strict';
  if (window.HubOsMode) return;
  const KEY = 'sites-hub.mode';
  const NAME = { desktop: 'Desktop', phone: 'Phone | Touch' };
  const entry = (q) => new URL('index.html' + q, document.baseURI).href;   // the site root (desktop.html has <base href="../">)
  const get = () => { try { return localStorage.getItem(KEY) || ''; } catch (_) { return ''; } };
  const put = (m) => { try { if (m) localStorage.setItem(KEY, m); else localStorage.removeItem(KEY); } catch (_) { /* blocked */ } };
  async function ask(title, text, ok) {
    const U = window.UiDialog, ui = U && (U.local || U);
    if (!ui || typeof ui.confirm !== 'function') return false;
    try { return !!(await ui.confirm(title, text, ok, false)); } catch (_) { return false; }   // false = a primary (not red) OK button
  }
  async function switchTo(mode) {
    if (!NAME[mode]) return false;
    if (!(await ask('Switch to ' + NAME[mode] + ' mode?', 'Open windows will close.', 'Switch'))) return false;
    put(mode);
    location.assign(entry('?os=' + mode));
    return true;
  }
  async function choose() {
    if (!(await ask('Choose mode?', 'Open windows will close. The Desktop and Phone | Touch cards open, and the one you pick is saved.', 'Choose mode'))) return false;
    location.assign(entry('?choose'));
    return true;
  }
  window.HubOsMode = { KEY, NAME, get, switchTo, choose, url: entry };
})();
