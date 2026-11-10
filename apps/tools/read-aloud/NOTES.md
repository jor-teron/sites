# Read Aloud

A standalone Tools app that reads News headlines, pasted or opened text, PDFs, and web pages aloud, using the browser's built-in voice. Plain HTML/CSS/vanilla JS, no build, no server, no API key.

## Files
- `index.html` -- redirects to `read-aloud.html`
- `read-aloud.html` / `read-aloud.css` -- page, theme variables (`html[data-ra]`), cards, player, settings and sleep dialogs
- `ra_store.js` -- `RAStore`: localStorage (`readaloud.*`), settings, per-source playback position
- `ra_text.js` -- `RAText`: strip basic markdown, split into sentences, word count and estimated reading time (no DOM; works in Node)
- `ra_speech.js` -- `RASpeech`: speechSynthesis wrapper, voiceschanged wait, default en-IN voice
- `ra_news.js` -- `RANews`: News tabs and lists via `apps/media/news/news_store.js` (`NS`) and `news_feed.js` (`NF`)
- `ra_web.js` -- `RAWeb`: fetch a page through the News HTML relay (`api.allorigins.win`) and extract readable text with regex/string parsing (no DOM). Google News link resolve is best-effort.
- `ra_pdf.js` -- `RAPdf`: lazy-loads Mozilla pdf.js from `shared/vendor/pdfjs/` (3.11.174 legacy UMD, Apache-2.0, the same copy PDF Tools uses) only when a PDF is opened. Extracts text page by page.
- `ra_ui.js` -- source switch, lists, player, sleep timer, settings, keyboard, boot. `RELEASE = 'RA2'`
- `ra_helpers_test.js` -- Node helper tests (no DOM). Not loaded by the page.
- `read-aloud_icon.svg`

The News app is not modified. This app only reads `news.*` cache, places, Saved, and seen (to honour "only new stories"). Refresh may update the shared News cache. It does not write News settings, seen, Saved, or places.

pdf.js is referenced by relative path (`../../../shared/vendor/pdfjs/pdf.min.js` and `pdf.worker.min.js`), not copied into this folder. That path is the same one PDF Tools uses, so it is not fragile when the Hub is served from the repo root. Licence: `shared/vendor/pdfjs/LICENSE-pdf.js.txt` (Apache-2.0).

## Storage (localStorage, `readaloud.` prefix)
`theme` auto / light / dark · `rate` · `pitch` · `voice` (voiceURI) · `onlyNew` · `source` news / text / pdf / web · `newsTab` · `text` · `webUrl` / `webTitle` / `webText` · `pdfName` (the file is not stored; open it again after a reload) · `sleep` off / 5 / 10 / 15 / 30 / 60 / item · `pos.news.<tab>` / `pos.text` / `pos.pdf` / `pos.web` `{i, id, page}`

## Releases
- **RA1** -- Two sources: News and Text. News shows the same tabs as the News app, reuses the News cache, and works offline with cached and Saved stories. Each item is read as "source, time ago, headline". Player, keys, voice / speed / pitch, Auto / Light / Dark, only-new option. In-app dialogs only.
- **RA2** -- PDF and Web sources, Read article on News stories, sleep timer, word count and estimated reading time (about 160 words/min, scaled by speed) for Text, PDF and Web. Last source tab and per-source position are remembered (already started in RA1; extended here).

## PDF
Open a `.pdf` from the device. Text is extracted page by page with pdf.js, then read sentence by sentence. A page indicator and Go to page jump to the first sentence of that page. pdf.js is loaded only when you open a PDF (it is heavy for a 4 GB Celeron). If a PDF has no text layer (a scan), an in-app message says so and points you to the OCR app in Office. Password-protected PDFs cannot be read. The PDF file itself is not saved in localStorage; after a reload, open the same file again to continue.

## Web pages and Read article
Paste a URL and Fetch, or tap Read article on a News headline. The page is fetched through **api.allorigins.win** (raw, then the JSON `/get` fallback), the same free relay News uses for HTML/XML. News also uses feedrapp.info, but that is RSS-only, so it is not used here. Readable text prefers `<article>`, otherwise the `<p>` / `<h1>`-`<h3>` text in `<main>` or `<body>`, after stripping nav, footer, aside, script and style. The page title is shown and read first.

Google News links usually redirect to the publisher. The app tries to decode an embedded publisher URL, follow a canonical / refresh / outbound link on a Google interstitial, and fetch that page. **This often fails:** the relay can be down or rate-limited, many publishers block it or serve a login / cookie wall / JavaScript shell, and Google News destinations are not always recoverable. When Read article cannot load the story, an in-app message says so and the headline is read instead. You can always paste the article text on the Text tab.

## Sleep timer
Off, or stop after 5 / 10 / 15 / 30 / 60 minutes, or at the end of the current item. A countdown chip sits in the player bar; the same choices are in Settings. When a timed period runs out mid-sentence, reading stops after that sentence.

## Limits
- Uses the device's speechSynthesis voices. If the browser has no engine or no voices, an in-app message is shown.
- Chrome can cut off very long utterances; one headline or one sentence is spoken at a time to avoid that.
- Pause on some browsers cancels the current utterance and Play starts that item again from the beginning.
- Pasted text and fetched article text are stored in localStorage, capped at 200,000 characters.
- The Hub tiles page (`apps/tools/tools.html`) picks this up from `tools-apps.csv`. Hub Search / `hub_appindex.js` may need a Hub-side regenerate after this is merged; this release does not edit Hub files.
