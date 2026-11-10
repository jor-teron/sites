# Hindi Letters

Offline-first Learn app. Open `hindi-letters.html` (or the one-hop `index.html`). Classic scripts, no dependencies, no network calls or bundled fonts. It uses the Hub theme and Learn title-bar contract without modifying shared files. Default theme is Auto (Hub selection, else OS). All progress/settings use `learn.hindi-letters.*` localStorage; unavailable storage does not block practice.

## HL-1a

- 13 traditional vowel/sign entries, 33 basic consonants and 3 conjuncts, explicitly explaining the “36 consonants” convention. Anusvara/visarga are explained as signs. Nukta letters are outside this beginner chart.
- Short transliteration distinguishes dental/retroflex and short/long vowels. Romanization is a pronunciation aid, not strict IAST: ca = English ch, cha = aspirated ch, ṛ = modern Hindi ri. Sound hints clarify common modern pronunciations (ज्ञ, व, फ, ष).
- Rare ङ/ञ examples use common anusvara spelling with an explicit explanation, rather than falsely claiming the standalone glyph is written there.
- Speech uses a Hindi voice only; no misleading English-voice fallback. No voice is required to learn.
- Tracing samples the device-rendered glyph's alpha mask, balances coverage with on-guide precision, and saves best stars. The two numbered arrows are broad body/headline phases, not a verified calligraphic stroke-by-stroke curriculum. Font outlines are not identical to handwriting. The child adds the headline last; order is guided, not machine-enforced.
- Pictures are mnemonic emoji, not exact illustrations of every item (e.g. apple emoji stands for pomegranate). The word/English meaning is authoritative.

## Tests

`node --test apps/learn/hindi-letters/tests/data.cjs`

Serve repository root on **8834**, then `node apps/learn/hindi-letters/tests/browser.cjs`. Uses `/usr/bin/google-chrome` and puppeteer-core from `/workspace/gg-test/node_modules`, overridable with `HL_PUPPETEER`. Chrome tests validate saved trace stars, a scripted glyph trace, pointer input, themes and desktop/390×844/844×390 layouts. Screenshots are written outside the repo to `/workspace/hl-*.png`.

HL-1a validation: 3 Node tests and 20 Chrome checks passed; zero console errors. Screenshots visually reviewed: Devanagari letters, matras, word and icon render correctly on this machine. The headless machine has no Hindi speech voice; native voice playback needs a device with one installed. No real-phone or educator review yet.
