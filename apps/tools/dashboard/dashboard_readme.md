# My Day — Personal Dashboard

One offline-first page showing what matters today. Works on phone (stacked list), tablet/PC (grid) and Android TV (arrow keys move focus). Plain HTML/CSS/vanilla JS, no build.

## Files
- `index.html` — redirects to `dashboard.html`
- `dashboard.html` / `dashboard.css` — shell page and styles (light/dark, jelly effects)
- `dashboard_store.js` — localStorage wrapper (`myday.*` keys)
- `dashboard_core.js` — card registry (`MyDay.register({id,title,render,defaultOn})`), layout, clock/greeting, alerts API (`MyDay.alert(key,text,'high'|'med')`, `MyDay.clearAlert(key)`), theme
- `dashboard_settings.js` — Settings dialog: theme auto/light/dark, cards on/off and up/down order
- `dashboard_app.js` — boot, arrow-key navigation, service worker registration
- `cards/` — one file per card: `card_weather.js`, `card_todo.js`, `card_schedule.js`, `card_notes.js`, `card_links.js`
- `dashboard_sw.js` — cache-first service worker (bump `VER` when files change); `manifest.json`, icons

Adding a card: create `cards/card_x.js` calling `MyDay.register(...)`, add a `<script>` in `dashboard.html` and the path in `dashboard_sw.js`.

## Releases
- **PD1** — top strip (date, live time, greeting, alert area), card frame, Settings, Todo, Notes, Today's Schedule, Quick Links, offline PWA.
- **PD2** — Weather card (first, on by default) via Open-Meteo, no key: now (temp, feels-like, condition, humidity, wind), next 12 hours, next 3 days (min/max, rain chance). Place via “Use my location” or name search; saved in `myday.weather.place`. Last data cached in `myday.weather.cache` with “Updated HH:MM”, stale/offline notice, auto-refresh if older than 30 min, ↻ button. Top-strip alerts: heavy rain (≥70% or ≥20 mm), heat (max ≥38 °C), thunderstorm (WMO 95–99), strong wind (gusts ≥50 km/h). Service worker never caches API calls.
- **PD2.1** — Sun & Moon card (after Weather, on by default), fully offline: NOAA solar formulas (`dashboard_sun.js`) for sunrise, sunset, solar noon/midnight, civil dawn/dusk and day length at the Weather card's saved place (fallback Guwahati); countdown to next event. Moon phase, % lit, next full/new moon (mean synodic month). 24-hour SVG dial: noon at top, midnight at bottom, day/night split by the sunrise–sunset chord, civil-twilight band, now hand, sun and moon on the rim. Refreshes every minute.

## Roadmap
- **PD3** — Bills + Expenses (due dates, amounts, monthly total) with optional PIN
- **PD4** — Family card: medicine times, water tracker, birthdays in next 7 days, shopping list with total
- **PD5** — News: local / Assam / national headlines (title + summary)
- **PD6** — TV mode (bigger text, remote nav, auto-refresh 15 min) + power/network log
