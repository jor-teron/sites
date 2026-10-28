# Settings (apps/system/settings/)

Hub settings app. Opens from the Hub menu's **Settings** row (a window in Desktop mode,
full screen on phone). Deep links: `apps/system/settings/#wallpaper`, `#desktop`, `#sizes`, `#look`, `#keys` (H28; `#keys/<name>` jumps to that key's row), `#howto`, `#about` (`#about/profile` H30.1, `#about/device` H46).

| File | What |
|---|---|
| index.html | Page shell, loads the scripts below |
| settings.css | Layout (list left / options right, phone: list → section with ‹ Back), jelly presses |
| settings_store.js | `SettingsStore` get/set of `sites-hub.*` keys + postMessage `{type:'hub-prefs'}` to the Hub |
| settings.js | `Settings` shell: section registry, hash routing, UI helpers |
| sec_wallpaper.js | Wallpapers (from `hub/drives/hub_wallpapers.js`) + custom colour. R36: the picture grid shows the 320 px WebP thumbs (`shared/wallpaper/thumbs/`, made by `hub/core/hub_wallthumbs_gen.py`), lazy, full image as fallback; only the chosen wallpaper loads at full size |
| sec_desktop.js | Auto / Desktop / Phone mode, Open windows maximised (`openMax`, R51, default on), Show Files on the desktop (`showFiles`, H7, default on; hides the Files icon pane on the Desktop home), Start-on-hover, busy meter, Screen saver minutes 0–240, 0 = Off, unset 5 (`saverIdle`, R49b) + Second hand Smooth / Quartz / Off (`saverSec`, R49c, Preview when the Hub's `HubSaver` is reachable) |
| sec_sizes.js | Taskbar position bottom/top, size 32/40/48, title bar 24/28/34 |
| sec_look.js | Accent, Dark/Light, animations On/Reduced/Off |
| sec_keys.js | H28 API Keys: one row per key from `hub/core/hub_keys.js` (`HubKeys.KNOWN`: tavily, gemini, openai_base, openai_key, ollama_url; H28.1: groq, openrouter, deepseek, xai) + custom keys; masked input + reveal, Save, Test (Tavily /usage, Gemini model list, Ollama /api/tags, OpenAI-compatible /models; Groq / DeepSeek / xAI /models, OpenRouter /api/v1/key), Delete; Add custom key; the keys guide `hub/keys.readme.md` folded at the bottom. Stored in `sites-hub.keys` (JSON), only in this browser |
| sec_howto.js | How-to: plain help on the Hub, desktop, windows, taskbar, copies, modes, phone, updates, privacy / tech |
| sec_about.js | About: Credit, Current release (date from hub/version.txt), Release date, Check for update, GitHub contact / issues. H46: **Device name** card (`#about/device`): this device's SharedLink name (`shared-link-device-name`, max 40, empty = guessed default), moved here from the Hub's 🎮 Devices pop-up; Save uses the Hub's `SharedLinkDevices.setName()` (live link + `hub-device-name` event), or on its own `shared/link/link_devices.js` (Hub tabs follow the `storage` event) |

The Hub applies the keys live in `hub/core/hub_prefs.js`. Keys: `wallpaper`, `taskPos`, `taskH`, `titleH`,
`accent`, `theme`, `motion`, `wmMode`, `openMax` (R51: '1' / empty = new windows maximised, '0' = normal size), `startHover`, `saverIdle` (Hub R49b screen saver: minutes 0..240, 0 = Off, empty = 5), `saverSec` (R49c: smooth (default) | quartz | off).

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
