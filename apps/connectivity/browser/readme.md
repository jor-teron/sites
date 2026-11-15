# Web Browser (WWW1)

A local Hub web browser: tabs, an address bar that takes URLs or search words, Back / Forward / Reload / Stop / Home,
bookmarks (bar, list and a speed-dial home page) and history (list, search, clear). Static files only, no build, no CDN,
classic scripts, works on `file://`.

## Files
- `browser.html`, `browser.css`: page and styles (phone-first, Hub theme `sites-hub.theme` read only).
- `www_config.js`: every constant (engines, known-blocked hosts, timeouts, texts).
- `www_logic.js`: pure logic (address parsing, blocked check, per-tab back/forward, history, bookmarks).
- `www_store.js`: localStorage, keys `browser_bookmarks`, `browser_history`, `browser_settings`, `browser_tabs`.
- `www_main.js`: UI wiring.
- `www1_icon.py`: draws `browser_icon.png` (IC9 style, reuses `../ic9c_colour_icons.py` helpers; Pillow).
- `tests/www1.test.cjs`: `node apps/connectivity/browser/tests/www1.test.cjs`.

## Embedding limits (honest version)
Each tab is a sandboxed `<iframe>`. Many big sites send `X-Frame-Options` or CSP `frame-ancestors` and refuse to load
inside another page. Checked Nov 2026: Google, YouTube, GitHub, X, Facebook, Instagram, LinkedIn, Reddit, Stack Overflow,
MDN, BBC, OpenStreetMap, DuckDuckGo, Startpage and Brave Search refuse; Wikipedia, Bing, Hacker News, Internet Archive and
example.com load. Known hosts are in `BLOCKED_HOSTS` and show the "This site doesn't allow embedding" card at once with
"Open in new tab". Other refusals can't be detected reliably (the frame still fires `load` on an error page), so a
15 s timeout card and the always-on ↗ button are the fallback.

DuckDuckGo is the default search engine as asked, but its results page refuses framing, so searches show the card.
Bing and Wikipedia results load inline (Settings). Optional setting: open refusing sites straight in a new tab.

Back/Forward is the app's own list of addresses you opened, because a cross-origin frame can't be read. Link clicks inside
a same-origin page are followed; inside other sites they are not. On an https Hub, plain http pages are mixed content
and show a card. Third-party cookies are often blocked, so logins inside frames may fail.

Parked: a text-only reader view through the relay (needs the RL1 cutover).
