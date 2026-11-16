# Web Browser (WWW1, WWW2a)

A local Hub web browser: tabs, an address bar that takes URLs or search words, Back / Forward / Reload / Stop / Home,
bookmarks (bar, list and a speed-dial home page) and history (list, search, clear). Static files only, no build, no CDN,
classic scripts, works on `file://`.

## Files
- `browser.html`, `browser.css`: page and styles (phone-first, Hub theme `sites-hub.theme` read only).
- `www_config.js`: every constant (engines, known-blocked hosts, timeouts, texts).
- `www_logic.js`: pure logic (address parsing, blocked check, per-tab back/forward, history, bookmarks; WWW2a relay URLs, routing, health messages).
- `www_store.js`: localStorage, keys `browser_bookmarks`, `browser_history`, `browser_settings`, `browser_tabs`, `browser_relay`.
- `www_main.js`: UI wiring.
- `www1_icon.py`: draws `browser_icon.png` (IC9 style, reuses `../ic9c_colour_icons.py` helpers; Pillow).
- `tests/www1.test.cjs`, `tests/www2a.test.cjs`: `node apps/connectivity/browser/tests/www1.test.cjs` (and `www2a`).

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

## Relay (WWW2a)
Settings > Relay takes your Relay Server base URL (v0.7.0+, ending in `/relay`, e.g. `https://machine.tailnet.ts.net/relay`)
and its secret, saved in `browser_relay` as `{url, secret, enabled}`. It stays off until both are filled in. This is
Jor's own relay-server (port 9000 behind Tailscale Funnel), not the shared Hub relay RL1.

- Routing (`routeFor`): with the relay on, known-blocked sites, plain http pages on an https Hub and pages that time out
  (15 s) load in the frame as `<base>/www/<secret>/fetch?url=<encoded>&session=default`. Everything else loads directly.
  Without a relay (or when it's off) the "Open in new tab" cards stay as before.
- Menu > Load through relay / Load directly switches the current tab, and the choice sticks for that tab. Cards get a
  "Load through relay" button when the relay is set; the relay timeout card offers "Load directly".
- A purple "via relay" badge shows on the tab and in the address bar. The address bar, history and bookmarks always
  keep the original address, never the relay URL.
- Test calls `<base>/health?format=json` (version and whether www is on), then checks the secret with
  `<base>/www/<secret>/fetch` and no url (400 = accepted, 401/403 = wrong). If the fetch fails on CORS, a no-cors probe
  only proves the relay answered.
- When the relay shares the Hub's origin, relay frames drop `allow-same-origin` so proxied sites can't reach the app.

Limits: the iframe can't see relay error codes, so a failed relay load just shows the relay's error text or the timeout card.
Scripts on relayed pages that fetch data still call the real site. The secret is in the frame URL, so it can show up in the
browser's own history. Coming next: WWW2b (per-device session, clear relay cookies, privacy notes) and WWW2c (real
address after redirects, Reader).
