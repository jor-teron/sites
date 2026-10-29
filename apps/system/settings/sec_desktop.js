/*
 * Settings → Desktop (apps/system/settings/sec_desktop.js). Screen mode Auto / Desktop / Phone,
 * R51 'Open windows maximised' (key 'openMax', default on, '0' = off; Hub wm_windows.js reads it on every open),
 *   H60b: default OFF now = Windowed ('1' = on, '0' / unset = off; an older saved '1' / '0' is kept),
 * (key 'wmMode', the Hub's HubMode applies it) and "Open menu on hover" for the Desktop
 * mode Start button (key 'startHover', default on, '0' = off), and the optional taskbar busy
 * meter (key 'trayMeter', '1' = on, default off; hub/drives/hub_traymeter.js), and the
 * clock screen saver idle time (key 'saverIdle', whole minutes 0..240, 0 = Off, unset = 5; Hub R49b HubSaver)
 * and its second hand (key 'saverSec', smooth (default) | quartz | off; Hub R49c HubSaver.secMode).
 * AH1-F1: Home button (key 'homeBtn', '' = Home screen (default) | 'apphub' = App Hub; Hub __hubHome:
 * Phone mode Home button only. H6-B1: the Desktop Show desktop button always just minimises / restores).
 * H7: "Show Files on the desktop" (key 'showFiles', default on, '0' = off; Hub hub_prefs.js + hub_drives.js apply it live).
 * H52: the busy meter switch moved to the new Hub bar section (sec_hubbar.js, same key 'trayMeter'); the Taskbar
 *   heading here now just points there (kept below as comments).
 * H53: a device joined to a Hub (Connect QR / join code) follows the choice too (it used to be forced into Phone);
 *   the note says so, and what Auto does there (Desktop on a big screen, no mouse needed).
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
        /* (before H53)
        note.textContent = h ? 'Now: ' + (h.HubMode.isDesktop() ? 'Desktop' : 'Phone') +
          (h.HubMode.pref === 'auto' ? ' (Auto picks Desktop at ' + h.HubMode.minWidth + ' px wide or more with a mouse)' : '') :
          'Open Settings from the Hub to see the current mode.';
        */
        // H53: a joined device follows the choice too; Auto there needs no mouse
        const joined = !!(h && (h.__hubRemote || h.HubMode.joined));
        note.textContent = h ? 'Now: ' + (h.HubMode.isDesktop() ? 'Desktop' : 'Phone') +
          (h.HubMode.pref === 'auto' ? (joined
            ? ' (Auto on a joined device picks Desktop at ' + h.HubMode.minWidth + ' px wide or more, touch or mouse)'
            : ' (Auto picks Desktop at ' + h.HubMode.minWidth + ' px wide or more with a mouse)') : '') +
          (joined ? '. This device is joined to Hub ' + (h.__hubRemote && h.__hubRemote.code ? h.__hubRemote.code + ' ' : '') +
            'and still follows your choice: Desktop and Phone both keep the remote; Disconnect is in \uD83C\uDFAE Devices on the Hub bar.' :
            '. A device joined to another Hub (Connect QR or join code) follows your choice too.') :
          'Open Settings from the Hub to see the current mode.';
      };
      const mode = ui.choice([
        // { value: 'auto', label: 'Auto', hint: 'Windows on a big screen with a mouse, else Phone' },   // (before H53)
        { value: 'auto', label: 'Auto', hint: 'Windows on a big screen with a mouse (joined device: big screen, touch is fine), else Phone' },   // H53
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
      // const openMax = ui.switch('Open windows maximised', 'New windows fill the screen; Restore gives the normal size',
      //   S.get('openMax') !== '0', (on) => S.set('openMax', on ? '1' : '0'));
      // H60b: Windowed is the default (off unless '1'); new windows step down-right so they don't cover each other
      const openMax = ui.switch('Open windows maximised', 'Off: new windows open in a window, each a little lower and to the right',
        S.get('openMax') === '1', (on) => S.set('openMax', on ? '1' : '0'));
      const hover = ui.switch('Open menu on hover', 'Point at Start to open the menu (Desktop mode)',
        S.get('startHover') !== '0', (on) => S.set('startHover', on ? '' : '0'));
      // H7: the Files icons on the Desktop-mode home screen (default on; off = just the wallpaper and the QR / link tiles)
      const showFiles = ui.switch('Show Files on the desktop', 'Drive icons on the left of the Desktop home screen. Files stays in the Start menu and App Hub',
        S.get('showFiles') !== '0', (on) => S.set('showFiles', on ? '' : '0'));
      /* H52: moved to Settings → Hub bar (sec_hubbar.js)
      const meter = ui.switch('Busy meter in the taskbar', 'A small graph by the clock: how busy the Hub is (an estimate). Click it for System Monitor',
        S.get('trayMeter') === '1', (on) => S.set('trayMeter', on ? '1' : ''));
      */
      const barLink = ui.el('button', 'tap', 'Hub bar icons ›');   // H52
      barLink.type = 'button';
      barLink.id = 'to-hubbar';
      barLink.appendChild(ui.el('small', '', 'Show or hide each taskbar item (Search, Pooh, Update, clock, busy meter…)'));
      barLink.addEventListener('click', () => Settings.open('hubbar'));
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
      // AH1-F1: what the Phone mode Home button does (H6-B1: Phone mode only)
      const home = ui.choice([
        { value: 'home', label: 'Home (current)', hint: 'Phone mode: back to the Home screen' },
        { value: 'apphub', label: 'App Hub', hint: 'Phone mode: opens App Hub' }
      ], S.get('homeBtn') === 'apphub' ? 'apphub' : 'home', (v) => {
        S.set('homeBtn', v === 'apphub' ? 'apphub' : '');
        homeNote.textContent = HOME_NOTE + (v === 'apphub' && !hubHasHome() ? ' ' + HOME_OLD : '');
      });
      home.classList.add('home-btn-pick');
      // H5-B2: Settings is fetched fresh, but the Hub shell may still be the previous build (cached
      // until "Update ready" → Reload). That shell has no __hubHome, so the choice would do nothing: say so.
      const HOME_NOTE = 'Applies to Phone mode only: what the Home button in the top bar does. Pressing it again goes to the real Home screen. Desktop mode is not affected: Show desktop only shows the desktop.';
      const HOME_OLD = 'This Hub window is still running an older build: reload the Hub (Update ready) and the Home button will open App Hub.';
      const hubHasHome = () => { try { return !window.parent || window.parent === window || typeof window.parent.__hubHome === 'function'; } catch (_) { return true; } };
      const homeNote = ui.note(HOME_NOTE + (S.get('homeBtn') === 'apphub' && !hubHasHome() ? ' ' + HOME_OLD : ''));
      // pane.append(ui.title('Screen mode'), mode, note, openMax, ui.title('Home screen'), showFiles, ui.title('Home button (Phone mode)'), home,
      //   homeNote, ui.title('Start menu'), hover, ui.title('Taskbar'), meter,
      //   ui.title('Screen saver'), saver, ui.note('Second hand'), secPick, prev);   // (before H52)
      pane.append(ui.title('Screen mode'), mode, note, openMax, ui.title('Home screen'), showFiles, ui.title('Home button (Phone mode)'), home,
        homeNote, ui.title('Start menu'), hover, ui.title('Taskbar'), barLink,
        ui.title('Screen saver'), saver, ui.note('Second hand'), secPick, prev);   // H52: Taskbar → link to Hub bar
      showNow();
    }
  });
})();
