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

## VT2

- UI/CSS layout only — no trim/export behaviour changes.
- App fills the viewport: `html` / `body` / `.app` use `100dvh` / `100dvw`
  (with `100vh` / `100vw` fallback), `overflow: hidden`, and
  `env(safe-area-inset-*)` padding. No page scroll.
- Column layout: slim header; video area `flex: 1` with `object-fit: contain`
  and `min-height: 0`; controls pinned at the bottom (always visible on
  ~360×640). Empty state is a full-area drop/pick target.
- Wide + landscape (`min-width: 900px` and landscape): controls move to a
  right side panel (~320–380px, `--controls-w: 340px`).
- Short landscape (`max-height: 420px`): compact header, gaps, fonts, and
  slightly shorter chips/handles so 640×360 does not overflow.
- Tests: existing `vt1.test.cjs` plus `vt2.test.cjs` (CSS rule sanity).
