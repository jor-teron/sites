/*
 * sites hub — quick-access tiles on the hub home screen (hub_tiles.js).
 * Loaded by hub.html before hub.js. Shown until an app is opened.
 * Grid of 2 columns on every screen (hub.css .tiles); 6 tiles = 2 x 3.
 * label is the tile text only; the menu keeps the NAME from hub_apps.js.
 * Tiles that open in the hub frame get a hash link + last-app memory like menu apps
 * (hub.html#snake); NEW_TAB tiles are not remembered.
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
  { type: 'app', label: 'GamePad', url: 'controller/', icon: '', NEW_TAB: 1 },
  { type: 'app', label: 'Accessibility for Deaf', url: 'tools/caption-for-nei/caption-for-nei.html', icon: '' },
  { type: 'app', label: 'Snake', url: 'games/snake/', icon: '' },
  { type: 'app', label: 'TV', url: 'tv/', icon: '', NEW_TAB: 1 },
  { type: 'app', label: 'Webcam', url: 'media/webcam/', icon: '' },
];
