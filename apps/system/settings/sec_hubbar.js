/*
 * Settings → Hub bar (apps/system/settings/sec_hubbar.js), H52. Right after Desktop in the sections list
 * (index.html loads it after sec_desktop.js): one on / off switch per item on the Desktop-mode taskbar
 * (the "Hub bar"). Phone mode's top bar is not affected.   (H52; H52b below)
 * H52b: the same switches apply in Phone mode too (no separate Phone set). Phone mode's top bar has
 *   Home ▾ (= Start, always on) · Home button (R42, always on) · [app bar] · 🐻 Pooh · 🎮 Devices · Update
 *   (+ the phone-remote ⛶ / ⚙ Gamepad extras, no switch). So Pooh Chat, Devices and Update work in both
 *   modes (Update off: the dot goes on Home ▾; H52c: no dot any more); every other switch is marked "Desktop only" (DESK_ONLY).
 * Items, left to right (hub/wm/wm_taskbar.js, wm_workspaces.js, hub/core/hub_loader.js + hub/osk/osk.js,
 * hub.html .header-right, hub/drives/hub_traymeter.js):
 *   Start (always on, no switch) · Show Desktop · Search (H48b) · Window buttons · Workspaces 1 / 2 ·
 *   On-screen keyboard ⌨ · Pooh Chat 🐻 · Devices 🎮 · Update (R50) · Busy meter · Clock.
 * Keys ('sites-hub.<key>', hub/core/hub_prefs.js applies them live as html.hub-bar-off-<item>, wm.css hides):
 *   barShowDesk, barSearch, barTasks, barWorkspaces, barOsk, barDevices, barClock: '0' = off (default on);
 *   barPooh, barUpdate: '1' = on (default OFF). H63: barEye (Eye comfort 🌙, both modes) '1' = on (default OFF). Pooh off only hides the icon (Pooh Chat keeps working).
 *   Update off: when a new build waits, a small dot shows on Start instead.   (H52 / H52b)
 *   H52c: Update off = no indicator at all (no dot on Start / Home ▾); the Hub still updates itself and
 *   Settings › About still shows a waiting build.
 *   Busy meter: the existing key 'trayMeter' ('1' = on, default off; hub_traymeter.js), moved here from Desktop.
 * All of them are in the Desktop group of H29 Send profile (hub_profile.js SYNC_GROUPS.desktop).   (H52)
 * H52b: barPooh, barDevices, barUpdate apply in both modes, so they moved to the Shared group; the
 *   Desktop-only switches (and trayMeter) stay in the Desktop group.
 */
(function () {
  'use strict';
  const S = window.SettingsStore, ui = window.Settings.ui;
  /* key, label, hint, def (true = on unless '0'; false = off unless '1') */
  const ITEMS = [
    ['barShowDesk', 'Show Desktop', 'Minimise all windows / bring them back', true],
    ['barSearch', 'Search', 'The magnifier: opens Search', true],
    ['barTasks', 'Window buttons', 'One button per open window (hidden: switch windows from their title bars or the Start menu)', true],
    ['barWorkspaces', 'Workspaces', 'The 1 / 2 workspace switcher (only shows with two workspaces)', true],
    ['barOsk', 'On-screen keyboard', 'The \u2328 button (Ctrl+Alt+K still works)', true],
    ['barPooh', 'Pooh Chat', 'The \uD83D\uDC3B chat icon. Off only hides the icon; Pooh Chat keeps working', false],
    // ['barDevices', 'Devices', 'The \uD83C\uDFAE button: Connect Code, phone link and connected devices', true],   // (before H53)
    ['barDevices', 'Devices', 'The \uD83C\uDFAE button: Connect Code, phone link and connected devices. Always shown on a device joined to a Hub (Disconnect lives there)', true],   // H53
    // ['barUpdate', 'Update', 'Shows when a new build is ready. Off: a small dot on Start instead (the Hub also updates itself, see About)', false]   (H52 / H52b)
    ['barUpdate', 'Update', 'Shows when a new build is ready. Off: no indicator at all; the Hub still updates itself and Settings \u203A About shows a waiting build', false],   // H52c
    ['barEye', 'Eye comfort', 'The \uD83C\uDF19 button: warm screen on / off now, until the next scheduled change (Settings \u203A Look \u203A Eye comfort)', false]   // H63
  ];
  /* H52b: switches with nothing in Phone mode's top bar get a small "Desktop only" tag */
  const DESK_ONLY = ['barShowDesk', 'barSearch', 'barTasks', 'barWorkspaces', 'barOsk', 'trayMeter', 'barClock'];
  function deskOnly(b) {
    if (DESK_ONLY.indexOf(b.dataset.key) < 0) return b;
    const name = b.querySelector('.switch-text b');
    if (name) name.append(' ', ui.el('span', 'bar-donly', 'Desktop only'));
    b.classList.add('desk-only');
    return b;
  }
  const on = (key, def) => { const v = S.get(key); return def ? v !== '0' : v === '1'; };
  const put = (key, def, v) => S.set(key, def ? (v ? '' : '0') : (v ? '1' : ''));

  Settings.add({
    id: 'hubbar', title: 'Hub bar', icon: '\uD83C\uDF9A\uFE0F',
    render(pane, sub) {
      const start = ui.switch('Start', 'Always shown, so Settings can always be reached', true, () => {});
      start.disabled = true;
      start.classList.add('locked');
      start.id = 'bar-start';
      const rows = ITEMS.map(([key, label, hint, def]) => {
        const b = ui.switch(label, hint, on(key, def), (v) => put(key, def, v));
        b.dataset.key = key;
        // return b;   (H52)
        return deskOnly(b);   // H52b
      });
      // the busy meter keeps its own key (was in Settings → Desktop → Taskbar until H52)
      const meter = ui.switch('Busy meter', 'A small graph by the clock: how busy the Hub is (an estimate). Click it for System Monitor',
        S.get('trayMeter') === '1', (v) => S.set('trayMeter', v ? '1' : ''));
      meter.dataset.key = 'trayMeter';
      deskOnly(meter);   // H52b
      const clock = ui.switch('Clock', 'Time (date in its tooltip)', on('barClock', true), (v) => put('barClock', true, v));
      clock.dataset.key = 'barClock';
      deskOnly(clock);   // H52b
      const reset = ui.el('button', 'big-btn', 'Reset to defaults');
      reset.type = 'button';
      reset.id = 'bar-reset';
      reset.addEventListener('click', () => {
        ITEMS.concat([['barClock', '', '', true]]).forEach(([key]) => S.set(key, ''));
        S.set('trayMeter', '');
        Settings.open('hubbar');
      });
      pane.append(
        // ui.note('The bar at the bottom (or top) of the screen in Desktop mode. Changes show at once. Phone mode is not affected.'),   (H52)
        // ui.note('The bar at the bottom (or top) of the screen in Desktop mode, and the top bar in Phone mode. One set of switches for both modes; changes show at once. Items marked Desktop only are not in the Phone bar.'),   (H52b)
        ui.note('The bar at the bottom (or top) of the screen in Desktop mode, and the top bar in Phone mode. One set of switches for both modes; changes show at once. Items marked Desktop only are not in the Phone bar. With Update off nothing on the bar shows a waiting build (see About).'),   // H52c
        ui.title('Left'), start, rows[0], rows[1], rows[2],
        // ui.title('Right'), rows[3], rows[4], rows[5], rows[6], rows[7], meter, clock,   (before H63)
        ui.title('Right'), rows[3], rows[4], rows[8], rows[5], rows[6], rows[7], meter, clock,   // H63: Eye comfort 🌙 sits just before Pooh
        reset,
        // ui.note('These are Desktop layout settings: Send profile (Devices) sends them with the Desktop group.'));   (H52)
        // ui.note('Send profile (Devices): Pooh Chat, Devices and Update go with the Shared group; the Desktop only switches with the Desktop group.'));   // H52b
        ui.note('Send profile (Devices): Eye comfort, Pooh Chat, Devices and Update go with the Shared group; the Desktop only switches with the Desktop group.'));   // H63: + Eye comfort
      if (sub) setTimeout(() => { const r = pane.querySelector('[data-key="' + sub + '"]'); if (r) r.scrollIntoView({ block: 'center' }); }, 50);
    }
  });
})();
