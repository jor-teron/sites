# Video Trimmer — notes

## VT1

- System / Hub theme: light and dark CSS variables. Reads Hub
  `sites-hub.theme` / `sites-hub.themeAuto` (shared key, read-only). When Hub
  Auto is on or the key is unset, follows `prefers-color-scheme` and updates
  live on matchMedia / storage / hub-prefs / focus.
- Dual-handle range replaces the two separate Start / End `<input type="range">`
  controls. Handles are 24px visually with a 48px touch area (pointer events).
  Min gap 0.1s; arrow keys nudge the focused handle; chips above are
  mm:ss.s and tappable to type an exact time. Dragging seeks the preview.
- Header keeps only the title (subtitle removed).
- Export path unchanged: `captureStream` + `MediaRecorder` (webm/mp4). No CDN
  libraries. Modular `vt_*` files; old `script.js` / `style.css` removed.
- Tests: `node tests/vt1.test.cjs` (pure helpers only). No browser test.
