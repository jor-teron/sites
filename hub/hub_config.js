/*
 * Hub config (hub/hub_config.js) — small settings shared by hub.js and hub_flyout.js.
 * Loaded by hub.html before hub.js.
 *
 * HUB_MENU_LABEL  text on the top-left menu button (and in the home-screen hint).
 *                 Rename the menu here only, e.g. 'Start' — a one-line change.
 * HUB_CAT_CSV     category → its own apps CSV (apps/<cat>/<cat>-apps.csv). The desktop
 *                 hover flyout (hub_flyout.js) lists these apps beside the category row.
 *                 A category not listed here (Desktop, About) gets no flyout.
 *                 Deliberately separate from hub_apps.js (feature, don't merge).
 */
window.HUB_MENU_LABEL = 'Home';

window.HUB_CAT_CSV = {
  Favorite: 'apps/favorite/favorite-apps.csv',
  Games: 'apps/games/games-apps.csv',
  Media: 'apps/media/media-apps.csv',
  Office: 'apps/office/office-apps.csv',
  Connectivity: 'apps/connectivity/connectivity-apps.csv',
  Tools: 'apps/tools/tools-apps.csv',
  Lab: 'apps/lab/lab-apps.csv'
};
