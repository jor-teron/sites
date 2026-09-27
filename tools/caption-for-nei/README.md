# Caption for NEI (Caption for North East India)

Personal live captions for English, Assamese, Hindi, Bengali, and Nepali.

Formerly **Live Subtitle for Assam** (`tools/live-subtitle-assam/`, v0.11). The old URL redirects here, and the saved key, RPD counts and hour logs are copied once to the new storage keys.

| | |
|---|---|
| Version | **0.12** (API Edition) |
| First release | 27 Sep 2026 |
| Last edit | 28 Sep 2026 |
| Credit | Personal project (Karbi Anglong / Assam) |

**Input engine:** `gemini-3.5-transcribe-live`  
**Output (optional):** `gemini-3.5-flash-lite`, then `gemini-3.1-flash-lite`  
**Parked:** ABC romanize, 2-panel, Karbi, Local Pack, Live Translate, speaker

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

Key stays in `localStorage` (`cfn_gemini_api_key_v01`). Do not commit it.

## Files

| File | Role |
|---|---|
| `index.html` | Redirect to `caption-for-nei.html` |
| `caption-for-nei.html` | App + top bar (markup only) |
| `caption-for-nei.css` | Styles |
| `caption-for-nei_config.js` | Split, models, RPM/RPD, vocab list, languages, storage keys, UI text |
| `caption-for-nei_logic.js` | Mic, Live captions, chat translate, storage migration |
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

Assamese and Bengali share the Bengali script; Hindi and Nepali share Devanagari. The app never guesses the language from the script — pick the Input language when Auto mixes them up.

RPD text on the bar resets at **00:00 UTC**.

## Notes

- Audio goes to Google while Start is on.  
- Live session ~10 minutes; Start again if it drops.  
- Weak Celeron is fine (cloud does the work).  
- `file://` often blocks the mic — use a local server.
