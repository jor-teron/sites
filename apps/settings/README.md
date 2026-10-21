# Settings (apps/settings/)

Hub settings app. Opens from the Hub menu's **Settings** row (a window in Desktop mode,
full screen on phone). Deep links: `apps/settings/#wallpaper`, `#desktop`, `#sizes`, `#look`, `#howto`, `#about`.

| File | What |
|---|---|
| index.html | Page shell, loads the scripts below |
| settings.css | Layout (list left / options right, phone: list → section with ‹ Back), jelly presses |
| settings_store.js | `SettingsStore` get/set of `sites-hub.*` keys + postMessage `{type:'hub-prefs'}` to the Hub |
| settings.js | `Settings` shell: section registry, hash routing, UI helpers |
| sec_wallpaper.js | Wallpapers (from `hub/drives/hub_wallpapers.js`) + custom colour |
| sec_desktop.js | Auto / Desktop / Phone mode, Start-on-hover, busy meter, Screen saver minutes 0–240, 0 = Off, unset 5 (`saverIdle`, R49b) + Second hand Smooth / Quartz / Off (`saverSec`, R49c, Preview when the Hub's `HubSaver` is reachable) |
| sec_sizes.js | Taskbar position bottom/top, size 32/40/48, title bar 24/28/34 |
| sec_look.js | Accent, Dark/Light, animations On/Reduced/Off |
| sec_howto.js | How-to: plain help on the Hub, desktop, windows, taskbar, copies, modes, phone, updates, privacy / tech |
| sec_about.js | About: Credit, Current release (date from hub/version.txt), Release date, Check for update, GitHub contact / issues |

The Hub applies the keys live in `hub/core/hub_prefs.js`. Keys: `wallpaper`, `taskPos`, `taskH`, `titleH`,
`accent`, `theme`, `motion`, `wmMode`, `startHover`, `saverIdle` (Hub R49b screen saver: minutes 0..240, 0 = Off, empty = 5), `saverSec` (R49c: smooth (default) | quartz | off).

## Hub version: `hub/version.txt`

The single source of the Hub version. Plain text, exactly 2 lines, nothing else:

```
v0.299
2026-10-19
```

Line 1 = version (internal only, not displayed anywhere since R41), line 2 = date of
the current release (`YYYY-MM-DD`, shown as "Current release"). Read with `cache: 'no-cache'`
by `hub/update/hub_update.js` and `sec_about.js`; "—" shows when it can't be read. Bump it with
each release (together with the `?v=` tags and `hub-shell-vN` in `hub/update/hub_sw.js`).
