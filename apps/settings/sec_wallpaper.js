/*
 * Settings → Wallpaper (apps/settings/sec_wallpaper.js). Big live preview + thumbnail grid
 * of the Hub wallpapers (hub/hub_wallpapers.js: 6 gradients incl. the original Night, solid
 * black / grey / off-white) and a custom colour picker. Picking one applies to the Hub at once
 * (key 'wallpaper' = id or '#rrggbb'). No image upload yet.
 */
(function () {
  'use strict';
  const S = window.SettingsStore, ui = window.Settings.ui;
  function paint(el, w) {
    el.style.backgroundColor = w.color || '#000';
    el.style.backgroundImage = w.image || 'none';
    el.style.backgroundSize = w.slide ? '100% 300%' : 'cover';
    el.style.backgroundPosition = w.slide ? '50% 40%' : 'center';
  }
  Settings.add({
    id: 'wallpaper', title: 'Wallpaper', icon: '\uD83D\uDDBC\uFE0F',
    render(pane) {
      const cur = () => S.get('wallpaper', 'night');
      const preview = ui.el('div', 'wp-preview');
      preview.appendChild(ui.el('div', 'wp-preview-win'));
      preview.appendChild(ui.el('div', 'wp-preview-bar'));
      const grid = ui.el('div', 'wp-grid');
      const pick = (v) => {
        S.set('wallpaper', v === 'night' ? '' : v);
        paint(preview, window.hubWallpaper(v));
        grid.querySelectorAll('.wp-thumb').forEach((t) => t.classList.toggle('on', t.dataset.id === v));
        custom.classList.toggle('on', /^#/.test(v));
        if (/^#/.test(v)) picker.value = v;
      };
      window.HUB_WALLPAPERS.forEach((w) => {
        const t = ui.el('button', 'wp-thumb');
        t.type = 'button';
        t.dataset.id = w.id;
        t.title = w.name;
        const sw = ui.el('span', 'wp-swatch'); paint(sw, w);
        t.append(sw, ui.el('span', 'wp-name', w.name));
        t.addEventListener('click', () => pick(w.id));
        grid.appendChild(t);
      });
      // custom colour
      const custom = ui.el('label', 'wp-thumb wp-custom');
      const picker = document.createElement('input');
      picker.type = 'color';
      picker.value = /^#/.test(cur()) ? cur() : '#336699';
      picker.setAttribute('aria-label', 'Custom colour');
      const cs = ui.el('span', 'wp-swatch wp-custom-sw');
      cs.appendChild(picker);
      custom.append(cs, ui.el('span', 'wp-name', 'Custom'));
      picker.addEventListener('input', () => pick(picker.value.toLowerCase()));
      grid.appendChild(custom);

      pane.append(preview, ui.title('Choose a wallpaper'), grid,
        ui.note('Applies to the Hub home / desktop right away.'));
      pick(cur());
    }
  });
})();
