# PDF Viewer (PV2)

Fresh Lab PDF viewer. Opens a PDF from **Open** or drag-and-drop, scrolls all
pages continuously, and renders only the pages near the viewport (sharp on
phones via `devicePixelRatio`, capped at 2). pdf.js lives in `vendor/pdfjs/`
so the app works offline with no CDN.

## PV1

- Continuous vertical scroll of every page
- Fit-width by default; Zoom − / + (50%–300%) and Fit
- Page box + keyboard (arrows, PageUp/Down, Home/End); ignores keys in inputs
- Print whole document (warns above 100 pages)
- Password-protected PDFs: browser `prompt()` when pdf.js asks
- PDF stays in memory only — nothing is uploaded

## PV2

Scanned or image-only pages become searchable and copyable.

- Native pdf.js text layer on pages that already have real text, so you can
  select, copy, and use Find without OCR
- **OCR** button (this page, all pages without text, or all pages) with
  progress and Cancel. Offered when a document has pages with no text layer;
  OCR never starts on its own
- Uses the existing Tools OCR engine (tesseract.js + `eng.traineddata`) from
  `../../office/ocr/vendor/` — lazy-loaded on first use, no CDN, no second
  copy of the large files
- Recognised words sit in an invisible selectable text layer, placed from the
  OCR word boxes, so Find and selection work the same way as on a digital PDF
- Language list is only what is already in the repo (English). Results are
  cached per document + page in IndexedDB (`pdfviewer-ocr`) so a re-open is
  instant
- **Copy all OCR text** and **Save as .txt**. In-app Find (Ctrl+F / Cmd+F)
- One page at a time, render scale capped at 2× (longest side 2048 px),
  worker terminated when the job ends — keeps memory down on a 4 GB Celeron

## Limits

- Saving a searchable PDF is not supported (text is a layer in the viewer + a
  `.txt` download, the file itself is not rewritten)
- English only — Hindi / other traineddata files are not in the repo
- The OCR engine cannot start from `file://`; open the app over http(s)
- Quality follows the scan (skew, low resolution, and handwriting suffer)
- A hidden text layer with 20+ letters/digits is treated as real text, so a
  bad existing layer is not OCR'd unless you choose All pages
- Fades / print still use page images; print does not include the OCR layer
- Cache is local to this browser profile

## Old app

The previous single-page viewer is at `../pdf-viewer-old/` (kept for reference,
not listed separately in Lab).
