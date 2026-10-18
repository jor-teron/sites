/*
 * Settings → Desktop (apps/settings/sec_desktop.js). Screen mode Auto / Desktop / Phone
 * (key 'wmMode', the Hub's HubMode applies it) and "Open menu on hover" for the Desktop
 * mode Start button (key 'startHover', default on, '0' = off).
 */
(function () {
  'use strict';
  const S = window.SettingsStore, ui = window.Settings.ui;
  Settings.add({
    id: 'desktop', title: 'Desktop', icon: '\uD83D\uDDA5\uFE0F',
    render(pane) {
      const note = ui.note('');
      const showNow = () => {
        const h = S.hub();
        note.textContent = h ? 'Now: ' + (h.HubMode.isDesktop() ? 'Desktop' : 'Phone') +
          (h.HubMode.pref === 'auto' ? ' (Auto picks Desktop at ' + h.HubMode.minWidth + ' px wide or more with a mouse)' : '') :
          'Open Settings from the Hub to see the current mode.';
      };
      const mode = ui.choice([
        { value: 'auto', label: 'Auto', hint: 'Windows on a big screen with a mouse, else Phone' },
        { value: 'desktop', label: 'Desktop', hint: 'Apps open in windows with a taskbar' },
        { value: 'phone', label: 'Phone', hint: 'One app at a time, full screen' }
      ], S.get('wmMode', 'auto'), (v) => {
        const h = S.hub();
        if (h) h.HubMode.setPref(v);           // instant (also saves the key)
        else S.set('wmMode', v === 'auto' ? '' : v);
        setTimeout(showNow, 50);
      });
      mode.classList.add('seg-col');
      const hover = ui.switch('Open menu on hover', 'Point at Start to open the menu (Desktop mode)',
        S.get('startHover') !== '0', (on) => S.set('startHover', on ? '' : '0'));
      pane.append(ui.title('Screen mode'), mode, note, ui.title('Start menu'), hover);
      showNow();
    }
  });
})();
