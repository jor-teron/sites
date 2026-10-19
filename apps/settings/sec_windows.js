/*
 * Settings → Windows (apps/settings/sec_windows.js) — Desktop-mode window options:
 *   'hoverFocus'   Focus window on hover: '1' = on (default off). Pointing at a window for a
 *                  moment brings it to the front (hub/wm_windows.js; never while dragging,
 *                  resizing or with a menu open).
 *   'titleH'       window title bar Slim 24 / Normal 28 / Large 34 px (moved here from Sizes,
 *                  same key, so saved choices stay).
 *   'filesClick'   Files app: open items with a 'single' click or a double click (default).
 * All keys 'sites-hub.<key>' (settings_store.js); the Hub and Files apply them at once.
 */
(function () {
  'use strict';
  const S = window.SettingsStore, ui = window.Settings.ui;
  Settings.add({
    id: 'windows', title: 'Windows', icon: '\uD83E\uDE9F',
    render(pane) {
      const hover = ui.switch('Focus window on hover', 'Point at a window for a moment to bring it to the front',
        S.get('hoverFocus') === '1', (on) => S.set('hoverFocus', on ? '1' : ''));
      const title = ui.choice([
        { value: 24, label: 'Slim', hint: '24 px' },
        { value: 28, label: 'Normal', hint: '28 px' },
        { value: 34, label: 'Large', hint: '34 px' }
      ], +S.get('titleH', 28), (v) => S.set('titleH', v === 28 ? '' : v));
      const files = ui.choice([
        { value: 'double', label: 'Double click', hint: 'Click selects, double-click opens' },
        { value: 'single', label: 'Single click', hint: 'Click opens; Ctrl / Shift / the round check select' }
      ], S.get('filesClick', 'double'), (v) => S.set('filesClick', v === 'double' ? '' : v));
      files.classList.add('seg-col');
      pane.append(ui.title('Focus'), hover, ui.title('Title bar'), title,
        ui.title('Files: open items with'), files,
        ui.note('Window options work in Desktop mode. Changes show at once.'));
    }
  });
})();
