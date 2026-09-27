# Live Subtitle for Assam

Personal live captions for English, Assamese, and Hindi.

| | |
|---|---|
| Version | **0.11** (API Edition) |
| First release | 27 Sep 2026 |
| Last edit | 27 Sep 2026 |
| Credit | Personal project (Karbi Anglong / Assam) |

**Input engine:** `gemini-3.5-transcribe-live`  
**Output (optional):** `gemini-3.5-flash-lite`, then `gemini-3.1-flash-lite`  
**Parked:** ABC romanize, 2-panel, Karbi, Local Pack, Live Translate, speaker

## Run

Open `index.html` in Chrome over **https** or **localhost**. GitHub Pages works.

```bash
python3 -m http.server 8080
```

1. Key: https://aistudio.google.com/apikey  
2. Key → Save  
3. Input language (or Auto) → Start  
4. Allow microphone  
5. Output English only when you need translation (uses Flash-Lite quota)

Key stays in `localStorage`. Do not commit it.

## Files

| File | Role |
|---|---|
| `index.html` | App + top bar |
| `app.js` | Mic, Live captions, chat translate |
| `config.js` | Split, models, RPM/RPD, vocab list |
| `city.csv` `town.csv` `surname.csv` `vocab.csv` | Recognition bias |
| `about.html` | Credit, version, dates |
| `favicon.svg` | Icon |

## Config

Edit `config.js` only when you can. `app.js` can be replaced later.

- `WORD_SPLIT` / `SPLIT_SECONDS` — new caption block  
- `MODELS[].rpm` / `rpd` — per-minute and per-UTC-day caps  
- `PINNED_MODEL` — `"auto"` or a model id  
- `VOCAB_FILES` — extra csv lists  

RPD text on the bar resets at **00:00 UTC**.

## Notes

- Audio goes to Google while Start is on.  
- Live session ~10 minutes; Start again if it drops.  
- Weak Celeron is fine (cloud does the work).  
- `file://` often blocks the mic — use a local server.
