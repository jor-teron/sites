# Stopwatch

## 1. What it is
A basic stopwatch with two modes: **Stopwatch** (default, minimal) and **Lap**. No sound, no countdown.

## 2. Files
- `stopwatch.html` / `stopwatch.css`: page, layout, light / dark, safe-area
- `stopwatch_logic.js`: timing, laps, gestures, keys, saving, export
- `stopwatch_icon.png`: hub icon
- `index.html`: opens `stopwatch.html`

## 3. Behaviour rules
- **Start / Pause:** tap or click anywhere on the screen. Buttons, the dots and the lap list do not count. A tap is a short press (< 0.5 s) moving less than 10 px.
- **Modes:** Stopwatch shows only the big time (mm:ss.cc; hours appear after 60 min). Lap shows a smaller time, a Lap button on the RIGHT (right-handed), and the lap list.
- **Switching mode:** a horizontal swipe of 75 px or more, left or right, switches to the other mode from either mode. The screen slides with the finger. Two dots at the top show the mode and can be clicked. Vertical scrolling never switches or starts / pauses. Switching keeps the time running.
- **Laps:** lap #, lap time, total; newest first. With 3 or more laps the fastest is green and the slowest red. Copy (tab-separated text) and CSV download (`laps-YYYYMMDD-HHMMSS.csv`). Lap works only while running.
- **Reset:** full-width button at the bottom. Clears time and laps; when there are laps it asks first in the app's own dialog.
- **Keeps going:** start time (Date.now), accumulated time, running state, laps and mode are saved in localStorage `stopwatch-state-v1`, so the time continues through reload or closing the app.
- **Theme:** Hub pref `sites-hub.theme` (light / dark), otherwise the system.

## 4. Keyboard
- Space: start / pause
- Left / Right arrow: switch mode
- L: lap (Lap mode)
- R: reset (same confirm rule)
- Esc: close the confirm dialog
