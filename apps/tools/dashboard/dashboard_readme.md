# My Day — Personal Dashboard

One offline-first page showing what matters today. Works on phone (stacked list), tablet/PC (grid) and Android TV (arrow keys move focus). Plain HTML/CSS/vanilla JS, no build.

## Files
- `index.html` — redirects to `dashboard.html`
- `dashboard.html` / `dashboard.css` — shell page and styles (light/dark, jelly effects)
- `dashboard_store.js` — localStorage wrapper (`myday.*` keys)
- `dashboard_core.js` — card registry (`MyDay.register({id,title,render,defaultOn})`), layout, clock/greeting, alerts API (`MyDay.alert(key,text,'high'|'med')`, `MyDay.clearAlert(key)`), theme
- `dashboard_settings.js` — Settings dialog: theme auto/light/dark, cards on/off and up/down order
- `dashboard_app.js` — boot, arrow-key navigation, service worker registration
- `cards/` — one file per card: `card_weather.js`, `card_todo.js`, `card_schedule.js`, `card_notes.js`, `card_links.js`, `card_news.js`, `card_phone.js`
- `dashboard_sw.js` — cache-first service worker (bump `VER` when files change); `manifest.json`, icons

Adding a card: create `cards/card_x.js` calling `MyDay.register(...)`, add a `<script>` in `dashboard.html` and the path in `dashboard_sw.js`.

## Releases
- **PD1** — top strip (date, live time, greeting, alert area), card frame, Settings, Todo, Notes, Today's Schedule, Quick Links, offline PWA.
- **PD2** — Weather card (first, on by default) via Open-Meteo, no key: now (temp, feels-like, condition, humidity, wind), next 12 hours, next 3 days (min/max, rain chance). Place via “Use my location” or name search; saved in `myday.weather.place`. Last data cached in `myday.weather.cache` with “Updated HH:MM”, stale/offline notice, auto-refresh if older than 30 min, ↻ button. Top-strip alerts: heavy rain (≥70% or ≥20 mm), heat (max ≥38 °C), thunderstorm (WMO 95–99), strong wind (gusts ≥50 km/h). Service worker never caches API calls.
- **PD2.1** — Sun & Moon card (after Weather, on by default), fully offline: NOAA solar formulas (`dashboard_sun.js`) for sunrise, sunset, solar noon/midnight, civil dawn/dusk and day length at the Weather card's saved place (fallback Guwahati); countdown to next event. Moon phase, % lit, next full/new moon (mean synodic month). 24-hour SVG dial: noon at top, midnight at bottom, day/night split by the sunrise–sunset chord, civil-twilight band, now hand, sun and moon on the rim. Refreshes every minute.

- **PD2.2** — Sun & Moon dial fills its box (tight viewBox), card spans 2 columns on ≥900px with dial (clamp 320–520px) beside the list; phone: full-width dial, list below. Centre hand removed; curved progress arrow along the rim (sunrise→now by day, sunset→now at night, dimmer), arrowhead at the sun. Bigger rim labels outside the rim; place name below the centre. No hour ticks. Test hook `?now=HH:MM`.
- **PD3** — AQI inside the Weather card: Open-Meteo air-quality (`current=us_aqi,pm2_5`), coloured US-AQI pill (Good → Hazardous) + PM2.5, cached in `myday.weather.aqi`, hidden when offline/no data; AQI >100 adds a top-strip alert. Today strip under the date: today's fixed-date holiday (from Calendar's `calendar_holidays.js`) and “N todos · N events left”, refreshed on tick and on Todo/Schedule saves (`dashboard_today.js`).

- **PD4** — Habits card: add/remove habits, tap pill (jelly bounce) ticks today (local date key → resets at midnight), 🔥 streak, 7-day dot strip; store `myday.habits`. Water card: SVG glass fills with wobble, progress ring “5/8 · 1.25 L”, +1 glass / undo, 7-day dots; glass size (250 ml) and goal (8) in Settings; store `myday.water.*`. Today strip counts split into two pills (wrap cleanly on phones).
- **PD4.1** — All displayed times use 12-hour format with AM/PM via shared `MDStore.fmtTime` (clock, Schedule, Sun & Moon list + dial, weather hourly as compact `3 PM`, Updated time). Stored values and time inputs stay HH:MM.
- **PD4.2** — Sun & Moon dial flips 180° at night (sunset→sunrise): midnight on top with starry night half, day half below; 0.8 s jelly rotation on switch; rim labels and moon counter-rotate to stay upright, place name outside the rotating group. Moon position is derived from phase (lags sun by phase × 24 h), not an ephemeris. Settings: Time format 12-hour (default) / 24-hour in `myday.timefmt`, used by `MDStore.fmtTime`.
- **PD4.3** — Sun & Moon dial uses clock time: 12:00 top, 18:00 right, 00:00 bottom, 06:00 left (clockwise). Faint fixed 6 AM–6 PM reference line through the centre; sunrise–sunset chord placed by clock so it tilts naturally. Solar noon is a small rim dot (label removed; time stays in the list). Sun, moon, progress arc, labels and the PD4.2 night flip all use clock angles.
- **PD4.4** — Dial moon is a silver-grey SVG (#cfd4dc, slightly lighter in dark) with a soft cool glow, drawn in its current phase from `MDSun.moon().phase` (semicircle + terminator ellipse; waxing lit right, waning lit left, northern view); dark part faint with outline. Stays upright through the night flip. Sun unchanged.
- **PD8** — News card: top 5 headlines (title, source, “2 h ago · time” via `MDStore.fmtTime`), tap opens in a new tab; Assam / India toggle (`myday.news.region`); ↻ refresh, auto-refresh if older than 30 min; last list cached in `myday.news.cache` and shown offline with “offline, showing saved”. Source: Google News RSS (Assam = search `Assam when:2d`, India = top stories) via feedrapp.info (free RSS→JSON, CORS `*`, no key), fallback allorigins.win raw XML. Limits: third-party free services with no uptime guarantee; links go via news.google.com redirect; headlines only (no summary). Phone card: battery % bar + charging / time left with live updates (`navigator.getBattery`, Chrome/Edge/Android only), low-battery (≤15%, not charging) top-strip alert; “This app's storage” used / allowed (`navigator.storage.estimate`). Unsupported parts hidden. SW `myday-pd8`, `?v=20261027pd8` on all local tags.

## Roadmap
- **PD3** — AQI in Weather + Today strip (done)
- **PD4** — Habits + Water (done)
- **PD5** — Countdown: named dates, nearest big, past auto-drop
- **PD6** — Bills + Expenses (due dates, amounts, monthly total) with optional PIN
- **PD7** — Family card: medicine times, birthdays in next 7 days, shopping list with total
- **PD8** — News: Assam / India headlines (done) + Phone card (battery, storage)
- **PD9** — TV mode (bigger text, remote nav, auto-refresh 15 min) + power/network log
