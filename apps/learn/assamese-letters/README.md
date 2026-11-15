# Assamese Letters

Offline-first Learn app, modelled on Hindi Letters (as of HL-3a). Open `assamese-letters.html` (or the one-hop `index.html`). Classic scripts, no dependencies, no network calls or bundled fonts (uses the device's Bengali-script font, e.g. Noto Sans Bengali, Vrinda, Kohinoor Bangla). It uses the Hub theme (`shared/theme/hub_theme.js`) and the Learn title-bar contract (`apps/learn/shared/learn-hubbar.js`) without modifying shared files. Default theme is Auto (Hub selection, else OS). All progress/settings use `learn.assamese-letters.*` localStorage; unavailable storage does not block practice.

## AL-1

- Chart of 52 entries: 11 vowels (অ আ ই ঈ উ ঊ ঋ এ ঐ ও ঔ), 37 consonants (ক … হ in the five classes, য ৰ ল ৱ শ ষ স হ, then ক্ষ ড় ঢ় য়) and 4 signs (ৎ, and ং ঃ ঁ shown with অ). Assamese ৰ (U+09F0) and ৱ (U+09F1) are used, never Bengali র. All Assamese strings are NFC-normalised, so ড় ঢ় য় are stored as base + nukta.
- Square 140px letter tiles with the big letter and roman label inside, 20px gap. Letter card (960px) with Assamese sound, hint, picture word, Hear letter / Hear word, Mark learned, and the bigger trace box (up to 480px) with live Covered / On the guide progress bars under the stars.
- Matras: inherent অ + the 10 vowel signs া ি ী ু ূ ৃ ে ৈ ো ৌ + ং ঃ ঁ for each of the 37 consonants (518 practice syllables). Explains pre-base ি ে ৈ and the two-part ো ৌ.
- Joined letters: ক্ষ জ্ঞ ন্ত স্ত ক্ত ঙ্ক ন্দ ম্প ত্ৰ শ্ৰ with example words, plus hasanta examples ৰেফ (ধৰ্ম), য-ফলা (বাক্য), ন্ন (অন্ন), স্ক (স্কুল).
- Numbers ০–১০ with Assamese names (শূন্য এক দুই তিনি চাৰি পাঁচ ছয় সাত আঠ ন দহ).
- 143 picture words in eight themes (fruits 17, animals 24, family 14, colours 10, body 16, home 20, nature 22, food 20). Search in Assamese or English.
- Four ten-question games (Find the letter, Picture → word, Build the word, Listen & pick), best stars, day streak, pause/quit, no timers.
- No Settings. Theme always Auto (System / Hub). Sound on/off is the title-bar button; title-bar buttons are grey alpha.

### Romanisation

Tile labels use a simple script-based transliteration (ka kha ga …, with dots for ট-class letters and ā ī ū for long vowels), because Assamese merges several sounds and the labels must still tell every letter apart. Where the Assamese sound is very different from the spelling, the sound follows a slash:

- শ ষ স = **śa/xa ṣa/xa sa/xa** – all three are the Assamese x sound (a soft breathy sound like ch in Scottish loch).
- চ ছ = **ca/sa cha/sa** (said s), জ ঝ য = **ja/za jha/za ya/za** (said z).
- ৰ = ra, ৱ = wa, য় = ẏa, ড় ঢ় = ṛa ṛha, ক্ষ = kṣa (said khya), ৎ = t, ং ঃ ঁ = aṅ aḥ am̐.
- Vowels: a (said o, as in hot) ā i ī u ū ri e oi o ou. ই/ঈ and উ/ঊ sound the same in Assamese.

The letter card always shows the Assamese sound (e.g. ক → ko, শ → xo). Listen & pick uses one letter per Assamese sound (it skips ঈ ঊ ঙ ঞ ছ ঝ ট ঠ ড ঢ ণ য শ ষ ক্ষ ড় ঢ়), so a spoken letter never has two right answers.

### Speech

Web Speech only. Voice order: an Assamese voice (`as`, e.g. as-IN), else Bengali (`bn`, e.g. bn-IN: same script, but শ ষ স are said sh/s instead of x and ৰ ৱ may differ), else Hindi (`hi-IN`: may not read Assamese script well). The status line says which voice is in use. Without any of them, written hints and roman labels are shown and Listen & pick shows the roman label.

### Tracing

Same engine as Hindi Letters: grading samples the device-rendered glyph; phase 1 body, phase 2 the মাত্ৰা (top line). Some letters (এ ঐ ও ঔ ঙ ঞ ৎ …) have little or no top line; the arrows are broad hints, not stroke order.

## Tests

`node --test apps/learn/assamese-letters/tests/data.cjs apps/learn/assamese-letters/tests/games.cjs`

17 Node tests (non-browser). No browser tests in AL-1. See `tests/RESULTS.md`.

Limitations: no Assamese-speaker or educator review yet; spoken quality depends on the device voice (Assamese voices are rare). Emoji are approximate memory cues.
