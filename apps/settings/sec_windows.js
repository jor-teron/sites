/*
 * Settings → Windows (apps/settings/sec_windows.js) — Desktop-mode window options:
 *   'hoverFocus'   Focus window on hover: '1' = on (default off). Pointing at a window for a
 *                  moment brings it to the front (hub/wm_windows.js; never while dragging,
 *                  resizing or with a menu open).
 *   'snapEdges'    Snap windows to screen edges: '0' = off (default on). Dragging a window by its
 *                  title bar to the left / right / top edge snaps it (hub/wm_snap.js); the floating
 *                  on-screen keyboard snaps the same way (hub/osk/osk_drag.js). Ctrl+Alt+arrows always work.
 *   'workspaces'   '1' = one workspace (taskbar switcher hidden, all windows on 1); empty = 2
 *                  (default; hub/wm_workspaces.js).
 *   'titleH'       window title bar Slim 24 / Normal 28 / Large 34 px (moved here from Sizes,
 *                  same key, so saved choices stay).
 *   'filesClick'   Files app: open items with a 'single' click or a double click (default).
 *   'filesThumbs'  Files app: '0' = icons only (default: picture / video thumbnails, R12b).
 *                  "Clear thumbnail cache" empties shared/fs/thumbs_store.js (IndexedDB).
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
      const snap = ui.switch('Snap windows to screen edges', 'Drag a window to the left / right edge for half the screen, to the top to maximise',
        S.get('snapEdges') !== '0', (on) => S.set('snapEdges', on ? '' : '0'));
      const ws = ui.choice([
        { value: 1, label: '1', hint: 'One desktop' },
        { value: 2, label: '2', hint: 'Switch with 1 2 on the taskbar' }
      ], S.get('workspaces') === '1' ? 1 : 2, (v) => S.set('workspaces', v === 2 ? '' : '1'));
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
      const thumbs = ui.switch('Show thumbnails', 'Pictures and videos show a small preview instead of an icon',
        S.get('filesThumbs') !== '0', (on) => S.set('filesThumbs', on ? '' : '0'));
      const clr = ui.el('button', 'big-btn', 'Clear thumbnail cache');
      clr.type = 'button';
      const clrOut = ui.el('p', 'opt-note', '');
      clrOut.setAttribute('aria-live', 'polite');
      const sizeText = (b) => (b < 1048576 ? Math.round(b / 1024) + ' KB' : (b / 1048576).toFixed(1) + ' MB');
      const showSize = (pre) => { if (window.ThumbStore) ThumbStore.stats().then((x) => { clrOut.textContent = (pre || '') + x.count + ' saved, ' + sizeText(x.bytes) + ' (up to ' + sizeText(ThumbStore.CAP) + ')'; }); };
      clr.addEventListener('click', () => { if (window.ThumbStore) ThumbStore.clear().then(() => showSize('Cleared. '), () => { clrOut.textContent = 'Could not clear it'; }); });
      showSize();
      pane.append(ui.title('Focus'), hover, ui.title('Snapping'), snap, ui.title('Workspaces'), ws, ui.title('Title bar'), title,
        ui.title('Files: open items with'), files, ui.title('Files: thumbnails'), thumbs, clr, clrOut,
        ui.note('Window options work in Desktop mode. Changes show at once. Snap a window by dragging it to a screen edge, or Ctrl+Alt+arrows.'));
    }
  });
})();
