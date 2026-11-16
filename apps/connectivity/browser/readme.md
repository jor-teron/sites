# Web Browser (WWW1, WWW2a, WWW2b, WWW2c)

A local Hub web browser: tabs, an address bar that takes URLs or search words, Back / Forward / Reload / Stop / Home,
bookmarks (bar, list and a speed-dial home page) and history (list, search, clear). Static files only, no build, no CDN,
classic scripts, works on `file://`.

## Files
- `browser.html`, `browser.css`: page and styles (phone-first, Hub theme `sites-hub.theme` read only).
- `www_config.js`: every constant (engines, known-blocked hosts, timeouts, texts).
- `www_logic.js`: pure logic (address parsing, blocked check, per-tab back/forward, history, bookmarks; WWW2a relay URLs, routing, health messages; WWW2b session ids, `stripRelay`, clear-cookies request; WWW2c final-URL and Reader helpers).
- `www_store.js`: localStorage, keys `browser_bookmarks`, `browser_history`, `browser_settings`, `browser_tabs`, `browser_relay`, `browser_relay_session`.
- `www_main.js`: UI wiring.
- `www1_icon.py`: draws `browser_icon.png` (IC9 style, reuses `../ic9c_colour_icons.py` helpers; Pillow).
- `tests/www1.test.cjs`, `tests/www2a.test.cjs`, `tests/www2b.test.cjs`, `tests/www2c.test.cjs`: `node apps/connectivity/browser/tests/www1.test.cjs` (and `www2a`, `www2b`, `www2c`).

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
  (15 s) load in the frame as `<base>/www/<secret>/fetch?url=<encoded>&session=<id>`. Everything else loads directly.
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
browser's own history. WWW2c adds the real address after redirects and Reader (below).

## Relay sessions and privacy (WWW2b)
- Each Hub browser gets its own random relay cookie session id (22 URL-safe characters from `crypto.getRandomValues`),
  saved in `browser_relay_session` and sent as `&session=<id>` in every relay URL instead of `default`. The relay keeps
  that session's cookies in memory: logins end after about 30 minutes idle or when the relay restarts.
- Settings > Relay > **Clear relay cookies** sends `POST <base>/www/<secret>/clear?session=<id>` (no custom headers, so no
  CORS preflight) and reports whether anything was cleared. If the relay doesn't list this Hub in `RELAY_WWW_ORIGINS`,
  the answer can't be read; a no-cors POST still goes through and the app says it couldn't confirm.
- **New session** makes a fresh id (logging you out of relayed sites on this device), asks the relay to forget the old
  one (best effort) and reloads relayed tabs.
- Privacy: the secret is part of every relay page address, so the browser's own history may keep it. Settings > Relay
  says so: use the relay only on your own devices, and change `RELAY_TOKEN` if the secret leaks.
- `stripRelay(url, relay)` runs before every save (history, bookmarks, saved tabs) and on the address bar: relay URLs
  (any relay base, nested too) become the original address, and anything still holding the secret is dropped. A pasted
  relay URL opens its original page. Status messages are passed through `redactSecret`; the app never logs to the console.
  Secrets shorter than 6 characters are not scanned for inside URLs (the relay requires 16+).

## Real address after redirects and Reader (WWW2c)
- After a page loads through the relay, the app sends one `HEAD` to the same relay fetch URL (path secret + `?session=`,
  no custom headers, so no CORS preflight) and reads `X-Relay-Final-Url`. If it names another page, the address bar, the
  tab's current Back/Forward step and the newest history entry switch to that original address (`finalUrlFrom`,
  `replaceCurrent`, `replaceHistoryUrl`; always through `stripRelay`, never a relay URL or the secret). Once per navigation.
- Reading the header needs the Hub's origin in `RELAY_WWW_ORIGINS` (relay.conf) **and** the relay sending
  `Access-Control-Expose-Headers: X-Relay-Final-Url`. Relay Server v0.7.0 doesn't send the expose header yet. Until both are in
  place the requested address stays, Settings > Relay shows a one-time hint, and probing stops for that relay config.
- Reader button (📖): hidden by default. Shown only when the relay reports reader support: `modules.reader` (or
  `reader` / `features.reader`) in `/health?format=json`, otherwise one probe per relay config of
  `<base>/www/<secret>/reader?url=https://example.com/` (2xx = shown; 501, 404 and the rest = hidden; a network or CORS failure
  = unknown, hidden). Results are kept in memory only; Test re-checks. When it works, the tab loads
  `<base>/www/<secret>/reader?url=<encoded>&session=<id>` with a "reader" badge. v0.7.0 answers 501, so it stays hidden.
