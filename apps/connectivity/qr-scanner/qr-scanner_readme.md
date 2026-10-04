# QR Scanner

## 1. What it is
Full-screen camera scanner for QR codes and barcodes (many 1D and 2D formats). Point the camera at a code and the result appears in a card in the middle. You can also read a code from a photo. Nothing is saved.

## 2. Files
- `qr-scanner.html` / `qr-scanner.css`: camera page, scan frame, buttons, result card
- `qr-scanner.js`: camera, zoom, torch, decoding, result card
- `qr-scanner_icon.png`: hub icon
- `index.html`: opens `qr-scanner.html`
- Decoder: zxing-wasm 2.2.4, loaded from jsDelivr (internet needed; not stored in the repo)

## 3. Behaviour rules
- **Camera:** the back camera fills the screen and starts on its own (asks for permission first).
- **Scan frame:** a square, 90% of the screen width, in the centre. Only the part inside the frame is decoded, about 3–4 times a second.
- **Result card:** shows the format, the local date and time, and the text. Web links, `mailto:` and `tel:` become tappable links (they open in a new tab). A different code replaces the card; the same code isn't shown again within 1.5 s.
- **Copy:** copies the text ("Copied"). If the clipboard is blocked, the text is selected instead ("Select").
- **Close:** hides the card; scanning goes on.
- **Light:** torch on/off. The button only shows if the camera has a torch.
- **Image:** pick a photo; it is decoded with the same reader.
- **Zoom:** pinch with two fingers. Uses the camera's own zoom when it has one, otherwise enlarges the picture (up to 5×).
- **Nothing is saved:** a reload clears the result.

## 4. Keyboard
No keyboard shortcuts. In the hub the phone D-pad sends key presses, but this app doesn't use any.

## 5. Saved data
None.

## 6. Errors
Shown in a small status line:
- "This browser has no camera API. Use Image."
- "Camera blocked. Allow camera, or use Image."
- "Light is not available on this camera."
- "Decoder is not ready." (decoder didn't load, e.g. offline)
- "No code found in that image." / "Could not read that image."

## 7. Screen sizes
Made for phones in portrait. Camera, frame and buttons scale with the screen; Light and Image sit at the bottom.

## 8. Safe settings
There is no config file. In `qr-scanner.js`:
- `SCAN_COOLDOWN_MS` (1500): how long the same code is ignored
- `ZOOM_MAX_FALLBACK` (5): most zoom without camera zoom
- `FRAME_WIDTH_RATIO` (0.9): must match the frame size in `qr-scanner.css`

## 9. Browser checklist
1. Open on a phone over https: the camera starts.
2. Scan a QR with a web link: the card shows the link; tap opens it.
3. Copy, then paste somewhere: same text.
4. Image → a photo of a barcode: the card shows it.
5. Pinch: the picture zooms.
6. Turn off the internet and reload: "Decoder is not ready." when scanning an image.

## 10. Known limits
- Needs internet for the decoder (jsDelivr); it doesn't work offline or from `file://` without it.
- Camera needs https or localhost.
- One code at a time.
- Closing the card while the same code is still in the frame: it comes back after 1.5 s.
- In landscape the 90%-width frame can be taller than the screen, so part of it is off screen.
- Old version after an update: hard-refresh.

## 11. Change log
- 2026-10-03 19:55 IST: moved to `apps/connectivity/qr-scanner/` (commit fab92c7).
- 2026-10-03 19:32 IST: second update (commit 4e66ee3).
- 2026-10-03 19:27 IST: update (commit 0da85a0).
- 2026-10-03 19:07 IST: added (commit 52902d3).

## 12. Related apps
- File Drop: also reads its own pairing QR with the camera.
- OCR: reads text (not codes) from photos.
