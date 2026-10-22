/*
 * Hub wallpapers (hub/drives/hub_wallpapers.js) — the list shared by the Hub (hub_prefs.js paints
 * #empty, the home / desktop background) and the Settings app (apps/system/settings, thumbnails).
 * Stored choice: localStorage 'sites-hub.wallpaper' = one of the ids below, or a custom
 * colour '#rrggbb'. Empty = 'night' (the original Hub wallpaper).
 * slide: true = tall gradient that slowly slides up and down (like the original).
 * light: true = light background, so the home text turns dark.
 * Pictures (R10): every image listed in shared/wallpaper/wallpapers.js (load it first) becomes
 * an entry id 'pic:<file>' with picture: absolute image URL (used directly, cover) and thumb.
 * R36: small = shared/wallpaper/thumbs/<base>.webp (320 px, hub/core/hub_wallthumbs_gen.py) for
 * previews only; thumb (the old full / _small copy) stays as the fallback when a small one is missing.
 * 'mine' (any value starting with 'mine') = Your picture: a file in the Local drive (OPFS)
 * folder Wallpapers/, shown through an object URL — window.hubWallpaperMine() → Promise<url|''>,
 * window.hubWallpaperSaveMine(file) → Promise (Settings → Wallpaper).
 */
window.HUB_WALLPAPERS = [
  { id: 'night', name: 'Night', slide: true,
    image: 'linear-gradient(180deg, #0B1033 0%, #26307A 25%, #5562C4 50%, #26307A 75%, #0B1033 100%)', color: '#0B1033' },
  { id: 'aurora', name: 'Aurora', slide: true,
    image: 'linear-gradient(180deg, #021a1c 0%, #0b4d55 25%, #2fa58f 50%, #0b4d55 75%, #021a1c 100%)', color: '#021a1c' },
  { id: 'dusk', name: 'Dusk', slide: true,
    image: 'linear-gradient(180deg, #1a0b2e 0%, #4b2380 25%, #c2549a 50%, #4b2380 75%, #1a0b2e 100%)', color: '#1a0b2e' },
  { id: 'sunrise', name: 'Sunrise',
    image: 'linear-gradient(135deg, #ff9a8b 0%, #ff6a88 55%, #ff99ac 100%)', color: '#ff7a8a', light: true },
  { id: 'ocean', name: 'Ocean',
    image: 'radial-gradient(circle at 30% 20%, #2c7da0 0%, #1b4965 45%, #0b2233 100%)', color: '#0b2233' },
  { id: 'candy', name: 'Candy',
    image: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)', color: '#c7a6e0', light: true },
  { id: 'black', name: 'Black', color: '#000000' },
  { id: 'grey', name: 'Grey', color: '#4a4f57' },
  { id: 'paper', name: 'Off-white', color: '#CCCCCC', light: true }
];

// Picture wallpapers: URLs are made absolute from this script's own address, so the Hub (site
// root) and the Settings app (apps/system/settings/) point at the same files.
(function () {
  const me = document.currentScript && document.currentScript.src;
  const dir = me ? new URL('../../shared/wallpaper/', me).href : 'shared/wallpaper/';
  (window.HUB_PICTURES || []).forEach((p) => {
    if (!Array.isArray(p) || !/^[\w.-]+\.(jpe?g|png|webp)$/i.test(p[0] || '')) return;
    window.HUB_WALLPAPERS.push({
      id: 'pic:' + p[0], name: p[1] || p[0], picture: dir + p[0], thumb: dir + (p[2] || p[0]),
      small: dir + 'thumbs/' + p[0].replace(/\.\w+$/, '') + '.webp',   // R36
      image: 'url("' + dir + p[0] + '")', color: '#1b2230', light: !!p[3]
    });
  });
})();

// Your picture (Local drive → Wallpapers/wallpaper.<ext>), shown with an object URL
(function () {
  const DIR = 'Wallpapers', BASE = 'wallpaper';
  let cache = null;   // Promise<url>
  async function folder(create) {
    if (!navigator.storage || !navigator.storage.getDirectory) return null;
    const root = await navigator.storage.getDirectory();
    try { return await root.getDirectoryHandle(DIR, { create }); } catch (_) { return null; }
  }
  async function find(dir) {
    for await (const [name, h] of dir.entries()) if (h.kind === 'file' && name.indexOf(BASE + '.') === 0) return { name, h };
    return null;
  }
  window.hubWallpaperMine = function (fresh) {
    if (cache && !fresh) return cache;
    cache = (async () => {
      try {
        const dir = await folder(false);
        const hit = dir && await find(dir);
        return hit ? URL.createObjectURL(await hit.h.getFile()) : '';
      } catch (_) { return ''; }
    })();
    return cache;
  };
  window.hubWallpaperSaveMine = async function (file) {
    const dir = await folder(true);
    if (!dir) throw new Error('No Local drive in this browser');
    const ext = ((file.name || '').match(/\.(jpe?g|png|webp|gif|avif)$/i) || ['.jpg'])[0].toLowerCase();
    let old;
    while ((old = await find(dir))) await dir.removeEntry(old.name);
    const fh = await dir.getFileHandle(BASE + ext, { create: true });
    const w = await fh.createWritable();
    await w.write(file);
    await w.close();
    cache = null;
  };
})();

/** id or '#rrggbb' → wallpaper object (custom colours get light from their brightness). */
window.hubWallpaper = function (v) {
  const list = window.HUB_WALLPAPERS;
  const hit = list.find((w) => w.id === v);
  if (hit) return hit;
  if (/^mine/.test(String(v || ''))) return { id: 'mine', name: 'Your picture', mine: true, color: '#1b2230' };
  if (/^#[0-9a-f]{6}$/i.test(String(v || ''))) {
    const n = parseInt(v.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return { id: v, name: 'Custom', color: v, light: (0.299 * r + 0.587 * g + 0.114 * b) > 150 };
  }
  return list[0];
};
