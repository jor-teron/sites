# Caption for NEI (Caption for North East India)

Personal live captions for English, Assamese, Hindi, Bengali, and Nepali.

Formerly **Live Subtitle for Assam** (`tools/live-subtitle-assam/`, v0.11). The old URL redirects here, and the saved key, RPD counts and hour logs are copied once to the new storage keys.

| | |
|---|---|
| Version | **0.17** (API Edition) |
| First release | 27 Sep 2026 |
| Last edit | 28 Sep 2026 |
| Credit | Personal project (Karbi Anglong / Assam) |

**Input engine:** `gemini-3.5-transcribe-live`  
**Output (optional):** `gemini-3.5-flash-lite`, then `gemini-3.1-flash-lite`  
**ABC (romanized line):** Off / Local (rule-based, on this device) / AI  
**Blocks:** one per time window (`WINDOW_SEC` 4.25 s in config), one translation request per window, one line per sentence  
**Parked:** 2-panel, Karbi, Local Pack, Live Translate, speaker

## Run

Open `caption-for-nei.html` (or the folder / `index.html`, which redirects) in Chrome over **https** or **localhost**. GitHub Pages works.

**Pages (v0.17):** `caption-for-nei.html` is the normal page (phones: LED, Output, Start/Stop, level bar, Key, Clear, Log; Input fixed to Auto). `caption-for-nei_full.html` has every setting (Input, ABC, Model, Copy, Gain slider…). `caption-for-nei_lite.html` (old name of the normal page) redirects.

**Mic (v0.17):** `MIC_GAIN` (2.0, clamped 0.5–4) boosts the mic with a GainNode before audio goes to Google and to the level bar; the Full page slider changes it live and saves it. `MIC_NOISE_SUPPRESSION` false, `MIC_AUTO_GAIN` true, `MIC_ECHO_CANCEL` true.

**Shared key (v0.17):** both pages load `../../script/api_keys.js` (optional; `window.SITES_KEYS.GEMINI`, template `script/api_keys.sample.js`). Key order: saved in this browser → shared key (non-empty, not `PASTE_YOUR_KEY_HERE`) → the Key row asks. That file is public: restrict the key in Google Cloud (referrers, Generative Language API only, no billing).

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
| `caption-for-nei.html` | Normal page (compact top bar, markup only) |
| `caption-for-nei_full.html` | Full page (all settings, markup only) |
| `caption-for-nei_lite.html` | Redirect to `caption-for-nei.html` (old lite URL) |
| `caption-for-nei.css` | Styles |
| `caption-for-nei_config.js` | Window, block colours, split, models, RPM/RPD, vocab list, languages, storage keys, UI text |
| `caption-for-nei_logic.js` | Mic, Live captions, time windows / blocks, ABC line, chat translate, logs, storage migration |
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

- `WINDOW_SEC` — window length in seconds (4.25; config only since v0.15 — the old `cfn_window_sec_v1` key is ignored)  
- `WINDOW_PAUSE_GAP_MS` / `WINDOW_MAX_EXTRA_SEC` — pause check at window end (600 ms / 1.25 s)  
- `BLOCK_COLORS` / `BLOCK_TINT_ALPHA` — block accent colours (cycled) and tint strength  
- `LINE_MAX_WORDS` — cut a line without punctuation after this many words (15; was `WORD_SPLIT`)  
- `ABBREVIATIONS` — words whose `.` does not end a sentence (Mr. Dr. …)  
- `SPLIT_SECONDS` — commit a stale partial (interim) transcript after this long; its final replaces it later  
- `MODELS[].rpm` / `rpd` — per-minute and per-UTC-day caps  
- `PINNED_MODEL` — `"auto"` or a model id  
- `VOCAB_FILES` — extra csv lists  
- `ABC_MODE` — default ABC mode (`"off"`, `"local"`, `"ai"`); the top-bar choice is saved in `cfn_abc_mode_v1`  
- `ROMAN_WORD_FILES` — word list per language  
- `ROMAN_AUTO_DEVANAGARI_LANG` / `ROMAN_AUTO_BENGALI_SCRIPT_LANG` — rules used for Input Auto (`hi` / `as`)  
- `ROMAN_STYLE` — everyday spelling (`aa`/`a`, `ee`/`i`, `oo`/`u`, `v`/`w`, nasal `n`/`m`)  
- `ROMAN_LANG` — per-language tweaks (inherent vowel, Assamese `x`/`s`, word-initial অ → `a`, …)  
- `LOG_ABC_PREFIX` / `LOG_TRANS_PREFIX` — prefixes of the ABC and translation lines in hour logs  
- `INPUT_LANGUAGES` — Input dropdown (BCP-47 codes sent to Transcribe Live; `auto` = detect)  
- `OUTPUT_LANGUAGES` — Output dropdown (translate targets)  
- `STORAGE` / `LEGACY_STORAGE_KEYS` / `LEGACY_STORAGE_PREFIXES` — localStorage keys and old → new map  
- `AUDIO.SETUP_TIMEOUT_MS` — wait this long for the server's `setupComplete` before a connect counts as failed (5000; audio is never sent before it)  
- `AUDIO.RESUME_CHECK_MS` — when to check that the AudioContext really resumed (400)  
- `RECONNECT_BASE_MS` / `RECONNECT_MAX_MS` / `RECONNECT_MAX_TRIES` — auto reconnect backoff (1 s doubling to 15 s, 20 tries in a row)  
- `SESSION_RESUMPTION` — Live session resumption on reconnect (on; falls back to a fresh session)  
- `CONTEXT_COMPRESSION` / `CONTEXT_COMPRESSION_CONFIG` — sliding-window compression (off)  
- `LOG_SESSION_EVENTS` / `LOG_EVENT_PREFIX` — reconnect events in the hour log (`# …` lines)  
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

## Caption block (time window)

Everything transcribed during one window (`WINDOW_SEC`, 4.25 s) goes into that window's block, **one line per sentence** (split at `.` `?` `!` `।` `॥` and full-width `？` `！` `。`; `3.5`, `Mr.`, `Dr.`, initials like `J.` do not split; a line with no punctuation is cut after `LINE_MAX_WORDS` = 15 words). Each block has its own accent colour (left border + faint tint, cycled from `BLOCK_COLORS`):

```
• Translation of the whole window (larger; faint "translating…" while waiting; only when Output is not Off)
   ◦ Original line 1 (native script)
      – ABC: the same words in everyday Latin letters (only for Devanagari / Bengali script)
   ─────────
   ◦ Original line 2
      – ABC line 2
```

- When the window time is up: if the text ends at a sentence end the window closes at once; otherwise it waits for a sentence end or a pause (no pending interim, no text for 0.6 s), at most `WINDOW_MAX_EXTRA_SEC` = 1.25 s more. At that hard close the unfinished last sentence moves into the next block (only if a full sentence came before it; a window that is one unfinished sentence is translated as is).  
- A partial (interim) caption committed early (after `SPLIT_SECONDS` or 15 new words) is replaced / extended by its final text, so words are not repeated.  
- Input and Output the same language (e.g. English → English, Hindi → Hindi): no translation request; the block shows a small grey “same language, no translation”. English Input never has an ABC line (not even in AI mode, which then sends nothing). Other languages still get the Local ABC line; ABC = AI may send one romanization-only request per window.
- A window with no speech sends nothing and draws no block.  
- Stop closes the open window at once, so its last lines are still translated.

### ABC modes

| Mode | What the ABC line shows |
|---|---|
| Off | Hidden |
| Local (default) | Rule-based romanizer in the browser, no network, no quota |
| AI | Local result first, then the chat model's romanization of each line, carried in the window's single request (with the translation, or alone when Output is Off). Falls back to Local on any error. Old blocks are not re-asked when you switch to AI. |

Switching the mode re-renders the ABC lines on the blocks already on screen. AI mode is kept separate so it can be removed later.

### Local romanizer

- Engine: `caption-for-nei_roman.js`; tables in `caption-for-nei_roman_deva.js` and `caption-for-nei_roman_beng.js`.  
- Language = the Input choice (Hindi, Nepali, Assamese, Bengali). With Auto, Devanagari uses Hindi rules and Bengali script uses Assamese rules (config).  
- Handles vowels, matras, nukta letters (क़ ज़ ड़ फ़ … ড় ঢ় য়), anusvara / chandrabindu / visarga, conjuncts, khanda ta ৎ, Assamese ৰ ৱ, digits → 0–9, danda → `.`.  
- Inherent vowel: `a` for Hindi/Nepali, `o` for Assamese/Bengali. Word-final and common medial schwa deletion (कमल → kamal, समझना → samajhna).  
- Assamese: স/শ/ষ → `x`, চ/ছ → `s`, word-initial অ → `a` (অসম → axom).  
- Word lists `roman_xx.csv` (lines starting `#` are comments, then `native,roman`) win over the rules for whole words, and for a listed stem + a common suffix (तपाईं + लाई → tapailai). Add words there when the rules get one wrong.

## Translation and quota

One chat request per **window** (none when Input = Output language), holding only that window's lines (no earlier blocks as context), so a longer `WINDOW_SEC` uses fewer requests. Silent windows cost nothing. If a model errors or is at its per-minute / per-day cap, the next On model is tried for that window; if none is free, the translation line shows a short note. ABC = AI adds no extra request: the same JSON reply carries the translation and the romanized lines (with Output Off, AI mode costs one request per window that has Indic script). ABC = Local never uses the network.

## Logs

Hour logs (Log panel, `cfn_hour_YYYY-MM-DD_HH`) keep one entry per window block:

```
2026-09-28 10:15:02 IST
मेरा नाम जोर है।
ABC: mera naam jor hai.
आप कैसे हैं
ABC: aap kaise hain
TR: My name is Jor. How are you?
```

`ABC:` lines are present only when shown; the `TR:` line only when there is a translation. Older entries (v0.13: stamp, original, ABC, unprefixed translation) are unchanged.

## Session and audio (v0.16)

- **Audio resume:** browsers keep audio "suspended" until you touch the page (auto start on load). The app calls `resume()`; if audio is still held back the top bar shows **Tap anywhere to start audio** and the first tap / key press starts it (mic bar too).  
- **Real ready:** audio goes out only after the server's `setupComplete`. No answer within `AUDIO.SETUP_TIMEOUT_MS` (5 s) = failed connect → reconnect.  
- **Auto reconnect:** when the connection closes or errors and you did not press Stop, the app reconnects after 1 s, 2 s, 4 s, 8 s, then every 15 s (20 tries in a row; resets after each good session). The top bar shows **Reconnecting… (n)**, the LED turns amber. On the server's **GoAway** (sent before the ~10-minute cut) it renews at once. The mic and audio stay open (no new mic prompt) and the open caption block stays open; only an unfinished interim line is dropped. **Stop** cancels any pending reconnect.  
- **Session resumption:** setup asks for `sessionResumption`; the newest handle from `sessionResumptionUpdate` is sent on reconnect. Google documents this for the Live API in general, not explicitly for `gemini-3.5-transcribe-live`: if a setup with a handle fails the next try is fresh, and a clear rejection switches resumption off until the page is reloaded. Context window compression is off (not documented for the transcribe model).  
- Hour logs get short `# Reconnecting (n): reason` / `# Reconnected` entries (`LOG_SESSION_EVENTS`).

## Notes

- Audio goes to Google while Start is on.  
- A live connection lasts ~10 minutes; the app renews it automatically.  
- Weak Celeron is fine (cloud does the work).  
- `file://` often blocks the mic — use a local server.
