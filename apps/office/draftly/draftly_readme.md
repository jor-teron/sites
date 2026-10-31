# Draftly

## 1. What it is
An offline document editor laid out as fixed A4 pages, like a word processor. Text flows from page to page line by line. Documents autosave in the browser and download as PDF or DOCX. Plain JavaScript, no internet needed, works from `file://`.

## 2. Files
- `draftly.html`: page shell; links the stylesheets and scripts in order (order matters)
- `ui/` stylesheets, linked in this cascade order:
  `fonts.css` (Tinos faces), `theme.css` (variables, light/dark), `base.css`, `toolbar.css`,
  `popups.css` (File / Recent / Page), `workspace.css`, `ribbon.css`, `page.css` (paper, page numbers, breaks),
  `editor.css`, `marks.css`, `print.css`, `colour.css`, `find.css`,
  `statusbar.css` (status bar, word count, zoom), `table.css`, `format.css` (selection, sup/sub),
  `headerfooter.css`, `margins.css` (Custom margins dialog)
- `modules/draftly-config.js`: all sizes, keys, timings and default text
- `modules/draftly-storage.js`: IndexedDB documents, theme / marks / orientation flags
- `modules/draftly-ui.js`: messages as cards (`../shared/office-notify.js`), theme, orientation, toolbar active state, click helper, theme / marks buttons
- `modules/draftly-editor.js`: selection, formatting commands, font, plain-text paste (`pastePlain`), Enter / Shift+Enter
- `modules/draftly-paste.js` (DF16): formatted paste - allow-list sanitizer, Word / Google Docs / LibreOffice clean-up, tables, data images, "Paste as text" chip
- `modules/draftly-pages.js`: page cards and pagination entry points
- `modules/draftly-flow.js`: flow across pages (push / pull, caret, reflow, joined HTML)
- `modules/draftly-flow-blocks.js`: block helpers for flow (measure, join, text map, split a block)
- `modules/draftly-marks.js`: ¶ / ↵ format marks overlay
- `modules/draftly-export.js`: DOCX download, Print, File-menu export buttons, Ctrl+P
- `modules/draftly-docxgen.js`: MM6 real DOCX writer (editor HTML to WordprocessingML, packed with `draftly-zip.js`)
- `modules/draftly-pdf.js`: PDF download (image PDF; since MM4 only the fallback for non-Latin text or errors)
- `modules/draftly-pdfgen.js`: MM4/DF14 real-text PDF (selectable text, jsPDF standard fonts) and Merge to PDF
- `modules/draftly-lists.js`: bullet and numbered lists
- `modules/draftly-view.js`: fit-to-screen scaling, Recent and Page popups
- `modules/draftly-history.js`: undo / redo
- `modules/draftly-breaks.js`: page breaks and page numbers
- `modules/draftly-colour.js`: font colour and highlight
- `modules/draftly-wordcount.js`: word count, status bar on / off
- `modules/draftly-find.js`: text model, Find & Replace, wiring for find and word count
- `modules/draftly-table.js`: tables
- `modules/draftly-spacing.js`: line spacing and indents
- `modules/draftly-zoom.js`: document zoom
- `modules/draftly-headerfooter.js`: Header & Footer (left / centre / right slots, fields {page} {pages} {date}, saved with each document; the Page-tab page-number buttons write {page} into the footer)
- `modules/draftly-margins.js`: Custom margins dialog (0.5–5 cm per side, "Same for all"; a global pref like Normal / Narrow)
- `modules/draftly-docs.js`: load / open / new / delete / save, Recent list, autosave, Ctrl+S
- `modules/draftly-format.js`: Home-tab formatting buttons, selects, shortcuts, toolbar sync
- `modules/draftly-ribbon.js`: ribbon tabs and File menu (File > Rename asks with a dialog; File > Dark mode / Light mode toggles the theme, same `draftly_theme` pref as the top-row button)
- `modules/draftly-dialog.js` (alias of the shared `../shared/office-dialog.js` + `office-dialog.css`): modal `Draftly.dialog.prompt({title, label, value, okLabel})` → name or null, and `Draftly.dialog.confirm({title, message, okLabel, danger})` → true/false. Enter = OK (unless Cancel has focus), Esc or a backdrop click = cancel, focus stays inside. A prompt refuses empty text. A danger confirm has a red OK and starts on Cancel. Draftly uses no window.prompt / confirm / alert.
- `modules/draftly-hub.js`: sites hub bridge (v:1). Only active in a frame. After `hub-hello` it adds `body.in-hub`, which hides the top row. It sends `hub-app` {app, tabs, activeTab, title}, `hub-tab` {id} and `hub-title` {value}. It handles `hub-action` {id:'tab:<id>'}: `tab:file` opens the File menu at the top-left of the frame. The message shapes are kept in `Draftly.hub.shape`.
- `modules/draftly-app.js`: thin start-up (checks modules, calls each `bind()`, loads the document)
- `vendor/` (local, MIT; see `vendor/README.txt`):
  - `html-docx.js`: html-docx-js 0.3.1, old DOCX writer; since MM6 only a fallback if `draftly-docxgen.js` throws (it stores the text as an embedded HTML chunk that only Word shows; LibreOffice and viewers show a blank page)
  - `jspdf.umd.min.js`: jsPDF 2.5.1, PDF file
  - `html2canvas.min.js`: html2canvas 1.4.1, page images for the PDF
- `assets/fonts/tinos/`: Tinos fonts (regular, bold, italic, bold italic), a Times New Roman-compatible fallback, with licences
- `draftly_icon.png`: hub icon
- `index.html`: opens `draftly.html`

- Mail merge (MM1): `ui/merge.css`; `modules/draftly-csv.js` (CSV reader), `draftly-merge.js` (engine and settings), `draftly-zip.js` (stored zip writer), `draftly-merge-ui.js` (Merge tab, chooser, preview, Export all); samples in `samples/`
- Excel import (MM3): `modules/draftly-xlsx.js` (.xlsx reader: zip + XML, no library), `modules/draftly-numfmt.js` (Excel number / date format text); `samples/merge_sample.xlsx` and its generator `samples/make_merge_sample.py`. Only if the browser has no `DecompressionStream`, `shared/vendor/jszip.min.js` (JSZip, MIT) is loaded as a fallback

## 3. Behaviour rules
- **Pages:** fixed A4 (21 × 29.7 cm) or Legal (8.5 × 14 in, 21.59 × 35.56 cm), portrait or landscape. An old saved Letter choice loads as A4. Margins: top 0.5, bottom 0.5, left 2, right 2 cm. Pages never stretch.
- **Flow:** when a page is full, the overflowing lines move to the next page; a paragraph that crosses the bottom is split at the last line that fits. Deleting pulls content back. Split paragraphs are joined again when saving or exporting.
- **Enter / Shift+Enter:** Enter starts a new paragraph (6 pt space after it). Shift+Enter is a line break inside the paragraph.
- **¶ button (format marks):** shows ¶ at each paragraph end and ↵ at each line break. They are drawn on an overlay only, so they are never saved, printed or exported and don't change line wrapping. The on/off setting is remembered.
- **Type:** Times New Roman (machine font), else the built-in Tinos, then Liberation Serif, then serif. Size list 8–36 (default 12 pt). Line height 1.6.
- **Formatting:** bold, italic, underline, align left / centre / right, lists (• bullet, 1 2 3, a b c, A B C; suffix `.` `,` `)` or none for numbered lists, display only).
- **Paste (DF16):** formatted. Bold, italic, underline, strike, sup/sub, colour, highlight, font size (nearest Draftly size), headings, lists, links, tables and pasted images are kept; everything else is cleaned out. Ctrl+Shift+V pastes plain text, and a **Paste as text** chip appears after a formatted paste.
- **Saving:**
  - Autosave 0.8 s after typing stops, when closing the tab, and on the Save button or Ctrl/Cmd+S ("Saved <name>").
  - Documents are kept in IndexedDB by the name in the name box, and saving overwrites that name. An empty name box gets `Doc_YYYY_MM_DD_HH-MM`. Typing a new name and saving makes a new document.
  - On start the last opened document loads (else the newest one, else a welcome page).
- **Recent (clock button):** lists saved documents newest first; tap one to open it.
- **PDF:** one image per page, true A4 in the current orientation, light colours, no marks. Named after the document. Text in the PDF isn't selectable.
- **DOCX:** a real Word document (text in `word/document.xml`, so Word, LibreOffice, Google Docs and viewers all show it) with the same A4 size, orientation, margins and font; Word re-paginates it. Kept: headings, bold / italic / underline / strike, colours and highlight, font and size, sub / superscript, links, alignment, indent, bullet and numbered lists (nested), tables (borders, shading, merged cells), images (PNG / JPEG / GIF), horizontal rules, page breaks, header / footer. Merge (Export all, zip or combined) uses the same writer, so the merged values are in the file.
- **Print:** each page prints as one A4 sheet exactly as on screen (browser dialog; Save as PDF also works there).
- **Fit to screen:** on screens narrower than a page, the pages are scaled down to fit the width. They are never enlarged.
- **Page popup (page button):** Portrait / Landscape, plus size, margins and page count. Orientation is remembered.
- **Theme:** moon / sun button switches dark and light; remembered. The paper, print and PDF always stay white.

### Header & Footer
- Insert > Header & Footer, or double-click a page's top or bottom margin. Esc, Close, or a click in the body ends editing.
- Three plain-text slots per row, the same on every page. Field buttons: Page #, of Pages, Date.
- Drawn inside the margins, so page breaks never move. Shown on screen, in Print and PDF; DOCX gets real Word header / footer parts (PAGE / NUMPAGES fields; the date is written as text).
- Older documents with page numbers turned on start with {page} in the footer.

### Mail merge (Merge tab: CSV and Excel .xlsx)
- Write placeholders as `{{Column Name}}`. Matching ignores spaces around the name and upper/lower case. `{{#}}` is the row number (1, 2, 3 …) unless the data has a column called `#`.
- **Data**: *Choose file* (CSV or Excel `.xlsx`) opens a chooser for the files of the Hub drives (Local, or a folder you mounted in the Hub drive; no file picker). *Browse this computer* is the fallback: it uses the browser's file picker. *Refresh* reads the file again. For CSV the delimiter is detected (`,` `;` or tab); the select can force one (hidden for Excel files). The file type is found from its content, not its name.
  - The first row must be the header. Duplicate header names get ` (2)`, ` (3)`; short rows are padded and long rows trimmed, with a warning; the file may be UTF-8 (with or without BOM) or UTF-16 with BOM; anything else is read as Windows-1252, with a note.
  - **Excel (.xlsx, .xlsm; MM3)**: the first sheet is used; when the workbook has two or more visible sheets a *sheet* dropdown appears next to the file name (hidden sheets are not listed). The chosen sheet is remembered for that file (`sheet` in the saved settings); if it is gone after a change the first sheet is used, with a note. Choosing another file starts on its first sheet. The header is the first non-empty row; leading empty rows and empty columns are skipped, and a title row above the table becomes the header, so delete it in Excel.
  - Cell values are read as the text Excel shows: numbers use the cell's number format (`#,##0.00`, `0%`, `€`, scientific, fractions, `[>n]` conditions, text in quotes), dates use the date format (e.g. `05-Mar-2024`; the short locale formats are shown as `yyyy-mm-dd`), `TRUE` / `FALSE` for booleans, error cells as their code (`#N/A`), formulas as their last saved result, shared and inline strings, `_x000D_` escapes decoded. Merged cells: the value is in the top-left cell only. The 1900 and 1904 date systems are handled. The display is an approximation of Excel (English month and day names, no colours, no regional settings).
  - Formulas keep the result the program saved. A file written by a script (e.g. openpyxl) has no results: those cells are blank and a warning is shown; open and save it once in Excel or LibreOffice.
  - Limits: at most 20000 data rows are read (a warning says so; Export all still allows 2000, see below), 1000 columns, 200 MB per part. Old `.xls` and `.ods` are not read (the message says to save as .xlsx). Password-protected files and Zip64 are not supported. Images, charts, comments and formatting are ignored.
  - A file from the browser's file picker with a handle (Chrome / Edge) can be re-read for live refresh. A file from the old `<input type=file>` can't (the browser gives a snapshot): choose it again after you change it.
- **Fields**: *Insert field* puts `{{Name}}` at the caret. Known placeholders are shaded green in the text, unknown ones red; unknown ones are also listed under the *warning* button and stay as typed in the output.
- **Preview**: shows the document with one row's values (Previous / Next). It is a copy: the document is not changed. Values are shown as text (HTML in a cell is not run); line breaks in a cell are kept. While preview is open, and while the file is chosen from a drive, the file is checked every 3 seconds; if it changed, the fields and the preview update and the row number is kept. When preview is closed a *File changed* mark shows instead; press *Refresh*.
- **Export all**: one DOCX per row in a `.zip`, or one combined DOCX with a page break between rows (header / footer fields such as page number and date stay blank in the combined file). File names come from a pattern, default `<document name>-{{#}}`; characters `\ / : * ? " < > |` and control characters become `_`, names are cut at 80 characters, and duplicates get ` (2)`, ` (3)`. Limit 2000 rows (split larger files; the same for Excel); over 200 rows shows a note; progress and Cancel are shown.
- Saved in `draftly_merge_settings`: the file name (and drive path), delimiter, sheet (Excel), file name pattern, export type and row number. The file content is not saved.
- Try it: open `samples/merge_sample.csv` (copy it to a Hub drive), type or paste `samples/merge_template.txt` into a new document, then Merge → Choose file. `samples/merge_sample.xlsx` has the same customers on a *Customers* sheet (dates, number formats, a formula, a yes/no column) plus an *Orders* sheet, so you can try the sheet dropdown; rebuild it with `python3 samples/make_merge_sample.py` (needs openpyxl and LibreOffice).
- Not yet: PDF output (Merge exports DOCX only; merged PDF is not available yet), ods / xls / Google Sheets, images or conditions in the template. A placeholder split by formatting (e.g. half bold) is merged but not shaded.

### Merge to PDF (MM4) and real-text PDF (DF14)
- File > PDF and Merge > Finish > Export PDF write a PDF with real, selectable text (words measured from a hidden copy of the page, drawn with jsPDF Times/Helvetica/Courier), plus borders, table fills, highlights, underline/strike, images, list markers, header and footer (`{page}`, `{pages}`, `{date}`).
- With merge data loaded, a dialog asks: all rows in one PDF (`<name>-merge.pdf`), one row (`<name>-row<N>.pdf`), or (from File only) the plain template (`<name>.pdf`). Progress bar with Cancel.
- Limits: standard fonts only (look close, not exact); text outside Latin-1/WinAnsi falls back to the old image PDF (in merge, image slices may cut a line); a table row taller than a page is not split; in merge `{page}`/`{pages}` count per row; highlight is drawn per word. MM7 (header/footer fields in the combined merge DOCX) not done.

## 4. Keyboard
- Ctrl/Cmd+S saves (works anywhere on the page)
- Ctrl/Cmd+B / I / U: bold, italic, underline (in the text)
- Enter: new paragraph; Shift+Enter: line break
- Esc closes the Recent or Page popup
- Ctrl/Cmd+Z undo, Ctrl+Y or Ctrl/Cmd+Shift+Z redo (also the Undo / Redo toolbar buttons). Draftly keeps its own history of up to 100 steps (a typed word, a format change, a line break), so undo works across page breaks. Opening, New or Delete clears it.
- Other editing keys (copy, paste, arrows) are the browser's own.

Works inside the hub and responds to its phone D-pad, but the hub's key presses are synthetic: only shortcuts the app handles itself work (e.g. Ctrl+S / B / I / U, Enter, Esc). Browser actions such as typing letters, moving the caret or undo don't happen.

## 5. Saved data
- IndexedDB database `draftly`, store `documents` (one record per name: `name`, `html`, `updated`).
- localStorage:
  - `draftly_last_name`: last opened document
  - `draftly_theme`: `dark` / `light`
  - `draftly_nonprinting`: `1` / `0` (format marks)
  - `draftly_orientation`: `portrait` / `landscape`. Before 2026-10-21 it was saved under the literal key `undefined`; at start-up that value is copied to `draftly_orientation` (if empty) and the `undefined` key is removed, only when it holds `portrait` / `landscape` (other data under that key is left alone)
  - `draftly_margins`: old key, removed at start-up
  - `draftly_merge_settings`: Merge tab settings (JSON: `src`, `delim`, `sheet`, `pattern`, `fmt`, `row`)
  - `draftly-ribbon-tab`: last ribbon tab (now may be `merge`)
- To reset, clear site data for the page. A single document is removed with File > Delete document (asks first).

## 6. Errors
Messages show briefly at the bottom (2.2 s):
- "Could not save", "Could not open document", "Could not read recent documents"
- "Making PDF…" then "PDF downloaded"; "Could not make PDF", "Could not save PDF", "PDF libraries missing"
- "DOCX exported successfully" / "Failed to export DOCX"
- If the real DOCX writer throws, a console warning "real DOCX build failed, using the html-docx fallback" is logged and the old html-docx file is made instead (blank outside Word)
- Also "Opened <name>", "Orientation: portrait / landscape"
- The Recent list shows "No saved documents" when empty.
- A module that fails to load is logged in the console and skipped.

## 7. Screen sizes
- Desktop: a slim 36 px top row (brand, File, tabs, name, theme; 28 px controls) above the ribbon row; pages at true size, centred.
- Inside the sites hub: the top row is hidden, the hub's title bar shows the tabs and name, and the ribbon sits at the top.
- Up to 820 px wide: smaller toolbar, the "Draftly" name is hidden, and the toolbar scrolls sideways. Pages are scaled to fit.
- Popups stay inside the screen and follow their button when the toolbar scrolls.

## 8. Safe settings (`modules/draftly-config.js`)
- `marginTopCm`, `marginBottomCm`, `marginLeftCm`, `marginRightCm`: page margins (DOCX margins follow them)
- `defaultOrientation`: `portrait` or `landscape`
- `fontFamily`, `fontSizePt`, `lineHeight`, `paragraphSpacingPt`: type
- `pageGapPx`: gap between pages on screen
- `namePrefix`: start of automatic names
- `toastMs`: how long messages stay (cards stay at least ~5 s)
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
6. Page popup → Landscape, reload: still landscape (localStorage `draftly_orientation` = `landscape`, no `undefined` key).
7. Narrow the window: pages shrink to fit.
8. Dark theme, reload: still dark.

## 10. Known limits
- PDF pages are images: text isn't selectable or searchable, and files are bigger.
- DOCX is re-paginated by Word, so page breaks may differ from the screen.
- DOCX: images must be PNG / JPEG / GIF data (pasted or inserted); webp, svg and remote images are skipped. Floating / positioned content, column layout, fonts not installed on the reader's computer, and line spacing at exact multiples of the editor's are approximations. The combined Merge DOCX has one header / footer for all rows (row fields blank).
- Paste (DF16): remote (http) images are skipped (offline); colspan / rowspan are flattened to plain cells; a table pasted inside a table cell becomes tab-separated lines; fonts (font-family), margins, alignment and line spacing from the source are not kept; HTML over 2 MB is pasted as plain text with a toast; Google Docs 11pt maps to 10pt (nearest Draftly size).
- Times New Roman is used only if installed; otherwise Tinos (same widths).
- Rename (File > Rename, or typing in the name box) moves the document to the new name; it does not make a copy. File > Delete document removes it after a confirm. DF15-B1: renaming to a name another saved document has asks first: Use "name (n)", Replace (second confirm, deletes the other one) or Cancel. Edits stay under the old name until you choose.
- Old version after an update: hard-refresh.

## 11. Change log
- 2026-10-30 IST: MM4 Merge to PDF + DF14 real-text PDF (`draftly-pdfgen.js`); old image PDF kept as fallback.
- 2026-10-23 IST: MM6 real DOCX export: new `draftly-docxgen.js` writes WordprocessingML (all DOCX paths, incl. Merge zip / combined, were blank outside Word before); html-docx kept only as a fallback.
- 2026-10-23 IST: MM3 Excel (.xlsx) import for Merge: own reader (no library), sheet dropdown (remembered), number and date formats as shown in Excel, live refresh like CSV; `samples/merge_sample.xlsx`.
- 2026-10-23 IST: MM1 mail merge: Merge ribbon tab, CSV reader, live refresh, preview, Export all (zip / combined DOCX).
- 2026-10-23 IST: orientation fix: saved only under `draftly_orientation` (config `storageKeyOrientation`); the old `undefined` key (written 2026-10-02 to 2026-10-21, when that config entry was missing) is migrated once at start-up and removed if it holds an orientation value. Invalid values are not saved.
- 2026-10-31 IST: DF15-B1, rename no longer overwrites an existing document (File > Rename and the name box).
- 2026-10-21 IST: Draftly dialogs (rename and delete) replace browser prompts; Dark/Light mode item in the File menu.
- 2026-10-21 IST: slimmer top row (36 px, 28 px controls, smaller brand); hub bridge `draftly-hub.js` (tabs and title in the hub title bar).
- 2026-10-04 21:14 IST: fit to screen, slim toolbar, Page popup, cleanup (margins box, status bar and version removed), Cmd keys, icon; hub name "Draftly" (commit 386541e).
- 2026-10-04 19:01 IST: fixed A4 pages, line-by-line flow, Enter / Shift+Enter, ¶ / ↵ marks, PDF download, offline libraries, Tinos fonts (commit c17c51d).
- 2026-10-02 19:01 IST: moved to `apps/office/draftly/` (commit 8cb4c69, folder rearrange).
- 2026-10-02 18:22 IST: first added under `office/draftly/` (commit 9c18c10).

## 12. Related apps
- Notely: notes.
- Notepad: plain text.

## Shared Office files

`apps/office/shared/` holds code shared with the Spreadsheet: `office-dialog.js/.css` (the dialogs above) and `office-page.js` (paper sizes, margin clamping and the `@page` rule used by print and DOCX export). Draftly's storage keys and margin prefs are unchanged.

## SH4 — shared ribbon controls
Shared `../shared/office-tools.css` (tool groups, tool buttons, File menu items) and `office-icons.js` (one SVG icon set via `data-icon`). Both apps use the same Bold/Italic/Underline, Align left/center/right and File menu icons. Spreadsheet: Draftly-style File menu (with Settings) and Alignment buttons instead of the select.

- SH5: Settings opens as a centred pop-up dialog (shared office-settings.*, ?v=2).

## DF16 - Formatted paste (30 Oct 2026)

- New `modules/draftly-paste.js`; `Draftly.editor.onPaste` now calls `Draftly.paste.handle` (legacy plain paste kept as a comment, plain path is `Draftly.editor.pastePlain`, R7 font rule kept).
- Clipboard HTML is parsed with DOMParser (inert, no scripts run) and rebuilt from an allow-list. Kept: b/strong, i/em, u, s/strike/del, sup, sub, a (http/https/mailto only), h1-h3 (bold 24/18/14pt paragraphs), p, br, ul/ol/li, table/tr/td/th (FT7 table style, th -> bold td), `data:` PNG/JPEG/GIF/WebP images (as `dl-img-block`, resizable). Inline styles kept: color, background-color, font-weight, font-style, text-decoration, font-size.
- Dropped: script/style/meta/link/iframe/object/svg/form and other embeds, on* attributes, class/id, Word `mso-*` styles and list bullet spans (MsoListParagraph -> real lists), comments / conditional comments, the Google Docs `b#docs-internal-guid` wrapper, LibreOffice font wrappers.
- Plain text: text/plain only, Ctrl+Shift+V, or HTML over 2 MB (toast). An image-only clipboard (file) goes through `Draftly.image.load` + `insert`.
- Inside a table cell: no nested tables (rows -> lines, cells -> tabs), block tags become line breaks.
- One undo step per paste; "Paste as text" chip swaps the paste for plain text, still one step. Pages reflow after paste.
- Tests: `/tmp/mm4t/df16.js` (32 checks) http + file://.
