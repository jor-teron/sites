/*
 * Settings → Sizes (apps/system/settings/sec_sizes.js). Taskbar position Bottom / Top (key 'taskPos',
 * default bottom) and taskbar height Small 32 / Normal 40 / Large 48 px (key 'taskH'). Applied live
 * to the Hub (hub_prefs.js → --wm-task-h). (The window title bar size moved to Windows, sec_windows.js.)
 */
(function () {
  'use strict';
  const S = window.SettingsStore, ui = window.Settings.ui;
  Settings.add({
    id: 'sizes', title: 'Sizes', icon: '\uD83D\uDCCF',
    render(pane) {
      const task = ui.choice([
        { value: 32, label: 'Small', hint: '32 px' },
        { value: 40, label: 'Normal', hint: '40 px' },
        { value: 48, label: 'Large', hint: '48 px' }
      ], +S.get('taskH', 40), (v) => S.set('taskH', v === 40 ? '' : v));
      const pos = ui.choice([
        { value: 'bottom', label: 'Bottom', hint: 'Like Windows' },
        { value: 'top', label: 'Top', hint: 'Like GNOME / macOS' }
      ], S.get('taskPos', 'bottom'), (v) => S.set('taskPos', v === 'bottom' ? '' : v));
      pane.append(ui.title('Taskbar position'), pos, ui.title('Taskbar size'), task,
        ui.note('Desktop mode only. Changes show at once.'));
    }
  });
})();
