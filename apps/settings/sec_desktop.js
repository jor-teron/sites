/*
 * Settings → Desktop (apps/settings/sec_desktop.js). Screen mode Auto / Desktop / Phone
 * (key 'wmMode', the Hub's HubMode applies it) and "Open menu on hover" for the Desktop
 * mode Start button (key 'startHover', default on, '0' = off), and the optional taskbar busy
 * meter (key 'trayMeter', '1' = on, default off; hub/drives/hub_traymeter.js), and the
 * clock screen saver idle time (key 'saverIdle', '0' Off | '10' | '15' | '30' min; Hub R49 HubSaver).
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
      const meter = ui.switch('Busy meter in the taskbar', 'A small graph by the clock: how busy the Hub is (an estimate). Click it for System Monitor',
        S.get('trayMeter') === '1', (on) => S.set('trayMeter', on ? '1' : ''));
      // Screen saver: the Hub (HubSaver) listens for the storage event; also tell it directly if reachable
      const saverHub = () => {
        for (const w of [window.parent, window.top]) {
          try { if (w && w !== window && w.HubSaver) return w.HubSaver; } catch (_) { /* cross-origin */ }
        }
        return null;
      };
      const saver = ui.choice([
        { value: '0', label: 'Off' }, { value: '10', label: '10 min' },
        { value: '15', label: '15 min' }, { value: '30', label: '30 min' }
      ], S.get('saverIdle', '0'), (v) => {
        S.set('saverIdle', v);
        try { const h = saverHub(); if (h && h.set) h.set(Number(v)); } catch (_) { /* ignore */ }
      });
      saver.classList.add('saver-pick');
      const prev = ui.el('button', 'seg-btn saver-preview', 'Preview');
      prev.type = 'button';
      prev.title = 'Show the clock screen saver now';
      const hs = saverHub();
      if (!hs || !hs.start) prev.hidden = true;
      prev.addEventListener('click', () => { try { const h = saverHub(); if (h && h.start) h.start(); } catch (_) { /* ignore */ } });
      pane.append(ui.title('Screen mode'), mode, note, ui.title('Start menu'), hover, ui.title('Taskbar'), meter,
        ui.title('Screen saver'), saver, prev);
      showNow();
    }
  });
})();
