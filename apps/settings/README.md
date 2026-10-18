# Settings (apps/settings/)

Hub settings app. Opens from the Hub menu's **Settings** row (a window in Desktop mode,
full screen on phone). Deep links: `apps/settings/#wallpaper`, `#desktop`, `#sizes`, `#look`, `#about`.

| File | What |
|---|---|
| index.html | Page shell, loads the scripts below |
| settings.css | Layout (list left / options right, phone: list → section with ‹ Back), jelly presses |
| settings_store.js | `SettingsStore` get/set of `sites-hub.*` keys + postMessage `{type:'hub-prefs'}` to the Hub |
| settings.js | `Settings` shell: section registry, hash routing, UI helpers |
| sec_wallpaper.js | Wallpapers (from `hub/hub_wallpapers.js`) + custom colour |
| sec_desktop.js | Auto / Desktop / Phone mode, Start-on-hover |
| sec_sizes.js | Taskbar position bottom/top, size 32/40/48, title bar 24/28/34 |
| sec_look.js | Accent, Dark/Light, animations On/Reduced/Off |
| sec_about.js | Version, Check for update, About / Contact / Feedback (moved from apps/about) |

The Hub applies the keys live in `hub/hub_prefs.js`. Keys: `wallpaper`, `taskPos`, `taskH`, `titleH`,
`accent`, `theme`, `motion`, `wmMode`, `startHover` (empty = default).
