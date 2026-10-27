# News

Headlines from Google News (English, India edition) in story cards. Plain HTML/CSS/vanilla JS, no build, no server, no key.

## Files
- `index.html` — redirects to `news.html`
- `news.html` / `news.css` — page, theme variables (`html[data-nt]`), cards, tabs, settings dialog, local notice cards
- `news_store.js` — `NS`: localStorage (`news.*`), settings, `fmtTime` (12 / 24 h), “2 h ago · 5:27 PM”
- `news_feed.js` — `NF`: tabs, feed URLs, fetch (feedrapp.info → allorigins.win fallback), per-tab cache, 2-day keep, seen/new, Saved, places, auto-refresh rule
- `news_notify.js` — `NNotify`: Hub cards via `window.top.HubNotify.notice`, small local card fallback (never toasts)
- `news_settings.js` — `NSet`: theme System / Light / Dark, time format, auto refresh interval
- `news_ui.js` — `NUI`: tabs, story cards, add/remove place, search, refresh
- `news_app.js` — boot
- `news_icon.png`

## Storage (localStorage, `news.` prefix)
`set` {theme,time,every} · `places` [names] · `tab` · `cache` {tabKey:{t,items}} · `seen` {link:ms} (3 days) · `saved` [stories]

## Releases
- **NEWS1** — Story cards (picture if the feed has one, else a coloured source letter; headline; source · time; tap opens in a new tab; ☆ save). Place tabs India + Assam built in, + adds your own (inline input, × removes the selected one). Topic tabs World, Sports, Tech, Business (Google News topic feeds, en-IN). Search box for any topic (temporary tab, × closes). ★ Saved tab, readable offline. New-story red dots (cards and tabs) until you leave the tab. Stories kept 2 days, up to 60 per tab, last lists cached for offline. ↻ refresh any time; auto refresh every 1/2/3/6/9/12/24 h (default 12 = once after 6 AM and once after 6 PM local; others count from the last refresh), open tab only, while the app is open; a notice card reports new stories found by auto refresh. Theme System (follows Hub via `shared/theme/hub_theme.js`) / Light / Dark; 12-hour default with 24-hour option. Phone one column → 2 / 3 / 4 column grid on big screens (picture on top from 1100px).

## Source and limits
- Google News RSS (`news.google.com/rss`, `/rss/search?q=<x>+when:2d`, `/rss/headlines/section/topic/<TOPIC>`, `hl=en-IN&gl=IN&ceid=IN:en`) read through **feedrapp.info** (free RSS→JSON, `Access-Control-Allow-Origin: *`). Fallback **api.allorigins.win/raw** (often slow / 52x).
- Both are free third-party services without uptime guarantees; when both fail the saved list stays on screen.
- Google News RSS carries no pictures, so cards normally show the source letter; pictures appear only if a feed provides them.
- Links go through a news.google.com redirect to the publisher. No summaries (Google's description is just the headline).
- No service worker: the page itself needs the network (or browser cache) to open; lists and Saved are in localStorage.
