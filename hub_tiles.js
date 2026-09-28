/*
 * sites hub — quick-access tiles on the hub home screen (hub_tiles.js).
 * Loaded by hub.html before hub.js. Shown until an app is opened.
 * 4 in a row on wide screens, 2 x 2 on phones (hub.css .tiles).
 *
 * Tile types:
 *   { type: 'qr', label, caption? }
 *       QR code of this hub's own link (vendor/qrcode.js, white quiet zone of 4 modules).
 *       caption: text under the QR; empty = the link itself.
 *   { type: 'app', label, url, icon?, NEW_TAB? }
 *       url     ENTRY_URL like in hub_apps.js (folder, file or .txt)
 *       icon    optional; empty = the icon of the same app in hub_apps.js, else the
 *               app's own icon (xxx/xxx_icon.png)
 *       NEW_TAB 1 = open in a new browser tab, 0 = open in the hub frame;
 *               empty = the NEW_TAB of that app in hub_apps.js (else 0)
 */
window.HUB_TILES = [
  { type: 'qr', label: 'Open on another device', caption: '' },
  // Phone gamepad: a new tab gives it the full screen (fullscreen / wake lock)
  { type: 'app', label: 'Controller', url: 'controller/', icon: '', NEW_TAB: 1 },
  { type: 'app', label: 'Caption for NEI', url: 'tools/caption-for-nei/caption-for-nei.html', icon: '' },
  { type: 'app', label: 'Snake', url: 'games/snake/', icon: '' },
];
