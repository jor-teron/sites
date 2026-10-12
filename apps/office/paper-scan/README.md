# Paper Scan

Photos of pages → one PDF (like Adobe Scan). Plain HTML/CSS/JS, no build, no CDN (PeerJS only through SharedLink's pinned loader).
Works in the Hub and responds to the hub's D-pad.

## Behaviour rules
- **Capture:** 📷 Camera (phone camera, several shots) or 🖼 Photos (picker, several). One new photo opens the crop editor; several land in the grid.
- **Crop:** 4 big corner handles, default 5% inset. ⛶ Full = whole photo. ⟲ / ⟳ rotate the result 90° left/right, shown live in the mini-preview. 🪄 Auto finds the paper edges (also runs on each new photo; falls back to a centred A4 crop). A round magnifier shows the spot under your finger while dragging a corner. The quad is perspective-corrected (homography, bilinear) to an A4-shaped page; landscape when the quad is wider than tall.
- **Filter:** Original / Document (default: white balance from the paper, whiter paper, darker ink) / Grayscale / B&W (adaptive threshold).
- **Pages:** tap a thumbnail to re-edit; ↑ ↓ reorder (mouse can also drag tiles); ⟲ retake/replace; ✕ delete (asks).
- **Quality:** Low 1600×1131, Medium 2000×1414 (default), Good 2480×1754, JPEG 0.8. Small photos are not upscaled. Status line shows the estimated, then the actual PDF size.
- **Export:** own PDF writer (`ps_pdf.js`): one JPEG per page (/DCTDecode), A4 595×842 pt (842×595 for landscape pages), image fitted. Name `paper-scan-YYYYMMDD-HHMM.pdf`.
  ⬇ PDF downloads, 🖨 Print opens the browser print dialog (hidden iframe), ↗ Share uses the phone's share sheet (WhatsApp, Telegram…; download if unsupported), 📤 Send uses the Hub link.
- **Send:** in the Hub → to a connected device by name. Standalone → joins the Hub (saved code, else code entry / Scan QR) and sends as a normal file (Hub viewer + toast + auto-download), or to another device.
- 🗑 New scan clears everything after a confirm.

## Files
- `paper-scan.html`, `paper-scan.css`, `index.html` (redirect), `paper-scan_icon.png`
- `paper-scan.js` main: state, render queue, export/print/share, keys
- `ps_capture.js` camera / photo inputs · `ps_crop.js` editor + homography warp · `ps_edge.js` auto edge detection · `ps_loupe.js` corner magnifier · `ps_filter.js` filters
- `ps_pages.js` thumbnail grid · `ps_pdf.js` PDF writer · `ps_send.js` Hub send · `ps_store.js` saving
- `vendor/jsQR.js` (+ LICENSE) for Scan QR when BarcodeDetector is missing

## Keys
Ctrl+S export PDF · Delete removes the focused page · Ctrl+Z undo last crop / rotate / filter · Esc closes the editor · Arrows move focus (D-pad), Enter activates.

## Saved data
IndexedDB `paper-scan` / `pages` (original photo + processed JPEG + corners, rotation, filter). localStorage `paper-scan-order`, `paper-scan-quality`; Hub code `shared-link-join-code` (shared).

## Errors
- Non-photo files are skipped with a note. Unreadable photo → message on the status line, page stays so it can be retaken.
- Corners in a line → "drag them apart". Hub code wrong → "Hub not found" banner with Retry (SharedLink). No device connected (in Hub) → alert.

## Manual test (browser)
1. Open `apps/office/paper-scan/paper-scan.html` on a phone → 📷 Camera, shoot a page → editor opens; drag corners onto the paper edges → ✓ Done → thumbnail is flat and white.
2. Add 2 more with 🖼 Photos; reorder with ↑ ↓; ✕ one; ⟲ retake one; try each filter.
3. Reload → pages and order are back.
4. ⬇ PDF → opens with the right page count and order; switch Quality → size changes.
5. 🖨 Print → print dialog; ↗ Share → WhatsApp in the list.
6. 📤 Send → enter / scan the Hub code → PDF shows in the Hub viewer.
7. In the Hub on desktop: arrows move focus, Ctrl+S downloads, Delete removes a focused page, Ctrl+Z undoes.

## Known limits
- Auto edge detection works best with light paper on a darker background; low contrast falls back to the centred A4 crop.
- The editor photo stays unrotated; the mini-preview (bottom-right) shows the rotated result.
- Very large photos (>20 MP) may be slow on old phones; pages are processed one at a time.
