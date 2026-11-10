# PDF Tools

## 1. What it is
A page organiser for PDF files that runs entirely in the browser: open one or more PDFs, see every page as a thumbnail, reorder by dragging, rotate, delete, duplicate, insert blank pages, extract or split, and save a new copy. Nothing is uploaded. Current release **P2** (P1 was the first organiser). Planned: P3 images ↔ PDF, P4 stamps / crop / metadata, P5 fill & sign.

## 2. Files
- `pdf-tools.html` / `pdf-tools.css`: page shell, compact layout, light / dark, safe-area
- `pdf-tools_ui.js`: shared state `PT.S`, `RELEASE`, settings + theme, small menu, own dialog / form, messages as cards (`../shared/office-notify.js`)
- `pdf-tools_load.js`: Open (new session, several files at once), Add (append to this grid), drag-drop, validation and friendly errors
- `pdf-tools_thumbs.js`: thumbnail grid, lazy rendering, colour source badges when more than one file is open
- `pdf-tools_select.js`: selection, drag-to-reorder (mouse + touch long-press), auto-scroll
- `pdf-tools_edit.js`: rotate, delete (with confirm), move, duplicate, insert blank, extract, split, undo / redo, save
- `pdf-tools_save.js`: **every file goes through `PTSave.save(blob, name)`** (Hub Drive can replace it later), plus `build()` with pdf-lib
- `pdf-tools_zip.js`: tiny stored (method 0) ZIP writer, adapted from Draftly, used when a split makes more than one file
- `pdf-tools_util.js`: pure helpers (range parser, split plans, names, sizes). Node-tested by `test_pdf_tools_util.js`
- `pdf-tools_app.js`: rail buttons, keyboard shortcuts, start-up
- `vendor/pdf-lib.min.js` (pdf-lib **1.17.1**, UMD, MIT, `vendor/LICENSE.md`)
- pdf.js is **read-only** from the Hub's `shared/vendor/pdfjs/` (3.11.174, Apache-2.0)
- `pdf-tools_icon.png`, `index.html` (opens `pdf-tools.html`)

## 3. Behaviour rules
- **Layout:** header (file name, page count / selection count) and the grid on the left; the action rail is on the **RIGHT** (right-handed): Menu, Open, Add, Select all, Rotate left, Rotate right, Delete, Duplicate, Insert blank, Undo, Redo and, at the bottom, the big **Save** button. Extract and Split live in the menu. The rail scrolls if the screen is short.
- **Open:** Open button, Ctrl+O, or drop PDFs on an empty session. Several PDFs can be chosen at once and land in the same grid. Opening another set with unsaved changes asks first. Password-protected / encrypted PDFs and broken or non-PDF files show a friendly message in the app's own dialog.
- **Add:** Add button, or drop PDFs onto an open session, appends those pages (undoable). Pages keep a colour badge and the source file name when more than one file is in the grid. You can drag pages across files; order in the grid is the order in the saved PDF.
- **Thumbnails:** only pages near the screen are rendered (IntersectionObserver, 400 px margin), one at a time with a yield in between, so 100+ page files stay responsive. Each original page is rendered once; rotation is shown with CSS and a small "90°" badge. Duplicates reuse the same thumbnail.
- **Select:** mouse click = just this page (click again to clear), Ctrl / ⌘ = toggle, Shift = range; click empty space clears. Touch: tap toggles. Select all (Ctrl+A) toggles all / none. Esc clears.
- **Reorder:** mouse: press and move. Touch: long-press (~0.4 s), then drag; a normal swipe scrolls. Dragging a selected page moves all selected pages (kept in order); a blue bar shows where they will land. The grid auto-scrolls near its top / bottom edge.
- **Rotate:** left / right 90° on the selected pages (R / Shift+R). Saved as the page's own rotation plus the change.
- **Delete:** selected pages, after the app's own confirm (Del / Backspace). Deleting every page is refused.
- **Duplicate:** copies each selected page immediately after it (Ctrl+D). The copies become the new selection.
- **Insert blank:** adds a white page after the last selected page, or at the end if nothing is selected (B). The size matches the neighbour (or A4 if there isn't one).
- **Extract:** menu / Ctrl+E saves only the selected pages as `name-extract.pdf`.
- **Split:** menu dialog. Single pages, ranges such as `1-3, 7` (each range becomes its own file; pages you leave out are not included), or every N pages. One file is a PDF; several files are a `.zip`. Names like `name-p001.pdf` or `name-p001-003.pdf`.
- **Undo / Redo:** every move, rotate, delete, duplicate, insert blank and add (Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z), up to 200 steps. Extract, split and save do not change the grid, so they are not undo steps.
- **Save:** builds a new PDF with pdf-lib (pages copied from their source files, so text and quality are kept; blank pages are new) and downloads `name-edited.pdf`, or `name-merged.pdf` when more than one file contributed pages. Leaving the page with unsaved changes asks first.
- **Theme:** Dark (default) / Light / System in the menu; System follows the Hub preference `sites-hub.theme`, else the device.
- **Cache strings:** `?v=P2` is on this app's own CSS and JS only (same convention as Spreadsheet SH8 / Slides / Base). Shared Office files, pdf.js and pdf-lib have none. The title, `RELEASE` and those `?v=` tags are all `P2`.

## 4. Storage
- localStorage `pdf-tools-settings-v1` (`theme`). Files are only held in memory.

## 5. Limits
- Adding a file only appends its pages; it does not keep the original file as a separate document once pages have been moved or deleted. Badges follow the source file a page came from.
- Form fields and annotations are copied only as far as pdf-lib's `copyPages` allows (P5 will add filling). Bookmarks, destinations and some metadata can be dropped.
- Password-protected PDFs cannot be opened. There is no encryption on save.
- Split-by-range leaves out pages you do not list. Overlapping ranges are allowed and write the overlapping pages into more than one file.
- A stored ZIP is not compressed (PDFs are already compressed). Very large splits are built one part at a time, but they still use memory for the zip.
- Inserted blank pages have no running header or page number (P4).
