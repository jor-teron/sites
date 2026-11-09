# PDF Viewer (PV1)

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

## PV2 (planned)

OCR / text extraction: reuse the Tools OCR approach for scanned pages, and
pdf.js text content for PDFs that already have real text.

## Old app

The previous single-page viewer is at `../pdf-viewer-old/` (kept for reference,
not listed separately in Lab).
