# App Hub (apps/system/apphub/)

System app (AH1): a home for the apps already in the Hub. It is **not** an app store; nothing is installed or downloaded. It lists the Hub's own apps and opens them. Works in a Desktop window, in Phone mode and standalone, over http and file://.

- **Home:** a **Favourites** row with the apps in `apps/favorite/favorite-apps.csv`, in that file's order (Favorite itself stays hidden in Start). Below it, one tile per Start-menu category (icon, name, app count), in the Start order from `hub/core/hub_apps.js`. Favorite is not a tile.
- **Category page:** the tile opens `#cat=<name>`, which lists that category's apps (icon and name) under the section headings from the category CSV. **Back** (button, Escape, Backspace or Alt+Left) returns home. Browser back and deep links (`apps/system/apphub/#cat=Games`) work.
- **Hub categories (AH2):** the Hub's category rows (the Start menu in Desktop mode, the Home menu in Phone mode, and the right-click "Open" / "Open in new window" / "Open in new tab" of those rows) open this app at `#cat=<Category>` (`hub.js` `openCat`): a window in Desktop mode, the frame in Phone mode. An App Hub that is already open just moves to that category. The old pages (`apps/<cat>/<cat>.html`, e.g. `games.html`) are legacy: untouched, they still load from old deep links and saved sessions. Shift+click or middle-click on an app opens another window (Desktop mode), as on the old pages. Not carried over from the old pages: the right-click menu on a tile (Open in new tab, Copy link, Add to Favorites) and the "My favorites" list of the Favorite page.
- **Opening an app:** inside the Hub it opens like the Start menu does (`parent.__hubFly.openFromCat`): a window in Desktop mode, the app frame in Phone mode. On file://, where the Hub cannot be reached directly, it sends `{type:'hub-open-app'}` to the Hub, as category pages and Terminal do. Opened on its own, it shows a short message with a link to the Hub.
- **Data:** `hub/core/hub_config.js` (`HUB_CAT_CSV`), `hub/core/hub_apps.js` (category order), the category CSVs (fetched with no-cache over http) and `hub/core/hub_catalog.js` (`SITES_CSV`, used on file:// and as the fallback), read with `TilesCsv` from `shared/tiles/tiles.js`. Paths resolve as in the Start flyout (`hub/menu/hub_flyout.js`). An icon that fails to load becomes a letter tile.
- **Look:** cards follow the Hub theme (`sites-hub.theme` light / dark and `sites-hub.accent`), live through the `storage` event and `{type:'hub-prefs'}`. Touch targets are at least 44px. Arrow keys move between cards and focus is always visible.
- **Safety:** all text is set with `textContent`. Messages are posted only to the Hub's own origin (`'*'` on file://, as elsewhere in the Hub).

Offline: the four files are in the service worker shell (`hub/update/hub_sw.js` SHELL, AH2), so a first visit also opens offline.

Files: `index.html`, `apphub.js`, `apphub.css`, `apphub_icon.png`.
