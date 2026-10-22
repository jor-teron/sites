/*
 * Settings → Windows (apps/system/settings/sec_windows.js) — Desktop-mode window options:
 *   'hoverFocus'   Focus window on hover: '1' = on (default off). Pointing at a window for a
 *                  moment brings it to the front (hub/wm/wm_windows.js; never while dragging,
 *                  resizing or with a menu open).
 *   'snapEdges'    Snap windows to screen edges: '0' = off (default on). Dragging a window by its
 *                  title bar to the left / right / top edge snaps it (hub/wm/wm_snap.js); the floating
 *                  on-screen keyboard snaps the same way (hub/osk/osk_drag.js). Ctrl+Alt+arrows always work.
 *   'snapMagnet'   Magnetic edges: '0' = off (default on). A dragged / resized window sticks flush to
 *                  the screen edges and to other windows' edges within 14 px (hub/wm/wm_snap.js; also the
 *                  floating keyboard). Hold Alt or Shift while dragging to skip it once.
 *   'snapMagnetPx' Magnet strength (R14): the distance in px, 10–100 (step 5), default 20; slider
 *                  shown only while Magnetic edges is on. Read by hub/wm/wm_snap.js on every drag (live).
 *   'workspaces'   '1' = one workspace (taskbar switcher hidden, all windows on 1); empty = 2
 *                  (default; hub/wm/wm_workspaces.js).
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
      const magPx = () => { const v = parseFloat(S.get('snapMagnetPx', 20)); return isFinite(v) ? Math.max(10, Math.min(100, Math.round(v / 5) * 5)) : 20; };
      const strength = ui.el('label', 'slider-row');
      const sTxt = ui.el('span', 'switch-text');
      const sVal = ui.el('output', 'slider-val', magPx() + ' px');
      sTxt.append(ui.el('b', '', 'Magnet strength'), ui.el('small', '', 'How close an edge must come before it sticks'));
      const range = ui.el('input', 'slider');
      Object.assign(range, { type: 'range', min: 10, max: 100, step: 5, value: magPx() });
      range.setAttribute('aria-label', 'Magnet strength in pixels');
      range.addEventListener('input', () => {
        sVal.textContent = range.value + ' px';
        S.set('snapMagnetPx', +range.value === 20 ? '' : range.value);
      });
      strength.append(sTxt, range, sVal);
      strength.hidden = S.get('snapMagnet') === '0';
      const magnet = ui.switch('Magnetic edges', 'Windows stick to screen edges and to each other when close; hold Alt or Shift to skip',
        S.get('snapMagnet') !== '0', (on) => { S.set('snapMagnet', on ? '' : '0'); strength.hidden = !on; });
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
      pane.append(ui.title('Focus'), hover, ui.title('Snapping'), snap, magnet, strength, ui.title('Workspaces'), ws, ui.title('Title bar'), title,
        ui.title('Files: open items with'), files, ui.title('Files: thumbnails'), thumbs, clr, clrOut,
        ui.note('Window options work in Desktop mode. Changes show at once. Snap a window by dragging it to a screen edge, or Ctrl+Alt+arrows.'));
    }
  });
})();
