/* ============================================================
   FILE: mybookmark_config.js
   PROJECT: MyBookmark
   ROLE: Settings in one place (storage names, limits, defaults).
   ============================================================ */
const MB_CONFIG = {
  appName: 'MyBookmark',
  db: { name: 'mybookmark', version: 1, nodes: 'nodes', meta: 'meta' },
  rootId: 'root',
  /* Old Bookmark Manager (apps/lab/bookmark-manager): read once, never deleted. */
  legacyKey: 'bookmarkManagerData',
  migratedFlag: 'migratedLegacy',
  /* Theme: the hub's shared pref, else the system setting. */
  hubThemeKey: 'sites-hub.theme',
  prefsKey: 'mybookmark.prefs',          /* view, sort, open folder (localStorage) */
  defaults: { view: 'cards', sort: 'name', folder: 'root' },
  searchMin: 1,
  maxResults: 2000,                      /* search results shown at once */
  phoneMax: 720,                         /* px: tree becomes a drawer below this */
  exportTitle: 'Bookmarks',
  importFolderPrefix: 'Imported ',
};
