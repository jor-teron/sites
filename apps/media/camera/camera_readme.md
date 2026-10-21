# Camera

## 1. What it is
A simple camera for photos and videos from the device camera. Files download straight away. No gallery, no filters.

## 2. Files
- `camera.html` / `camera.css`: preview, controls, settings panel, layout, light / dark
- `camera_config.js`: resolutions, timers, photo formats, video types, defaults, text
- `camera_save.js`: `CameraSave.save(blob, filename)`, the one place every file goes through (browser download today; swap for Hub Drive later), and the timestamped file name
- `camera_logic.js`: camera start / stop, photo, video recording, timer, grid, mirror, keys, settings
- `camera_icon.png`: hub icon
- `index.html`: opens `camera.html`

## 3. Behaviour rules
- **Layout:** preview fills the screen. Portrait: controls in a bottom bar. Landscape: controls in a column on the right (right-handed).
- **Photo:** big shutter or Space. JPG (quality 0.92) or PNG at the camera's full frame size. The last shot shows as a thumbnail; tapping it opens the file.
- **Video:** Video mode turns the shutter red. Start / stop with the shutter or Space; Pause / Resume button (P) and a timer while recording. Sound is recorded when the microphone is allowed. MP4 when the browser can record it, otherwise WebM.
- **Camera:** picker in Settings (all cameras found), plus the flip button for front / back (next camera in the list).
- **Mirror:** on by default for the front camera, off for the back camera. When on, the preview, the saved photo and the saved video are all mirrored the same way. Changing camera resets it to automatic.
- **Resolution:** 720p, 1080p or Max (asked of the camera; it may give less). The real size is shown in Settings.
- **Self-timer:** Off, 3 s or 10 s countdown. Pressing the shutter again cancels it.
- **Grid:** rule-of-thirds lines over the picture.
- **Names:** `photo-YYYYMMDD-HHMMSS.jpg|png`, `video-YYYYMMDD-HHMMSS.mp4|webm` (local time).
- **Settings** are remembered (localStorage `camera-settings-v1`).
- **Leaving:** when the tab is hidden the recording is finished and saved, and the camera is turned off. It turns back on when the tab is shown.
- **Errors:** blocked permission, no camera, camera busy, or no https show a message with Retry instead of the preview.

## 4. Keyboard
- `Space` / `Enter` shutter (photo, or start / stop recording)
- `V` photo / video, `P` pause / resume, `F` flip camera, `G` grid, `Esc` cancel timer / close settings

## 5. Known limits
- Mirrored video is drawn through a canvas, so the frame rate can drop on slow devices.
- Pausing is not supported by every browser's recorder; Safari records MP4.
- Camera access needs https (or localhost).
