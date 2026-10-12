/*
 * sites hub — quick-access tiles on the hub home screen (hub_tiles.js).
 * Loaded by hub.html before hub.js. Shown until an app is opened.
 * 4 tiles: a 2 x 2 grid (hub.css .tiles); one row of 4 on a short landscape phone.
 * label is the tile text only; the menu keeps the NAME from hub_apps.js.
 * Tiles that open in the hub frame get a hash link + last-app memory like menu apps
 * (hub.html#snake); NEW_TAB tiles are not remembered.
 *
 * Tile types:
 *   { type: 'qr', label, pair? }
 *       QR code + title only (no caption, no link). QR of this hub's own link, or with
 *       pair: 1 the phone-controller link with the hub's live pairing code — the same
 *       Hub code as a hub.html?join=CODE link (Connect QR: the phone opens the Hub joined),
 *       redrawn on "New code".
 *   { type: 'app', label, url, icon?, NEW_TAB?, pair? }
 *       pair: 1 = open the controller carrying the pairing code (new tab)
 *       url     ENTRY_URL like in hub_apps.js (folder, file or .txt)
 *       icon    optional; empty = the icon of the same app in hub_apps.js, else the
 *               app's own icon (xxx/xxx_icon.png)
 *       NEW_TAB 1 = open in a new browser tab, 0 = open in the hub frame;
 *               empty = the NEW_TAB of that app in hub_apps.js (else 0)
 */
window.HUB_TILES = [
  { type: 'qr', label: 'Site QR' },
  { type: 'qr', label: 'Connect QR', pair: 1 },   // hub.html?join=CODE: phone opens the Hub, joined
  { type: 'app', label: 'QR Scanner', url: 'apps/connectivity/qr-scanner/', icon: '' },
  { type: 'app', label: 'Gamepad', url: 'hub/controller/', icon: '', NEW_TAB: 1, pair: 1 },
];
