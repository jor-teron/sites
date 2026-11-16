# English Letters

Offline-first Learn app, modelled on Hindi Letters (as of HL-3a) and Assamese Letters (AL-1). Open `english-letters.html` (or the one-hop `index.html`). Classic scripts, no dependencies, no network calls or bundled fonts (uses the device's Latin font, e.g. Noto Sans, Segoe UI, DejaVu Sans). It uses the Hub theme (`shared/theme/hub_theme.js`) and the Learn title-bar contract (`apps/learn/shared/learn-hubbar.js`) without modifying shared files. Default theme is Auto (Hub selection, else OS). All progress/settings use `learn.english-letters.*` localStorage; unavailable storage does not block practice.

## EL-1

- Chart of 26 letters A–Z. Each tile shows the capital and the small letter, plus the letter name. The letter card has the name, the phonics sound (for example "a as in apple"), a picture word, Hear letter / Hear sound / Hear word, Mark learned, and tracing for both forms.
- Square 140px letter tiles with a 20px gap. Letter card (960px) with the bigger trace box (up to 480px) and live Covered / On the guide progress bars under the stars.
- Tracing uses a simple school-print stroke order, with numbered arrows. Fonts vary, so follow the faint shape as well. Capital and small forms are saved separately; the tile badge shows the better result.
- Lessons: vowels and consonants (Y is a consonant at the start of a word and a vowel in sky, gym, happy); capital and small pairs; 8 digraphs (sh ch th wh ph ck ng qu) and 20 blends (bl cl fl gl pl sl br cr dr fr gr pr tr st sm sn sw tw sk sp); CVC three-letter words for short a e i o u; 64 common sight words (the, is, a, and, to, I, you, …).
- Numbers 0–10 with English spellings (zero one two three four five six seven eight nine ten).
- 150 picture words in eight themes (fruits, animals, family, colours, body, home and town, nature, food). India-friendly examples include mango, roti, rickshaw, auto, peacock, jamun, idli, lassi, chilli and chikoo. Search in English. Every word is lowercase a–z only.
- Five ten-question games (Match capital & small, Listen & pick, First letter, Spell the word, Missing letter), best stars, day streak, pause/quit, no timers.
- No Settings. Theme always Auto (System / Hub). Sound on/off is the title-bar button; title-bar buttons are grey alpha.

### Speech

Web Speech only. Voice order: Indian English (`en-IN`), else British (`en-GB`), else American (`en-US`), else any other English voice (`en`). The status line says which voice is in use. Without an English voice, written names and phonics hints are shown and Listen & pick shows the letter name. The letter name for Z is zed (India / British English), not zee. "Hear letter" says the name; "Hear sound" says the phonics phrase.

### Tracing

Same coverage-and-accuracy engine as Hindi Letters, with English school-print stroke arrows and a Capital / Small toggle. The faint guide is the device-rendered glyph; arrows are simplified stroke-order hints.

## Tests

`node --test apps/learn/english-letters/tests/data.cjs apps/learn/english-letters/tests/games.cjs`

See `tests/RESULTS.md`. No browser tests in EL-1.

Limitations: no teacher or phonics-specialist review yet; spoken quality depends on the device voice (some voices may say zee for Z, or use a non-Indian accent). Emoji are approximate memory cues. The word `xray` is stored without a hyphen. Phonics starts with one common sound per letter; other sounds are only mentioned in the hint.
