# index.html redirect pages (IX releases)

Every app folder has an `index.html` that only forwards to the real page (e.g. `whiteboard/index.html` → `whiteboard.html`).

**Rule (IX8): `index.html` is always a redirect; the real page is named after the folder** (`<folder>/<folder>.html`). Never put a real page in `index.html`.

## IX1 rule (31 Oct 2026)
- No visible body text: the old "Open <App>" link flashed on screen before the redirect. It now sits in `<noscript>`.
- The redirect is the `<script>` in `<head>`: `location.replace('<page>' + location.search + location.hash)`, so `?code=` / `#code=` links keep working (some old pages dropped them).
- `<meta http-equiv="refresh">` moved into `<noscript>`. A visible meta refresh could race the script and drop the `#hash`.
- Background follows the Hub theme: `localStorage['sites-hub.theme']` (`'dark'` = dark, anything else set = light). If unset, it follows the device's `prefers-color-scheme`. Light `#fff`, dark `#121418`.
- GitHub Pages can't send HTTP header redirects, so a head redirect is the closest we get.
- Template: copy any converted page, e.g. `apps/connectivity/video-chat/index.html`.

## Progress (category by category)
- IX1 Connectivity: done (13 pages).
- IX2 Tools: done (16 pages, incl. the 4 "Moved" stubs to apps/system/ and live-subtitle-assam → caption-for-nei).
- IX3 Lab: done (27 pages, incl. the "Moved" stubs to games/, office/ and renamed apps).
- IX4 Media: done (15 pages; media/phone's real page was index.html then; moved to phone.html in IX8).
- IX5 Office: done (12 pages).
- IX6 Games: done (23 pages, done by Hub Apps Bot at Jor's request; Learn is Hub Games Bot's NIX-L1).
- IX7 leftovers: done (9 pages: 6 Tools pages that used `window.location.href` with no meta refresh, so the IX2 search missed them — msword_diff, weather-chart, weather-hourly, caption-for-nei, learning-html, calculator-beta — plus About (keeps its `#about` default), Favorite, Settings).
- IX8 real pages moved out of `index.html` (git mv, history kept) into `<folder>.html`, with a template redirect left as `index.html`: tools/speedtest, tools/nei-dict, tools/phonekey, lab/gdrive-test, connectivity/webrtc-chat, media/phone. Internal links to `index.html` in nei-dict and media/phone now point at the new file.
- `tv/`: excluded by Jor (left as is).
- Not ours: Learn (Hub Games Bot, NIX-L1), `apps/system/` and root `index.html` (Hub Main Bot).

## Legacy code notes
- Old pages had a visible `<meta http-equiv="refresh">` in `<head>` and `<body><p><a href="<page>">Open <App></a></p></body>`. File Drop's had a fixed dark body colour. Each converted page keeps a one-line comment at the top describing the old form.
