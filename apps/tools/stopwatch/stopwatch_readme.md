# Stopwatch

## 1. What it is
A basic stopwatch with three swipe screens: **Stopwatch** (default, minimal), **Lap** and **Settings**. No sound, no countdown. Version 1.1.

## 2. Files
- `stopwatch.html` / `stopwatch.css`: page, layout, light / dark, safe-area
- `stopwatch_logic.js`: timing, laps, gestures, keys, saving, export
- `stopwatch_icon.png`: hub icon
- `index.html`: opens `stopwatch.html`

## 3. Behaviour rules
- **Start / Pause:** tap or click anywhere on the screen. Buttons, the dots and the lap list do not count. A tap is a short press (< 0.5 s) moving less than 10 px.
- **Modes:** Stopwatch shows only the big time (mm:ss.cc; hours appear after 60 min). Lap shows a smaller time, a Lap button on the RIGHT (right-handed), and the lap list.
- **Screens:** Stopwatch → Lap → Settings. A horizontal swipe of 75 px or more: left = next, right = previous, wrapping around (right from Stopwatch opens Settings, left from Settings opens Stopwatch). The screen slides with the finger. Three dots at the top show the screen and can be clicked. Vertical scrolling never switches or starts / pauses. Switching keeps the time running. Taps on Settings never start / pause.
- **Face (Settings):** Analog (default): round dial with a smoothly sweeping seconds hand (one turn = 60 s), a small inner 30-minute sub-dial, and the digital time small beneath. Lap mode shows the same face smaller above the list. Digital: the big mm:ss.cc readout.
- **Theme (Settings):** Dark (default), Light, or System (Hub pref `sites-hub.theme`, otherwise the device).
- **About (Settings):** name, version, short description.
- **Laps:** lap #, lap time, total; newest first. With 3 or more laps the fastest is green and the slowest red. Copy (tab-separated text) and CSV download (`laps-YYYYMMDD-HHMMSS.csv`). Lap works only while running.
- **Reset:** full-width button at the bottom. Clears time and laps; when there are laps it asks first in the app's own dialog.
- **Keeps going:** start time (Date.now), accumulated time, running state, laps and mode are saved in localStorage `stopwatch-state-v1`, so the time continues through reload or closing the app.
- **Settings** are saved in localStorage `stopwatch-settings-v1` (`face`, `theme`). Older saved state (`stopwatch-state-v1`) is kept as is; settings start at the defaults.

## 4. Keyboard
- Space: start / pause (not on Settings)
- Right / Left arrow: next / previous screen (wraps)
- L: lap (Lap mode)
- R: reset (same confirm rule)
- Esc: close the confirm dialog
