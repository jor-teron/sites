# Sound Recorder

## 1. What it is
A microphone recorder built for **long recordings**: the waveform shows where the sound is, silent stretches are shaded, and you can jump from one sound to the next. Four swipe screens: **Recorder** (default), **Recordings**, **Player**, **Settings**. Version 1.0 (releases SR1–SR3; SR4 markers and SR5 speed / skip-silence are planned).

## 2. Files
- `sound-recorder.html` / `sound-recorder.css`: page, layout, light / dark, safe-area
- `sound-recorder_app.js`: screens, top-bar swipe, settings, theme (System = follow the Hub via `shared/theme/hub_theme.js`, default), own dialog, keys
- `sound-recorder_notify.js`: `SRNotify({icon,title,text,onClick,timeoutMs})` — Hub notification cards inside the Hub, small local cards standalone
- `sound-recorder_recorder.js`: Record / Pause / Stop, live waveform, level meter, timer, mic picker
- `sound-recorder_list.js`: Recordings list, rename, delete, download, import
- `sound-recorder_player.js`: waveform player, seek, zoom, overview, sound regions
- `sound-recorder_audio.js`: live peak AudioWorklet, peaks from a file, silence detection
- `sound-recorder_wave.js`: canvas waveform drawing
- `sound-recorder_store.js`: IndexedDB storage
- `sound-recorder_save.js`: **every download goes through `SRSave.save(blob, name)`** (Hub Drive can replace it later)
- `sound-recorder_icon.png`, `index.html` (opens `sound-recorder.html`)

## 3. Behaviour rules
- **Screens:** Recorder → Recordings → Player → Settings. Swipe the **top bar** (dots + screen name) 75 px or more: left = next, right = previous, wrapping around; it slides with the finger. Dots can be tapped. The waveform never switches screens (drag there = seek / pan).
- **Controls on the right** (right-handed): the main button (Record / Play) is the rightmost, biggest one.
- **Recorder:** Record starts; Pause / Resume; Stop saves. Big timer (m:ss.t), live scrolling waveform of the last 8 s, and a level meter. If there is more than one microphone a Mic picker appears (used for the next recording). Leaving the page while recording asks first.
- **Recordings:** newest first; name, date, length, size and a mini waveform. Tap to open in the Player. Rename and Delete use the app's own dialogs. Download saves the original file (WebM/Opus in Chrome / Firefox, MP4/AAC as `.m4a` in Safari). **Import** adds an audio file from the device.
- **Player:** whole recording as one waveform (60 dB scale: loud = tall, silence flat), orange playhead, tap or drag anywhere to seek, time / total, Play / Pause, −10 / +10 s. Follows the playhead when it leaves the visible part.
- **Zoom:** pinch on the waveform, Ctrl / ⌘ + wheel, or the − / + buttons (×2). Minimum window 2 s. The overview bar above shows the whole recording with the visible window outlined; drag it to pan (tap outside the window to move there). A plain wheel pans.
- **Sound regions:** a stretch counts as sound when its level is above the Settings threshold (default −40 dB). Silent gaps shorter than 1 s are joined, sounds shorter than 0.15 s are ignored. Silence is shaded, sound has a blue bar along the bottom. The header shows the count. **Sound ▶** jumps to the start of the next sound; **◀ Sound** to the start of the current one (if more than 0.3 s in) or the previous one.
- **Settings:** Theme Dark (default) / Light / System (Hub pref `sites-hub.theme`, else device); Silence below −50 / −40 / −30 dB; About.

## 4. Storage
- IndexedDB `sound-recorder-v1`, store `rec`: `{ id, name, date, dur, mime, size, blob, peaks (Float32Array, 50 per s), pps }`. Peaks are computed live by an AudioWorklet while recording, so long recordings never need decoding. Imported files are decoded at 8 kHz and peaks are built one minute at a time, yielding to the UI.
- localStorage `sound-recorder-settings-v1` (`theme`, `thr`, `mic`) and `sound-recorder-state-v1` (`mode`, `cur`).
- Recordings live only in this browser; clearing site data deletes them. Download to keep a copy.

## 5. Keyboard
- PageUp / PageDown or Alt + ← / →: previous / next screen
- Recorder: R or Space record / pause, P pause, S stop
- Player: Space play / pause, ← / → −10 / +10 s, + / − zoom, N / P next / previous sound
- Esc closes a dialog, Enter confirms rename
