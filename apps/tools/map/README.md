# Map (MAP1)

Minimal full-screen OpenStreetMap.

- **My location** — one geolocation read; flies there with a blue dot and accuracy circle.
- **Search** — Nominatim (`nominatim.openstreetmap.org/search`), only on submit, up to 5 results; tap one to fly there and drop a pin.
- Remembers last view (center + zoom) in localStorage `map-settings-v1`.
- Leaflet 1.9.4 vendored in `vendor/leaflet/` (copied from Live Location). Needs internet for tiles and search.

Files: `map.html` (page), `map.css`, `map_view.js` (map, tiles, saved view, markers), `map_search.js` (Nominatim), `map_app.js` (wiring), `index.html` (redirect only).
