# Read Aloud

A standalone Tools app that reads News headlines or pasted / opened text aloud, using the browser's built-in voice. Plain HTML/CSS/vanilla JS, no build, no server, no API key.

## Files
- `index.html` — redirects to `read-aloud.html`
- `read-aloud.html` / `read-aloud.css` — page, theme variables (`html[data-ra]`), cards, player, settings dialog
- `ra_store.js` — `RAStore`: localStorage (`readaloud.*`), settings, per-source playback position
- `ra_text.js` — `RAText`: strip basic markdown symbols, split into sentences (no DOM; works in Node)
- `ra_speech.js` — `RASpeech`: speechSynthesis wrapper, voiceschanged wait, default en-IN voice
- `ra_news.js` — `RANews`: News tabs and lists via `apps/media/news/news_store.js` (`NS`) and `news_feed.js` (`NF`)
- `ra_ui.js` — source switch, lists, player, settings, keyboard, boot. `RELEASE = 'RA1'`
- `read-aloud_icon.svg`

The News app is not modified. This app only reads `news.*` cache, places, Saved, and seen (to honour "only new stories"). Refresh may update the shared News cache. It does not write News settings, seen, Saved, or places.

## Storage (localStorage, `readaloud.` prefix)
`theme` auto / light / dark · `rate` · `pitch` · `voice` (voiceURI) · `onlyNew` · `source` news / text · `newsTab` · `text` · `pos.news.<tab>` / `pos.text` `{i, id}`

## Releases
- **RA1** — Two sources: News and Text. News shows the same tabs as the News app (India, Assam, your places, World, Sports, Tech, Business, Saved), reuses the News cache, and works offline with cached and Saved stories. Each item is read as "source, time ago, headline"; the current item is highlighted; Open opens the story in a new tab; tap an item to start from there. Optional "only new stories" (stories not in News's seen list; this app does not mark them seen). Text: paste, or open a .txt / .md file; sentences are highlighted as they are read. Player: play / pause, previous, next, stop. Keys: Space, left / right arrows, Esc to stop. Position is remembered per source. Settings: voice (English India if available), speed 0.75x-2x, pitch 0.5-1.5, only-new toggle, theme Auto (follows the Hub) / Light / Dark, test voice. In-app dialogs only.

## Limits
- Uses the device's speechSynthesis voices. If the browser has no engine or no voices, an in-app message is shown.
- Chrome can cut off very long utterances; RA1 speaks one headline or one sentence at a time to avoid that.
- Pause on some browsers cancels the current utterance and Play starts that item again from the beginning.
- News full article text is not fetched (publishers often block it). Headlines only, same as the News app.
- Pasted text is stored in localStorage, capped at 200,000 characters.
- The Hub tiles page (`apps/tools/tools.html`) picks this up from `tools-apps.csv`. Hub Search / `hub_appindex.js` may need a Hub-side regenerate after this is merged; this release does not edit Hub files.
