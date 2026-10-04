# Draftly

## 1. What it is
An offline document editor laid out as fixed A4 pages, like a word processor. Text flows from page to page line by line. Documents autosave in the browser and download as PDF or DOCX. Plain JavaScript, no internet needed, works from `file://`.

## 2. Files
- `draftly.html` / `draftly.css`: toolbar, popups, paper look, print
- `modules/draftly-config.js`: all sizes, keys, timings and default text
- `modules/draftly-storage.js`: IndexedDB documents, theme / marks / orientation flags
- `modules/draftly-ui.js`: toast, theme, orientation, toolbar active state
- `modules/draftly-editor.js`: selection, formatting commands, font, plain-text paste, Shift+Enter line break
- `modules/draftly-pages.js`: page cards and pagination entry points
- `modules/draftly-flow.js`: line-by-line flow across pages
- `modules/draftly-marks.js`: ¶ / ↵ format marks overlay
- `modules/draftly-export.js`: DOCX download and Print
- `modules/draftly-pdf.js`: PDF download
- `modules/draftly-lists.js`: bullet and numbered lists
- `modules/draftly-view.js`: fit-to-screen scaling, Recent and Page popups
- `modules/draftly-app.js`: start-up, buttons, keys, autosave
- `vendor/` (local, MIT; see `vendor/README.txt`):
  - `html-docx.js`: html-docx-js 0.3.1, DOCX export
  - `jspdf.umd.min.js`: jsPDF 2.5.1, PDF file
  - `html2canvas.min.js`: html2canvas 1.4.1, page images for the PDF
- `assets/fonts/tinos/`: Tinos fonts (regular, bold, italic, bold italic), a Times New Roman-compatible fallback, with licences
- `draftly_icon.png`: hub icon
- `index.html`: opens `draftly.html`

## 3. Behaviour rules
- **Pages:** fixed A4 (21 × 29.7 cm), portrait or landscape. Margins: top 0.5, bottom 0.5, left 2, right 2 cm. Pages never stretch.
- **Flow:** when a page is full, the overflowing lines move to the next page; a paragraph that crosses the bottom is split at the last line that fits. Deleting pulls content back. Split paragraphs are joined again when saving or exporting.
- **Enter / Shift+Enter:** Enter starts a new paragraph (6 pt space after it). Shift+Enter is a line break inside the paragraph.
- **¶ button (format marks):** shows ¶ at each paragraph end and ↵ at each line break. They are drawn on an overlay only, so they are never saved, printed or exported and don't change line wrapping. The on/off setting is remembered.
- **Type:** Times New Roman (machine font), else the built-in Tinos, then Liberation Serif, then serif. Size list 8–36 (default 12 pt). Line height 1.6.
- **Formatting:** bold, italic, underline, align left / centre / right, lists (• bullet, 1 2 3, a b c, A B C; suffix `.` `,` `)` or none for numbered lists, display only).
- **Paste:** plain text only.
- **Saving:**
  - Autosave 0.8 s after typing stops, when closing the tab, and on the Save button or Ctrl/Cmd+S ("Saved <name>").
  - Documents are kept in IndexedDB by the name in the name box, and saving overwrites that name. An empty name box gets `Doc_YYYY_MM_DD_HH-MM`. Typing a new name and saving makes a new document.
  - On start the last opened document loads (else the newest one, else a welcome page).
- **Recent (clock button):** lists saved documents newest first; tap one to open it.
- **PDF:** one image per page, true A4 in the current orientation, light colours, no marks. Named after the document. Text in the PDF isn't selectable.
- **DOCX:** one continuous document with the same A4 size, orientation, margins and font; Word re-paginates it.
- **Print:** each page prints as one A4 sheet exactly as on screen (browser dialog; Save as PDF also works there).
- **Fit to screen:** on screens narrower than a page, the pages are scaled down to fit the width. They are never enlarged.
- **Page popup (page button):** Portrait / Landscape, plus size, margins and page count. Orientation is remembered.
- **Theme:** moon / sun button switches dark and light; remembered. The paper, print and PDF always stay white.

## 4. Keyboard
- Ctrl/Cmd+S saves (works anywhere on the page)
- Ctrl/Cmd+B / I / U: bold, italic, underline (in the text)
- Enter: new paragraph; Shift+Enter: line break
- Esc closes the Recent or Page popup
- Other editing keys (undo, copy, paste, arrows) are the browser's own.

Works inside the hub and responds to its phone D-pad, but the hub's key presses are synthetic: only shortcuts the app handles itself work (e.g. Ctrl+S / B / I / U, Enter, Esc). Browser actions such as typing letters, moving the caret or undo don't happen.

## 5. Saved data
- IndexedDB database `draftly`, store `documents` (one record per name: `name`, `html`, `updated`).
- localStorage:
  - `draftly_last_name`: last opened document
  - `draftly_theme`: `dark` / `light`
  - `draftly_nonprinting`: `1` / `0` (format marks)
  - orientation: saved under the key `undefined` (see Known limits)
  - `draftly_margins`: old key, removed at start-up
- To reset, clear site data for the page. There is no delete button for single documents.

## 6. Errors
Messages show briefly at the bottom (2.2 s):
- "Could not save", "Could not open document", "Could not read recent documents"
- "Making PDF…" then "PDF downloaded"; "Could not make PDF", "Could not save PDF", "PDF libraries missing"
- "DOCX exported successfully" / "Failed to export DOCX"
- Also "Opened <name>", "Orientation: portrait / landscape"
- The Recent list shows "No saved documents" when empty.
- A module that fails to load is logged in the console and skipped.

## 7. Screen sizes
- Desktop: one slim toolbar row; pages at true size, centred.
- Up to 820 px wide: smaller toolbar, the "Draftly" name is hidden, and the toolbar scrolls sideways. Pages are scaled to fit.
- Popups stay inside the screen and follow their button when the toolbar scrolls.

## 8. Safe settings (`modules/draftly-config.js`)
- `marginTopCm`, `marginBottomCm`, `marginLeftCm`, `marginRightCm`: page margins (DOCX margins follow them)
- `defaultOrientation`: `portrait` or `landscape`
- `fontFamily`, `fontSizePt`, `lineHeight`, `paragraphSpacingPt`: type
- `pageGapPx`: gap between pages on screen
- `namePrefix`: start of automatic names
- `toastMs`: how long messages stay
- `inputDebounceMs`: autosave delay after typing
- `pdfScale` / `pdfJpegQuality`: PDF sharpness and size
- `docxFileName` / `pdfFileName`: names used when the name box is empty
- `placeholder`, `defaultHtml`, `fallbackHtml`: starting text
- Leave the storage keys, DOM hooks and paper size alone unless you know the code.

## 9. Browser checklist
1. Type until page 1 is full: the text carries on at the top of page 2 with no gap. Delete lines: it comes back.
2. Enter, then Shift+Enter; turn on ¶: ¶ shows at the paragraph end and ↵ at the line break.
3. Wait a second and reload: the text is still there. Clock button: the document is listed.
4. PDF: downloads `<name>.pdf` with one A4 page per page and no marks.
5. DOCX: downloads `<name>.docx` that opens in Word.
6. Page popup → Landscape, reload: still landscape.
7. Narrow the window: pages shrink to fit.
8. Dark theme, reload: still dark.

## 10. Known limits
- PDF pages are images: text isn't selectable or searchable, and files are bigger.
- DOCX is re-paginated by Word, so page breaks may differ from the screen.
- Orientation is saved under the localStorage key `undefined` (the config has no `storageKeyOrientation` entry). It still works, but another page on the same site using that key could clash.
- Paste is plain text only; no images or tables.
- Times New Roman is used only if installed; otherwise Tinos (same widths).
- No document delete or rename in the app (saving under a new name makes a copy).
- Old version after an update: hard-refresh.

## 11. Change log
- 2026-10-04 21:14 IST: fit to screen, slim toolbar, Page popup, cleanup (margins box, status bar and version removed), Cmd keys, icon; hub name "Draftly" (commit 386541e).
- 2026-10-04 19:01 IST: fixed A4 pages, line-by-line flow, Enter / Shift+Enter, ¶ / ↵ marks, PDF download, offline libraries, Tinos fonts (commit c17c51d).
- 2026-10-02 19:01 IST: moved to `apps/office/draftly/` (commit 8cb4c69, folder rearrange).
- 2026-10-02 18:22 IST: first added under `office/draftly/` (commit 9c18c10).

## 12. Related apps
- Notely: notes.
- Notepad: plain text.
