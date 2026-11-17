# Weather Forecast — Weather, Tools

Live weather for any place, in one page: current conditions, a 7-day outlook, today's curve,
the next 12 hours and a few details. Plain HTML/CSS/classic JS, no build step, no API key.

Data comes from Open-Meteo (forecast API and geocoding API), which is free and needs no sign-in.
The page works from `file://` once a reading is cached.

## Files
- `weather-forecast.html` — the page (Hub theme via `shared/theme/hub_theme.js`)
- `index.html` — redirect entry point that keeps `?query` and `#hash`
- `weather-forecast_config.js` — place, API request, cache/prefs keys, chart geometry, all text
- `weather-forecast_format.js` — pure helpers: WMO code map, temperatures and units, clock/day labels,
  freshness, wind direction, probability
- `weather-forecast_data.js` — fetch with timeout, normalise, 10-minute cache, offline fallback,
  `nextHours()`, `searchPlaces()`
- `weather-forecast_app.js` — render, SVG icons, canvas curve, place dialog, unit switch, states
- `weather-forecast.css` — light/dark palette, phone-first layout
- `tests/` — `node --test` files for the pure helpers and the data layer

## Behaviour
- **Cache** `sites-hub.weather-forecast.v3` — last reading with its timestamp; shown instantly, and
  offline it is shown with an "Offline — showing weather from …" note. Fresh for 10 minutes, then
  refetched on load, on the tab becoming visible, and on `online`.
- **Prefs** `sites-hub.weather-forecast.prefs` — unit (`c`/`f`), chosen place, and whether the phone
  day list is expanded.
- **Place** — default Diphu, Assam (25.8436, 93.4303). Tap the place name to search any town or city
  through Open-Meteo geocoding; the choice is remembered.
- **Units** — °C with km/h, or °F with mph; the header button switches everything including the curve.
- **States** — loading, error with Try again, offline banner; the refresh button spins while fetching.
- **Chart** — canvas at device pixel ratio (max 3×), redrawn on resize and on a Hub theme change,
  labels every three hours that skip when they would collide or sit on the now line.

## Notes
- No `?v=` cache strings on assets; the Hub service worker revalidates same-origin files.
- No ES modules, no framework, no CDN: load order in the page is config → format → data → app.
- Adding a field: request it in `weather-forecast_config.js`, normalise it in `weather-forecast_data.js`,
  then render it; bump the cache key if the stored shape changes.
- WMO codes are mapped in `weather-forecast_format.js`; unknown codes fall back to a cloud.

## Releases
- **WX1a** — page shell, live current conditions (temperature, feels-like, condition, humidity, wind,
  today's high/low), 10-minute cache, loading/error/offline, inline SVG icons, Hub theme.
- **WX1b** — 7-day forecast with rain chance and high/low; three days on phones with a remembered
  "Show all 7 days"; cache v2.
- **WX1c** — today's hourly curve on HiDPI canvas with now marker, accent gradient, overlap-aware
  labels and a screen-reader table; cache v3.
- **WX1d** — next-12-hours strip (crossing midnight) and Details chips (gusts, rain now, sunrise, sunset).
- **WX1e** — °C/°F with km/h/mph, place picker with geocoding search, both remembered.
- **WX1f** — 128 px icon, this README, CSV description, final polish.
