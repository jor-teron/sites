/*
 * Settings → Look (apps/system/settings/sec_look.js). Accent colour (presets + custom picker,
 * key 'accent'), Dark / Light / Glass theme (key 'theme'; H61 Glass = 'glass' '1' + theme 'light'),
 * Reduce transparency (H61, key 'glassSolid', Glass only) and animations On / Reduced (no jelly) /
 * Off (key 'motion'). Applied live to the Hub (hub_prefs.js) and to this app.
 * H63 Eye comfort (#look/eye): Warmth slider 0 (Off) .. 100 (Very warm), key 'eyeWarm' ('' = 50);
 * When: Off / Always / Scheduled (key 'eyeMode' '' | 'always' | 'sched') with From / To time inputs
 * (keys 'eyeFrom' / 'eyeTo', '' = 19:00 / 06:00; hub/core/hub_daynight.js). The Hub draws the warm
 * layer (hub/core/hub_eye.js); a pick here clears the 🌙 override (key 'eyeNow').
 * H64 Theme: Auto / Light / Dark / Glass. Auto = key 'themeAuto' '1' with Sunrise / Sunset time inputs
 * ('themeSunrise' / 'themeSunset', '' = 06:00 / 18:00) and an Offset slider -2 h .. +2 h, 15 min steps
 * ('themeOffset' minutes, '' = 0); the effective 'light' / 'dark' stays in 'theme' (hub/core/hub_autotheme.js).
 * Status line: 'Dark now. Light at 07:00.' Light / Dark / Glass clear Auto; Auto clears Glass.
 */
(function () {
  'use strict';
  const S = window.SettingsStore, ui = window.Settings.ui;
  const ACCENTS = ['#6ea8fe', '#a78bfa', '#f472b6', '#fb923c', '#facc15', '#34d399', '#22d3ee'];
  Settings.add({
    id: 'look', title: 'Look', icon: '\uD83C\uDFA8',
    render(pane, sub) {
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
      /* H61 (before H64):
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
      */
      // H64: Auto / Light / Dark / Glass. Auto = themeAuto '1'; the effective 'light' / 'dark' is kept in
      // theme (by the Hub's hub_autotheme.js, or this page's copy when Settings runs on its own), so apps
      // reading sites-hub.theme follow. Picking Light / Dark / Glass clears Auto; Auto clears Glass.
      const AT = () => { const h = S.hub && S.hub(); return (h && h.HubAutoTheme) || window.HubAutoTheme || null; };
      const curTheme = () => {
        if (S.get('themeAuto') === '1') return 'auto';
        const t = S.get('theme');
        return t === 'dark' ? 'dark' : (t === 'glass' || S.get('glass') === '1') ? 'glass' : 'light';
      };
      const autoNow = () => { const a = AT(); if (a && a.on()) S.set('theme', a.effective()); };   // write the effective theme now
      const theme = ui.choice([
        { value: 'auto', label: 'Auto', hint: 'Light by day' }, { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' }, { value: 'glass', label: 'Glass', hint: 'Frosted' }
      ], curTheme(), (v) => {
        S.set('themeAuto', v === 'auto' ? '1' : '');   // first: while Auto is still on, the Hub would clear a new glass '1'
        S.set('glass', v === 'glass' ? '1' : '');
        if (v === 'auto') autoNow();
        else S.set('theme', v === 'glass' ? 'light' : v);
        solid.style.display = v === 'glass' ? '' : 'none';
        autoBox.hidden = v !== 'auto';
        autoStatus();
      });
      theme.id = 'look-theme';
      /* H64: Auto theme times: Sunrise / Sunset + Offset (-2 h .. +2 h, 15 min steps) */
      const ADEF = (window.HubAutoTheme && window.HubAutoTheme.DEF) || { sunrise: '06:00', sunset: '18:00' };
      const autoBox = ui.el('div', 'auto-theme');
      autoBox.id = 'auto-theme';
      const aTimes = ui.el('div', 'eye-times');
      const aIn = (key, label, def) => {
        const l = ui.el('label', 'eye-time');
        const i = document.createElement('input');
        i.type = 'time'; i.id = 'auto-' + key; i.value = S.get(key) || def; i.required = true;
        i.addEventListener('change', () => {
          if (!/^\d{2}:\d{2}/.test(i.value)) return;
          S.set(key, i.value.slice(0, 5) === def ? '' : i.value.slice(0, 5));
          autoNow(); autoStatus();
        });
        l.append(ui.el('span', '', label), i);
        return l;
      };
      aTimes.append(aIn('themeSunrise', '\u2600\uFE0F Sunrise', ADEF.sunrise), aIn('themeSunset', '\uD83C\uDF19 Sunset', ADEF.sunset));
      const offV = () => { const n = Math.round(+S.get('themeOffset')); return isFinite(n) ? Math.max(-120, Math.min(120, n)) : 0; };
      const offName = (m) => {
        if (!m) return '0';
        const a = Math.abs(m), h = Math.floor(a / 60), mm = a % 60;
        return (m < 0 ? '\u2212' : '+') + (h ? h + ' h' : '') + (h && mm ? ' ' : '') + (mm ? mm + ' min' : '');
      };
      const oRow = ui.el('label', 'slider-row');
      oRow.id = 'auto-offset-row';
      const oTxt = ui.el('span', 'switch-text');
      oTxt.append(ui.el('b', '', 'Offset'), ui.el('small', '', 'Move both switches up to 2 hours earlier (\u2212) or later (+)'));
      const oRange = ui.el('input', 'slider');
      Object.assign(oRange, { type: 'range', min: -120, max: 120, step: 15, value: offV() });
      oRange.id = 'auto-offset';
      oRange.setAttribute('aria-label', 'Auto theme offset');
      const oVal = ui.el('output', 'slider-val', offName(offV()));
      oVal.id = 'auto-offset-val';
      oRange.addEventListener('input', () => {
        oVal.textContent = offName(+oRange.value);
        S.set('themeOffset', +oRange.value === 0 ? '' : String(+oRange.value));
        autoNow(); autoStatus();
      });
      oRow.append(oTxt, oRange, oVal);
      const aSt = ui.note('');
      aSt.id = 'auto-status';
      const hm = (d) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      function autoStatus() {
        const a = AT();
        if (!a) { aSt.textContent = ''; return; }
        const s = a.state();
        let t = (s.dark ? 'Dark now.' : 'Light now.') + (s.next ? ' ' + (s.dark ? 'Light' : 'Dark') + ' at ' + hm(s.next) + '.' : ' (Sunrise and Sunset are the same, so it stays Light.)');
        t += ' Dark ' + s.darkAt + ' \u2013 ' + s.lightAt + ' (Sunset ' + s.sunset + ' / Sunrise ' + s.sunrise + (s.offset ? ', offset ' + offName(s.offset) : '') + ').';
        aSt.textContent = t;
      }
      autoBox.append(aTimes, oRow, aSt);
      autoBox.hidden = curTheme() !== 'auto';
      autoStatus();
      S.onChange((k) => {   // own picks + other tabs / the Hub's clock switch (storage events)
        if (k && k.indexOf('theme') !== 0 && k !== 'glass') return;
        const c = curTheme();
        theme.repaint(c); autoBox.hidden = c !== 'auto'; solid.style.display = c === 'glass' ? '' : 'none';
        autoStatus();
      });
      const aTimer = setInterval(() => { if (!aSt.isConnected) clearInterval(aTimer); else autoStatus(); }, 30000);
      const solid = ui.switch('Reduce transparency', 'Glass with solid colours and no blur: easier to read, faster on older devices',
        S.get('glassSolid') === '1', (on) => S.set('glassSolid', on ? '1' : ''));
      solid.id = 'look-glass-solid';
      solid.style.display = curTheme() === 'glass' ? '' : 'none';   // .switch is display:flex, so not [hidden]
      const motion = ui.choice([
        { value: 'on', label: 'On', hint: 'Jelly + bouncy' },
        { value: 'reduced', label: 'Reduced', hint: 'No jelly' },
        { value: 'off', label: 'Off', hint: 'No animation' }
      ], S.get('motion', 'on'), (v) => S.set('motion', v === 'on' ? '' : v));
      /* H63: Eye comfort */
      const DN = window.HubDayNight, DEF = DN ? DN.DEF : { from: '19:00', to: '06:00' };
      const warmV = () => { const v = S.get('eyeWarm'); if (v === '') return 50; const n = Math.round(+v); return isFinite(n) ? Math.max(0, Math.min(100, n)) : 50; };
      const warmName = (v) => (v <= 0 ? 'Off' : v < 34 ? 'Low' : v < 67 ? 'Warm' : v < 90 ? 'Warmer' : 'Very warm');
      const wRow = ui.el('label', 'slider-row');
      wRow.id = 'eye-warm-row';
      const wTxt = ui.el('span', 'switch-text');
      wTxt.append(ui.el('b', '', 'Warmth'), ui.el('small', '', 'Off \u2026 Very warm: how orange the screen gets'));
      const wRange = ui.el('input', 'slider');
      Object.assign(wRange, { type: 'range', min: 0, max: 100, step: 5, value: warmV() });
      wRange.id = 'eye-warm';
      wRange.setAttribute('aria-label', 'Eye comfort warmth');
      const wVal = ui.el('output', 'slider-val', warmName(warmV()));
      wVal.id = 'eye-warm-val';
      wRange.addEventListener('input', () => {
        wVal.textContent = warmName(+wRange.value);
        S.set('eyeWarm', +wRange.value === 50 ? '' : String(+wRange.value));
        status();
      });
      wRow.append(wTxt, wRange, wVal);
      const eyeMode = () => { const m = S.get('eyeMode'); return m === 'always' || m === 'sched' ? m : 'off'; };
      const times = ui.el('div', 'eye-times');
      times.id = 'eye-times';
      const when = ui.choice([
        { value: 'off', label: 'Off', hint: 'Normal colours' },
        { value: 'always', label: 'Always', hint: 'Warm all the time' },
        { value: 'sched', label: 'Scheduled', hint: 'Between two times' }
      ], eyeMode(), (v) => {
        S.set('eyeNow', '');   // a new choice replaces the 🌙 override
        S.set('eyeMode', v === 'off' ? '' : v);
        times.hidden = v !== 'sched';
        status();
      });
      when.id = 'eye-mode';
      const tIn = (key, label, def) => {
        const l = ui.el('label', 'eye-time');
        const i = document.createElement('input');
        i.type = 'time'; i.id = 'eye-' + key; i.value = S.get(key) || def; i.required = true;
        i.addEventListener('change', () => {
          if (!/^\d{2}:\d{2}/.test(i.value)) return;
          S.set('eyeNow', '');
          S.set(key, i.value.slice(0, 5) === def ? '' : i.value.slice(0, 5));
          status();
        });
        l.append(ui.el('span', '', label), i);
        return l;
      };
      times.append(tIn('eyeFrom', 'From', DEF.from), tIn('eyeTo', 'To', DEF.to));
      times.hidden = eyeMode() !== 'sched';
      const st = ui.note('');
      st.id = 'eye-status';
      function status() {
        const h = S.hub && S.hub();
        const E = h && h.HubEye;
        if (!E) { st.textContent = 'Eye comfort shows in the Hub.'; return; }
        const s = E.state();
        let t = s.on ? 'On now' : 'Off now';
        if (s.warm === 0) t = 'Off now (Warmth is Off)';
        if (s.override != null) t += ' (\uD83C\uDF19, until the next scheduled change)';
        if (s.mode === 'sched' && s.next) t += '. Next change at ' + String(s.next.getHours()).padStart(2, '0') + ':' + String(s.next.getMinutes()).padStart(2, '0');
        st.textContent = t + '.';
      }
      status();
      const stTimer = setInterval(() => { if (!st.isConnected) clearInterval(stTimer); else status(); }, 30000);
      const eyeTitle = ui.title('Eye comfort');
      eyeTitle.id = 'look-eye';
      // pane.append(ui.title('Accent colour'), row, ui.title('Theme'), theme, solid, ui.title('Animations'), motion,
      //   ui.note('Theme and accent colour the Hub menu, taskbar and windows. Apps keep their own look (with Glass, apps that follow the Hub are Light).'));   (before H63)
      /* (before H64)
      pane.append(ui.title('Accent colour'), row, ui.title('Theme'), theme, solid, ui.title('Animations'), motion,
        ui.note('Theme and accent colour the Hub menu, taskbar and windows. Apps keep their own look (with Glass, apps that follow the Hub are Light).'),
        eyeTitle, ... */
      pane.append(ui.title('Accent colour'), row, ui.title('Theme'), theme, autoBox, solid, ui.title('Animations'), motion,
        ui.note('Theme and accent colour the Hub menu, taskbar and windows. Apps keep their own look (with Glass, apps that follow the Hub are Light). Auto is Light by day and Dark by night, from the Sunrise and Sunset times above (no location used); apps that follow the Hub switch with it.'),
        eyeTitle, wRow, when, times, st,
        ui.note('A warm, orange tint over the whole Hub and its apps, easier on the eyes at night (like Night Light). It fades in and out over a few seconds. The \uD83C\uDF19 button (Settings \u203A Hub bar) turns it on or off until the next scheduled change. A web page cannot change the real screen colour, so the phone status bar and other apps stay as they are.'));
      if (sub === 'eye') setTimeout(() => eyeTitle.scrollIntoView({ block: 'start' }), 50);   // H63: #look/eye
    }
  });
})();
