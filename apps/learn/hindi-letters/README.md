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

## HL-1b

33-consonant barakhadi explorer (429 generated combinations), five half-letter examples, six conjuncts, numerals १–१० and **200 distinct picture words** in eight themes: fruits 25, animals 25, family 22, colours 14, body 25, home 30, nature 34, food 25. Search accepts Hindi or English. Short इ is explained in Unicode logical order, not misleading visual-order concatenation. Rare syllable combinations are labelled as practice forms, not everyday words. ङ/ञ and ऋ forms may be uncommon but compose correctly.

Data self-check: reviewed Hindi spellings, nasal signs, gender-specific meanings and kinship relationships; word duplicates checked after NFC normalization. 7 Node tests passed, including all 429 matra compositions and conjunct decompositions. 35 Chrome checks passed with zero console errors; additional phone screenshots for all four learning views were visually checked. A stub tests hi-IN voice selection and the audio-off path, not native speech quality.

## HL-1c

Four ten-question games: find a letter, picture/meaning-to-word, build a word from intact letter-group (akshara) tiles, and listen-and-pick. Letter games display actual letters, not their example words. Listen fallback displays romanization when a Hindi voice is missing, speech is switched off, or sound is muted. Conjunct/mark-safe segmentation has an offline fallback. Each session locks answered questions, handles repeated tiles by identity, supports pause/resume/quit and stores best stars. No timers, accounts, ads or remote resources.

Earn an active day by marking a letter learned, earning trace stars or finishing a game; consecutive local-calendar days grow the streak. Synthesized feedback sounds and speech share a global mute, with a separate spoken-audio preference. Games focus their content on phones and use two columns in short landscape viewports. Help explains the counting convention, scope and limitations.

Final validation: **14 Node tests + 72 Chrome checks passed**, zero console errors. Node tests include 400 seeded sessions (4,000 questions), Unicode grapheme fallback, duplicate-tile handling, answer locking, pause and leap-day/year-boundary streak cases. Chrome completes all four games, verifies saved stars/mute, no-voice fallback, all essential game controls visible and ≥44px in both phone orientations, blocked storage, whole-box scribble rejection and a real pointer-driven glyph trace scoring three stars. See `tests/RESULTS.md`.

## HL-1d

- Alphabet letter tiles are fixed 140×140px squares on desktop and phone; the grid wraps them onto new rows.

## HL-1e

- Alphabet tiles: the Hindi letter (84px) and the roman label under it (30px) grow together to fill about 90% of the 140px tile, same size on desktop and phone.
