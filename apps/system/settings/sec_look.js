/*
 * Settings → Look (apps/system/settings/sec_look.js). Accent colour (presets + custom picker,
 * key 'accent'), Dark / Light / Glass theme (key 'theme'; H61 Glass = 'glass' '1' + theme 'light'),
 * Reduce transparency (H61, key 'glassSolid', Glass only) and animations On / Reduced (no jelly) /
 * Off (key 'motion'). Applied live to the Hub (hub_prefs.js) and to this app.
 */
(function () {
  'use strict';
  const S = window.SettingsStore, ui = window.Settings.ui;
  const ACCENTS = ['#6ea8fe', '#a78bfa', '#f472b6', '#fb923c', '#facc15', '#34d399', '#22d3ee'];
  Settings.add({
    id: 'look', title: 'Look', icon: '\uD83C\uDFA8',
    render(pane) {
      const row = ui.el('div', 'accents');
      const cur = () => (S.get('accent') || ACCENTS[0]).toLowerCase();
      const paint = () => row.querySelectorAll('.accent').forEach((b) => {
        const on = b.dataset.c === cur() || (b.classList.contains('accent-custom') && ACCENTS.indexOf(cur()) < 0);
        b.classList.toggle('on', on);
      });
      ACCENTS.forEach((c) => {
        const b = ui.el('button', 'accent');
        b.type = 'button';
        b.dataset.c = c;
        b.style.background = c;
        b.setAttribute('aria-label', 'Accent ' + c);
        b.addEventListener('click', () => { S.set('accent', c === ACCENTS[0] ? '' : c); paint(); });
        row.appendChild(b);
      });
      const cl = ui.el('label', 'accent accent-custom');
      cl.title = 'Custom colour';
      const pk = document.createElement('input');
      pk.type = 'color'; pk.value = cur(); pk.setAttribute('aria-label', 'Custom accent colour');
      pk.addEventListener('input', () => { S.set('accent', pk.value.toLowerCase()); paint(); });
      cl.appendChild(pk);
      row.appendChild(cl);
      paint();
      /* H60a (before H61):
      const theme = ui.choice([
        { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }
      // ], S.get('theme', 'dark'), (v) => S.set('theme', v === 'dark' ? '' : v));   // legacy: Dark default, saved as ''
      ], S.get('theme') === 'dark' ? 'dark' : 'light', (v) => S.set('theme', v));   // H60a: Light default, both saved
      */
      // H61: + Glass. Saved as glass '1' with theme 'light', so apps reading sites-hub.theme see Light.
      const curTheme = () => {
        const t = S.get('theme');
        return t === 'dark' ? 'dark' : (t === 'glass' || S.get('glass') === '1') ? 'glass' : 'light';
      };
      const theme = ui.choice([
        { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'glass', label: 'Glass', hint: 'Frosted' }
      ], curTheme(), (v) => {
        S.set('glass', v === 'glass' ? '1' : '');
        S.set('theme', v === 'glass' ? 'light' : v);
        solid.style.display = v === 'glass' ? '' : 'none';
      });
      const solid = ui.switch('Reduce transparency', 'Glass with solid colours and no blur: easier to read, faster on older devices',
        S.get('glassSolid') === '1', (on) => S.set('glassSolid', on ? '1' : ''));
      solid.id = 'look-glass-solid';
      solid.style.display = curTheme() === 'glass' ? '' : 'none';   // .switch is display:flex, so not [hidden]
      const motion = ui.choice([
        { value: 'on', label: 'On', hint: 'Jelly + bouncy' },
        { value: 'reduced', label: 'Reduced', hint: 'No jelly' },
        { value: 'off', label: 'Off', hint: 'No animation' }
      ], S.get('motion', 'on'), (v) => S.set('motion', v === 'on' ? '' : v));
      pane.append(ui.title('Accent colour'), row, ui.title('Theme'), theme, solid, ui.title('Animations'), motion,
        ui.note('Theme and accent colour the Hub menu, taskbar and windows. Apps keep their own look (with Glass, apps that follow the Hub are Light).'));
    }
  });
})();
