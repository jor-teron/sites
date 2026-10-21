/*
 * Settings → Desktop (apps/settings/sec_desktop.js). Screen mode Auto / Desktop / Phone,
 * R51 'Open windows maximised' (key 'openMax', default on, '0' = off; Hub wm_windows.js reads it on every open),
 * (key 'wmMode', the Hub's HubMode applies it) and "Open menu on hover" for the Desktop
 * mode Start button (key 'startHover', default on, '0' = off), and the optional taskbar busy
 * meter (key 'trayMeter', '1' = on, default off; hub/drives/hub_traymeter.js), and the
 * clock screen saver idle time (key 'saverIdle', whole minutes 0..240, 0 = Off, unset = 5; Hub R49b HubSaver)
 * and its second hand (key 'saverSec', smooth (default) | quartz | off; Hub R49c HubSaver.secMode).
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
      // R51: new Desktop-mode windows open maximised (default on)
      const openMax = ui.switch('Open windows maximised', 'New windows fill the screen; Restore gives the normal size',
        S.get('openMax') !== '0', (on) => S.set('openMax', on ? '1' : '0'));
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
      // R49b: minutes as a number (0 = Off, 1..240, unset / invalid = 5), same rules as hub_saver.js
      const SAVER_DEF = 5, SAVER_MAX = 240;
      const saverNorm = (v) => {
        const s = String(v == null ? '' : v).trim();
        if (!/^-?\d+$/.test(s)) return SAVER_DEF;
        const n = parseInt(s, 10);
        return n < 0 ? SAVER_DEF : Math.min(n, SAVER_MAX);
      };
      const saver = ui.el('label', 'saver-pick saver-min');
      const saverIn = ui.el('input');
      Object.assign(saverIn, { type: 'number', min: 0, max: SAVER_MAX, step: 1, inputMode: 'numeric' });
      saverIn.setAttribute('aria-label', 'Screen saver after (minutes)');
      saverIn.value = saverNorm(S.get('saverIdle', ''));
      saver.append(saverIn, ui.el('span', '', 'minutes'), ui.el('small', 'opt-note', '0 = Off (1\u2013240)'));
      const saveSaver = () => {
        const n = saverNorm(saverIn.value);
        saverIn.value = n;
        S.set('saverIdle', String(n));
        try { const h = saverHub(); if (h && h.set) h.set(n); } catch (_) { /* ignore */ }
      };
      saverIn.addEventListener('change', saveSaver);
      saverIn.addEventListener('blur', saveSaver);
      // R49c: second hand Smooth / Quartz / Off
      const SEC = ['smooth', 'quartz', 'off'];
      const secNow = S.get('saverSec', 'smooth');
      const secPick = ui.choice([
        { value: 'smooth', label: 'Smooth' }, { value: 'quartz', label: 'Quartz' }, { value: 'off', label: 'Off' }
      ], SEC.indexOf(secNow) >= 0 ? secNow : 'smooth', (v) => {
        S.set('saverSec', v);
        try { const h = saverHub(); if (h && h.secMode) h.secMode(v); } catch (_) { /* ignore */ }
      });
      secPick.classList.add('saver-sec');
      const prev = ui.el('button', 'seg-btn saver-preview', 'Preview');
      prev.type = 'button';
      prev.title = 'Show the clock screen saver now';
      const hs = saverHub();
      if (!hs || !hs.start) prev.hidden = true;
      prev.addEventListener('click', () => { try { const h = saverHub(); if (h && h.start) h.start(); } catch (_) { /* ignore */ } });
      pane.append(ui.title('Screen mode'), mode, note, openMax, ui.title('Start menu'), hover, ui.title('Taskbar'), meter,
        ui.title('Screen saver'), saver, ui.note('Second hand'), secPick, prev);
      showNow();
    }
  });
})();
