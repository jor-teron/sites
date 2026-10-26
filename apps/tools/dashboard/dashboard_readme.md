# My Day — Personal Dashboard

One offline-first page showing what matters today. Works on phone (stacked list), tablet/PC (grid) and Android TV (arrow keys move focus). Plain HTML/CSS/vanilla JS, no build.

## Files
- `index.html` — redirects to `dashboard.html`
- `dashboard.html` / `dashboard.css` — shell page and styles (light/dark, jelly effects)
- `dashboard_store.js` — localStorage wrapper (`myday.*` keys)
- `dashboard_core.js` — card registry (`MyDay.register({id,title,render,defaultOn})`), layout, clock/greeting, alerts API (`MyDay.alert(key,text,'high'|'med')`, `MyDay.clearAlert(key)`), theme
- `dashboard_settings.js` — Settings dialog: theme auto/light/dark, cards on/off and up/down order
- `dashboard_app.js` — boot, arrow-key navigation, service worker registration
- `cards/` — one file per card: `card_todo.js`, `card_schedule.js`, `card_notes.js`, `card_links.js`
- `dashboard_sw.js` — cache-first service worker (bump `VER` when files change); `manifest.json`, icons

Adding a card: create `cards/card_x.js` calling `MyDay.register(...)`, add a `<script>` in `dashboard.html` and the path in `dashboard_sw.js`.

## Releases
- **PD1** — top strip (date, live time, greeting, alert area), card frame, Settings, Todo, Notes, Today's Schedule, Quick Links, offline PWA.

## Roadmap
- **PD2** — Weather (current, hourly, 3 days) + rain/heat/storm alerts via Open-Meteo (no key), cached offline
- **PD3** — Bills + Expenses (due dates, amounts, monthly total) with optional PIN
- **PD4** — Family card: medicine times, water tracker, birthdays in next 7 days, shopping list with total
- **PD5** — News: local / Assam / national headlines (title + summary)
- **PD6** — TV mode (bigger text, remote nav, auto-refresh 15 min) + power/network log
