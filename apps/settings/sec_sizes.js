/*
 * Settings → Sizes (apps/settings/sec_sizes.js). Taskbar position Bottom / Top (key 'taskPos',
 * default bottom), taskbar height Small 32 / Normal 40 / Large 48 px (key 'taskH') and window title bar Slim 24 / Normal 28 / Large 34 px
 * (key 'titleH'). Applied live to the Hub (hub_prefs.js → --wm-task-h / --wm-title-h).
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
      const title = ui.choice([
        { value: 24, label: 'Slim', hint: '24 px' },
        { value: 28, label: 'Normal', hint: '28 px' },
        { value: 34, label: 'Large', hint: '34 px' }
      ], +S.get('titleH', 28), (v) => S.set('titleH', v === 28 ? '' : v));
      const pos = ui.choice([
        { value: 'bottom', label: 'Bottom', hint: 'Like Windows' },
        { value: 'top', label: 'Top', hint: 'Like GNOME / macOS' }
      ], S.get('taskPos', 'bottom'), (v) => S.set('taskPos', v === 'bottom' ? '' : v));
      pane.append(ui.title('Taskbar position'), pos, ui.title('Taskbar size'), task, ui.title('Window title bar'), title,
        ui.note('Desktop mode only. Changes show at once.'));
    }
  });
})();
