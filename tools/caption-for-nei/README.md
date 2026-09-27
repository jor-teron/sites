# Caption for NEI (Caption for North East India)

Personal live captions for English, Assamese, Hindi, Bengali, and Nepali.

Formerly **Live Subtitle for Assam** (`tools/live-subtitle-assam/`, v0.11). The old URL redirects here, and the saved key, RPD counts and hour logs are copied once to the new storage keys.

| | |
|---|---|
| Version | **0.13** (API Edition) |
| First release | 27 Sep 2026 |
| Last edit | 28 Sep 2026 |
| Credit | Personal project (Karbi Anglong / Assam) |

**Input engine:** `gemini-3.5-transcribe-live`  
**Output (optional):** `gemini-3.5-flash-lite`, then `gemini-3.1-flash-lite`  
**ABC (line 2):** Off / Local (rule-based, on this device) / AI  
**Parked:** 2-panel, Karbi, Local Pack, Live Translate, speaker

## Run

Open `caption-for-nei.html` (or the folder / `index.html`, which redirects) in Chrome over **https** or **localhost**. GitHub Pages works.

```bash
python3 -m http.server 8080
```

1. Key: https://aistudio.google.com/apikey  
2. Key → Save  
3. Input language (Auto, English, Assamese, Hindi, Bengali, Nepali) → Start  
4. Allow microphone  
5. Output (English, Hindi, Assamese, Bengali, Nepali) only when you need translation (uses Flash-Lite quota)
6. ABC: Off / Local / AI (default Local; remembered in this browser)

Key stays in `localStorage` (`cfn_gemini_api_key_v01`). Do not commit it.

## Files

| File | Role |
|---|---|
| `index.html` | Redirect to `caption-for-nei.html` |
| `caption-for-nei.html` | App + top bar (markup only) |
| `caption-for-nei.css` | Styles |
| `caption-for-nei_config.js` | Split, models, RPM/RPD, vocab list, languages, storage keys, UI text |
| `caption-for-nei_logic.js` | Mic, Live captions, ABC line, chat translate, logs, storage migration |
| `caption-for-nei_roman.js` | Local romanizer engine (`CFN_ROMAN.romanize(text, lang)`) |
| `caption-for-nei_roman_deva.js` | Devanagari tables (Hindi, Nepali) |
| `caption-for-nei_roman_beng.js` | Bengali-script tables (Assamese, Bengali) |
| `roman_hi.csv` `roman_ne.csv` `roman_as.csv` `roman_bn.csv` | Word lists for the romanizer (`native,roman`) |
| `city.csv` `town.csv` `surname.csv` `vocab.csv` | Recognition bias |
| `about.html` | Credit, version, dates |
| `favicon.svg` | Browser tab icon |
| `caption-for-nei_icon.png` | Hub icon |

## Config

Edit `caption-for-nei_config.js` only when you can. `caption-for-nei_logic.js` can be replaced later.

- `WORD_SPLIT` / `SPLIT_SECONDS` — new caption block  
- `MODELS[].rpm` / `rpd` — per-minute and per-UTC-day caps  
- `PINNED_MODEL` — `"auto"` or a model id  
- `VOCAB_FILES` — extra csv lists  
- `ABC_MODE` — default ABC mode (`"off"`, `"local"`, `"ai"`); the top-bar choice is saved in `cfn_abc_mode_v1`  
- `ROMAN_WORD_FILES` — word list per language  
- `ROMAN_AUTO_DEVANAGARI_LANG` / `ROMAN_AUTO_BENGALI_SCRIPT_LANG` — rules used for Input Auto (`hi` / `as`)  
- `ROMAN_STYLE` — everyday spelling (`aa`/`a`, `ee`/`i`, `oo`/`u`, `v`/`w`, nasal `n`/`m`)  
- `ROMAN_LANG` — per-language tweaks (inherent vowel, Assamese `x`/`s`, word-initial অ → `a`, …)  
- `LOG_ABC_PREFIX` — prefix of the ABC line in hour logs  
- `INPUT_LANGUAGES` — Input dropdown (BCP-47 codes sent to Transcribe Live; `auto` = detect)  
- `OUTPUT_LANGUAGES` — Output dropdown (translate targets)  
- `STORAGE` / `LEGACY_STORAGE_KEYS` / `LEGACY_STORAGE_PREFIXES` — localStorage keys and old → new map  
- `TEXT` — status and button text  

## Languages

| Language | Input code | Output |
|---|---|---|
| Auto (detect) | `auto` (sends `[]`) | — |
| English | `en-IN` | `en` |
| Assamese | `as-IN` | `as` |
| Hindi | `hi-IN` | `hi` |
| Bengali (India) | `bn-IN` | `bn` |
| Nepali | `ne-NP` | `ne` |

Assamese and Bengali share the Bengali script; Hindi and Nepali share Devanagari. Transcription never guesses the language from the script — pick the Input language when Auto mixes them up. (With Auto, only the Local ABC romanizer picks rules by script: Hindi for Devanagari, Assamese for Bengali script.)

RPD text on the bar resets at **00:00 UTC**.

## Caption block

1. Original transcript (native script)  
2. **ABC** — the same words in everyday Latin letters (phone-typing style), only when the line has Devanagari or Bengali script (English lines have no line 2)  
3. Translation (only when Output is not Off)

### ABC modes

| Mode | What line 2 shows |
|---|---|
| Off | Hidden |
| Local (default) | Rule-based romanizer in the browser, no network, no quota |
| AI | Local result first, then the chat model's romanization (same request as the translation). Falls back to Local on any error. Old blocks are not re-asked when you switch to AI. |

Switching the mode re-renders line 2 on the blocks already on screen. AI mode is kept separate so it can be removed later.

### Local romanizer

- Engine: `caption-for-nei_roman.js`; tables in `caption-for-nei_roman_deva.js` and `caption-for-nei_roman_beng.js`.  
- Language = the Input choice (Hindi, Nepali, Assamese, Bengali). With Auto, Devanagari uses Hindi rules and Bengali script uses Assamese rules (config).  
- Handles vowels, matras, nukta letters (क़ ज़ ड़ फ़ … ড় ঢ় য়), anusvara / chandrabindu / visarga, conjuncts, khanda ta ৎ, Assamese ৰ ৱ, digits → 0–9, danda → `.`.  
- Inherent vowel: `a` for Hindi/Nepali, `o` for Assamese/Bengali. Word-final and common medial schwa deletion (कमल → kamal, समझना → samajhna).  
- Assamese: স/শ/ষ → `x`, চ/ছ → `s`, word-initial অ → `a` (অসম → axom).  
- Word lists `roman_xx.csv` (lines starting `#` are comments, then `native,roman`) win over the rules for whole words, and for a listed stem + a common suffix (तपाईं + लाई → tapailai). Add words there when the rules get one wrong.

## Translation and quota

Every caption line is translated on its own (one request per block, no batching). If a model errors or is at its per-minute / per-day cap, the next On model is tried for that line; if none is free, line 3 shows a short note. This uses **one request per caption line** (more than the old 5-second batching): with two Lite models at 15 RPM each, fast speech can hit the per-minute caps, and a long session uses the daily RPD faster. Keep Output Off when you do not need it. ABC = AI adds no extra request when Output is on (one JSON reply carries both); with Output Off it costs one request per Indic line.

## Logs

Hour logs (Log panel, `cfn_hour_YYYY-MM-DD_HH`) keep one entry per block:

```
2026-09-28 10:15:02 IST
मेरा नाम जोर है
ABC: mera naam jor hai
My name is Jor.
```

The `ABC:` line is present only when line 2 was shown; the translation line only when there is one. Older entries (stamp, original, translation) are unchanged.

## Notes

- Audio goes to Google while Start is on.  
- Live session ~10 minutes; Start again if it drops.  
- Weak Celeron is fine (cloud does the work).  
- `file://` often blocks the mic — use a local server.
