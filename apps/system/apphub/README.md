# App Hub (apps/system/apphub/)

System app (AH1): a home for the apps already in the Hub. It is **not** an app store; nothing is installed or downloaded. It lists the Hub's own apps and opens them. Works in a Desktop window, in Phone mode and standalone, over http and file://.

- **Home:** a **Favourites** row with the apps in `apps/favorite/favorite-apps.csv`, in that file's order (Favorite itself stays hidden in Start). Below it, one tile per Start-menu category (icon, name, app count), in the Start order from `hub/core/hub_apps.js`. Favorite is not a tile.
- **Category page:** the tile opens `#cat=<name>`, which lists that category's apps (icon and name) under the section headings from the category CSV. **Back** (button, Escape, Backspace or Alt+Left) returns home. Browser back and deep links (`apps/system/apphub/#cat=Games`) work.
- **Opening an app:** inside the Hub it opens like the Start menu does (`parent.__hubFly.openFromCat`): a window in Desktop mode, the app frame in Phone mode. On file://, where the Hub cannot be reached directly, it sends `{type:'hub-open-app'}` to the Hub, as category pages and Terminal do. Opened on its own, it shows a short message with a link to the Hub.
- **Data:** `hub/core/hub_config.js` (`HUB_CAT_CSV`), `hub/core/hub_apps.js` (category order), the category CSVs (fetched with no-cache over http) and `hub/core/hub_catalog.js` (`SITES_CSV`, used on file:// and as the fallback), read with `TilesCsv` from `shared/tiles/tiles.js`. Paths resolve as in the Start flyout (`hub/menu/hub_flyout.js`). An icon that fails to load becomes a letter tile.
- **Look:** cards follow the Hub theme (`sites-hub.theme` light / dark and `sites-hub.accent`), live through the `storage` event and `{type:'hub-prefs'}`. Touch targets are at least 44px. Arrow keys move between cards and focus is always visible.
- **Safety:** all text is set with `textContent`. Messages are posted only to the Hub's own origin (`'*'` on file://, as elsewhere in the Hub).

Files: `index.html`, `apphub.js`, `apphub.css`, `apphub_icon.png`.
