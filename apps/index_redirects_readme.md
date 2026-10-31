# index.html redirect pages (IX releases)

Every app folder has an `index.html` that only forwards to the real page (e.g. `whiteboard/index.html` → `whiteboard.html`).

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
- To do: Media, Office, About, Favorite, Settings, `tv/`.
- Not ours: Games and Learn (Hub Games Bot), `apps/system/` and root `index.html` (Hub Main Bot).

## Legacy code notes
- Old pages had a visible `<meta http-equiv="refresh">` in `<head>` and `<body><p><a href="<page>">Open <App></a></p></body>`. File Drop's had a fixed dark body colour. Each converted page keeps a one-line comment at the top describing the old form.
