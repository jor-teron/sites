/*
 * Hub wallpapers (hub/hub_wallpapers.js) — the list shared by the Hub (hub_prefs.js paints
 * #empty, the home / desktop background) and the Settings app (apps/settings, thumbnails).
 * Stored choice: localStorage 'sites-hub.wallpaper' = one of the ids below, or a custom
 * colour '#rrggbb'. Empty = 'night' (the original Hub wallpaper).
 * slide: true = tall gradient that slowly slides up and down (like the original).
 * light: true = light background, so the home text turns dark.
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

/** id or '#rrggbb' → wallpaper object (custom colours get light from their brightness). */
window.hubWallpaper = function (v) {
  const list = window.HUB_WALLPAPERS;
  const hit = list.find((w) => w.id === v);
  if (hit) return hit;
  if (/^#[0-9a-f]{6}$/i.test(String(v || ''))) {
    const n = parseInt(v.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return { id: v, name: 'Custom', color: v, light: (0.299 * r + 0.587 * g + 0.114 * b) > 150 };
  }
  return list[0];
};
