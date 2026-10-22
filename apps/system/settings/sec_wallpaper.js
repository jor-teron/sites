/*
 * Settings → Wallpaper (apps/system/settings/sec_wallpaper.js). Big live preview, then two grids:
 *   Colours & gradients — hub/drives/hub_wallpapers.js (6 gradients incl. the original Night, solid
 *     black / grey / off-white) + a custom colour picker.
 *   Pictures — every image in shared/wallpaper/ listed in shared/wallpaper/wallpapers.js
 *     (R36: previews are the 320 px WebP thumbs in shared/wallpaper/thumbs/ (hub_wallthumbs_gen.py),
 *     loading="lazy", falling back to the full image when a thumb is missing; only the chosen
 *     wallpaper (big preview + the Hub) loads at full size; the Hub uses the image URL directly, nothing is copied) + "Your picture": pick an image, it is saved in the Local
 *     drive (Wallpapers/wallpaper.<ext>, replaces the previous one) and shown from there.
 * Picking one applies to the Hub at once (key 'wallpaper' = id, 'pic:<file>', 'mine:<time>'
 * or '#rrggbb').
 */
(function () {
  'use strict';
  const S = window.SettingsStore, ui = window.Settings.ui;
  function paint(el, w) {
    el.style.backgroundColor = w.color || '#000';
    el.style.backgroundImage = w.image || 'none';
    el.style.backgroundSize = w.slide ? '100% 300%' : 'cover';
    el.style.backgroundPosition = w.slide ? '50% 40%' : 'center';
    if (w.mine && window.hubWallpaperMine) {
      window.hubWallpaperMine().then((u) => { if (u) el.style.backgroundImage = 'url("' + u + '")'; });
    }
  }
  Settings.add({
    id: 'wallpaper', title: 'Wallpaper', icon: '\uD83D\uDDBC\uFE0F',
    render(pane) {
      const cur = () => S.get('wallpaper', 'night');
      const preview = ui.el('div', 'wp-preview');
      preview.appendChild(ui.el('div', 'wp-preview-win'));
      preview.appendChild(ui.el('div', 'wp-preview-bar'));
      const grid = ui.el('div', 'wp-grid');
      const pics = ui.el('div', 'wp-grid wp-pics');
      const idOf = (v) => (/^mine/.test(v) ? 'mine' : v);
      const pick = (v) => {
        S.set('wallpaper', v === 'night' ? '' : v);
        paint(preview, window.hubWallpaper(v));
        pane.querySelectorAll('.wp-thumb').forEach((t) => t.classList.toggle('on', t.dataset.id === idOf(v)));
        custom.classList.toggle('on', /^#/.test(v));
        if (/^#/.test(v)) picker.value = v;
      };
      const thumb = (w, into) => {
        const t = ui.el('button', 'wp-thumb');
        t.type = 'button';
        t.dataset.id = w.id;
        t.title = w.name;
        let sw;
        if (w.thumb) {
          sw = ui.el('span', 'wp-swatch wp-pic');
          const img = document.createElement('img');
          img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.width = 320; img.height = 200;
          if (w.small) img.onerror = () => { img.onerror = null; img.src = w.thumb; };   // R36: thumb missing → full image
          img.src = w.small || w.thumb;
          sw.appendChild(img);
        } else { sw = ui.el('span', 'wp-swatch'); paint(sw, w); }
        t.append(sw, ui.el('span', 'wp-name', w.name));
        t.addEventListener('click', () => pick(w.id));
        into.appendChild(t);
      };
      window.HUB_WALLPAPERS.forEach((w) => thumb(w, w.picture ? pics : grid));
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

      // Your picture (Local drive); only where the browser has one
      if (window.hubWallpaperSaveMine && navigator.storage && navigator.storage.getDirectory) {
        const mine = ui.el('label', 'wp-thumb wp-mine');
        mine.dataset.id = 'mine';
        const ms = ui.el('span', 'wp-swatch wp-pic wp-mine-sw', '+');
        const file = document.createElement('input');
        file.type = 'file'; file.accept = 'image/*';
        file.setAttribute('aria-label', 'Your picture');
        mine.append(ms, ui.el('span', 'wp-name', 'Your picture'), file);
        const show = (fresh) => window.hubWallpaperMine(fresh).then((u) => {
          if (u) { ms.textContent = ''; ms.style.backgroundImage = 'url("' + u + '")'; }
        });
        show(false);
        mine.addEventListener('click', (e) => {   // already saved + not the current one: just use it
          if (e.target === file) return;
          if (ms.style.backgroundImage && idOf(cur()) !== 'mine') { e.preventDefault(); pick('mine:' + Date.now()); }
        });
        file.addEventListener('change', async () => {
          const f = file.files && file.files[0];
          file.value = '';
          if (!f || !/^image\//.test(f.type)) return;
          try { await window.hubWallpaperSaveMine(f); } catch (err) { ms.textContent = '!'; ms.title = String(err && err.message || err); return; }
          await show(true);
          pick('mine:' + Date.now());
        });
        pics.appendChild(mine);
      }

      pane.append(preview, ui.title('Colours & gradients'), grid, ui.title('Pictures'), pics,
        ui.note('Applies to the Hub home / desktop right away. Your picture stays in this browser (Files \u2192 Local \u2192 Wallpapers).'));
      pick(cur());
    }
  });
})();
