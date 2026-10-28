# Search (apps/system/search/), H48

Hub Search, a System app (listed in `apps/system/system-apps.csv`, opens from Start › System, the App Hub
and `hub.html#search`). One box, live results, grouped:

- **Apps**: every app in the category CSVs, by name, category, section and (H48c) the optional
  `description` column. Instant from `hub/core/hub_appindex.js`, then the CSVs fill in sections.
- **Settings**: Settings pages and options from `search_items.js`; opens `apps/system/settings/#<section>`
  or `#<section>/<sub>` (e.g. `#about/device`). Keep that list in step with `apps/system/settings/sec_*.js`.
- **Categories**: opens the App Hub on that category (`#cat=<name>`).
- **Hub actions** (Hub, Desktop mode only): Show desktop, switch workspace (parent `HubWM`).
- **Open windows** (Hub, Desktop mode only): focus a window (parent `__hubTasks`).

Keys: ↑ / ↓ (PageUp / PageDown) pick, Enter opens (Shift+Enter: another window), Esc clears.
Click opens, Shift+click / middle-click opens another window. Apps open like the Start flyout
(`__hubFly.openFromCat`). Standalone, the page searches apps and Settings and opens them in this tab.
`?q=<text>` prefills the box.

Files: `index.html`, `search.js` (data, matching, UI), `search_items.js` (Hub items), `search.css`,
`search_icon.png`. Planned: H48b taskbar 🔍 button after Show desktop, H48c CSV description column,
H48d descriptions for every category (Apps / Games bots).
