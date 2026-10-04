# OCR

## 1. What it is
Turns text in photos, scans and PDFs into editable text. Runs offline with Tesseract (English) by default, or with Google Cloud Vision when you add your own API key. Photos can come from a file, the live camera, drag-and-drop, paste, or a phone (scan a QR and send).

## 2. Files
- `ocr.html` / `ocr.css`: toolbar, status line, Preview and Text panels, key popover, QR box, camera overlay
- `ocr_config.js`: every setting (accepted files, engine paths, PDF, Vision, camera, send-from-phone, texts)
- `ocr_state.js`: app state + small event bus
- `ocr_engine.js`: Tesseract worker (one, reused) and Cloud Vision
- `ocr_pdf.js`: PDFs with pdf.js (text layer first, OCR only for scanned pages)
- `ocr_io.js`: files in (picker, drop, paste) and text out (Copy, .txt, .docx)
- `ocr_jobs.js`: open / queue files, page change, Start OCR, All pages, Cancel
- `ocr_camera.js`: live camera (Capture → Use / Retake)
- `ocr_send.js`: computer side of "send from phone" (QR box)
- `ocr_send.html` / `ocr_send.css` / `ocr_send_phone.js`: the phone page opened from the QR
- `ocr_send_common.js`: the shared phone ↔ computer message format
- `ocr_ui.js`: toolbar, tabs, key popover, keyboard, start-up
- `vendor/`: tesseract.js 5.1.1 + cores, English model (tessdata_best int), pdf.js 3.11.174 + fonts, JSZip, PeerJS, qrcode.js (all local; see `vendor/README.txt`)
- `ocr_icon.png`, `index.html` (opens `ocr.html`)

## 3. Behaviour rules
- **Accepted:** JPG, PNG, WebP, PDF; up to 20 MB each, 20 files at a time.
- **One image:** OCR starts at once. Images are scaled to a longest side of 3500 px first.
- **One PDF:** page 1 shows; Start OCR reads this page, All pages reads every page. Each page's own text is used when it has some (exact and instant); only scanned pages are OCR'd (rendered at about 216 dpi). Pages are marked "— Page n —". ‹ › or tap the page number to change page.
- **Several files:** read one after another into one text, each under "=== name ===".
- **Busy lock:** while reading, page changes, new files and engine switches wait; Start / All pages turn into Cancel.
- **Engines:** Tesseract (offline) or Cloud Vision (needs the internet and a key via Key 🗝️; Show / Clear / Save).
- **Camera 📷:** live view (back camera on phones, switch button when there are several). Capture freezes the frame → Use (OCR starts) or Retake. Without camera access it falls back to the phone's photo picker.
- **QR (send from phone):** shows a QR; the phone opens `ocr_send.html`, taps Choose file, and the file arrives here and is read as if dropped. One phone per QR; the phone reconnects by itself after a drop (gives up after 2 minutes); the session ends on ✕ or after 10 minutes idle. A "📱 Connected" chip shows while linked.
- **Text out:** the text box is editable. Copy, Download .txt or .docx (named after the source file, else `ocr-text`).
- **Narrow screens (under 700 px):** Preview / Text tabs show one panel at a time.

## 4. Keyboard
- Ctrl/Cmd+O: open files
- Ctrl/Cmd+Enter: Start OCR
- Ctrl/Cmd+S: save .txt
- ← / → or PageUp / PageDown: previous / next PDF page (not while typing)
- Esc: close the key popover, or cancel a running job
- Camera overlay: Space capture (again = retake), Enter use, R / Backspace retake, Esc close
- Ctrl/Cmd+V: paste an image

Inside the hub the phone D-pad sends synthetic keys: Left / Right change PDF page, Select = Esc cancels, A = Space captures in the camera, Start = Enter uses the photo. The file picker can't be opened from the phone.

## 5. Saved data (localStorage)
- `ocr_engine`: `tesseract` or `vision`
- `ocr_vision_api_key`: your Cloud Vision key (same name as v1, so an old key carries over). Stored in plain text in this browser; Clear removes it.
- No text or files are saved.

## 6. Errors
Status line messages:
- "Only JPG, PNG, WebP or PDF files" / "File is over 20 MB"
- "Busy — wait or Cancel first" / "Busy — file from phone refused"
- "No text found"
- "Password-protected PDFs are not supported"
- "OCR engine failed to load" / "OCR engine cannot start from file:// — open the app over http(s)"
- "Add a Cloud Vision API key first (Key 🗝️)" / "Cloud Vision needs an internet connection"
- "Cancelled" / "Cancelled after n of N files"
- Camera: "Camera permission denied — …", "No camera found", "Camera is busy in another app", "Camera needs the app opened over http(s)", "Camera disconnected", "Camera failed to start"
- Phone: "Phone disconnected", "Phone disconnected (idle … min)"

## 7. Screen sizes
- **Wide (700 px and up):** Preview and Text side by side.
- **Narrow:** Preview / Text tabs.
- **Short (under 420 px tall, e.g. phone landscape or the hub):** tighter toolbar and status line.
- **Camera in short landscape:** shutter bar on the right side.

## 8. Safe settings (`ocr_config.js`)
- `accept.maxBytes`, `accept.maxFiles`
- `ocrMaxSide`, `pdf.minTextChars`, `pdf.ocrScale`, `pdf.ocrMaxSide`, `pdf.previewMaxSide`
- `tesseract.initTimeoutMs` (keep `lang` / `oem` / paths matched to `vendor/`)
- `vision.feature`, `vision.jpegQuality`
- `camera.idealWidth` / `idealHeight`, `camera.phoneFacing`, `camera.text`
- `send.publicBaseUrl`, `send.idleMs`, `send.chunkBytes` (keep under 16300), `send.reconnectDelaysMs`, `send.reconnectGiveUpMs`
- `text.status` (all messages)
- Bump the `?v=` numbers in `ocr.html` / `ocr_send.html` after changing a file.

## 9. Browser checklist
1. Open over http(s): drop a photo of text → text appears.
2. Drop a digital PDF: Start OCR is instant (PDF text); All pages fills every page.
3. Drop a scanned PDF: pages are OCR'd with progress; Cancel stops.
4. Copy, .txt and .docx downloads work.
5. Camera 📷 → Capture → Use → text appears.
6. QR → scan with a phone → send a photo → it is read here.
7. Narrow window: Preview / Text tabs switch.

## 10. Known limits
- Tesseract is English-only (one model vendored); handwriting is weak.
- Tesseract and the camera need http(s); from file:// they won't start.
- Send from phone and Cloud Vision need the internet (PeerJS signalling / Google).
- The Vision key is stored in plain text in localStorage.
- Large PDFs with many scanned pages are slow on phones.

## 11. Change log
- 2026-10-02 19:01 IST: moved into `apps/office/ocr` (folder rearrange, commit 8cb4c69).
- 2026-10-04 02:44 IST: v2, modular offline rebuild: local Tesseract / pdf.js, queue, .docx (commit af93ed0).
- 2026-10-04 03:11 IST: send a file from the phone via QR (commit b54bffb).
- 2026-10-04 03:31 IST: live camera + Camera / QR toolbar buttons (commit 83d2bf8).

## 12. Related apps
- File Drop: general two-way file transfer with the same QR idea.
- QR Scanner: reads QR codes and barcodes.
- MS Word Diff / Notely: for working with the text afterwards.
