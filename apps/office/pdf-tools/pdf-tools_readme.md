# PDF Tools

## 1. What it is
A page organiser for PDF files that runs entirely in the browser: open a PDF, see every page as a thumbnail, reorder by dragging, rotate, delete, and save a new copy. Nothing is uploaded. Version 1.0 = release **P1**. Planned: P2 merge / split, P3 images to PDF, P4 page numbers / watermark / compress.

## 2. Files
- `pdf-tools.html` / `pdf-tools.css`: page shell, compact layout, light / dark, safe-area
- `pdf-tools_ui.js`: shared state `PT.S`, settings + theme, small menu (theme, Close file, About), own dialog, toast
- `pdf-tools_load.js`: Open button, drag-drop, validation and friendly errors
- `pdf-tools_thumbs.js`: thumbnail grid, lazy rendering
- `pdf-tools_select.js`: selection, drag-to-reorder (mouse + touch long-press), auto-scroll
- `pdf-tools_edit.js`: rotate, delete (with confirm), move, undo / redo, save action
- `pdf-tools_save.js`: **every file goes through `PTSave.save(blob, name)`** (Hub Drive can replace it later), plus `build()` with pdf-lib
- `pdf-tools_app.js`: rail buttons, keyboard shortcuts, start-up
- `vendor/pdf-lib.min.js` (pdf-lib **1.17.1**, UMD, MIT, `vendor/LICENSE.md`)
- pdf.js is **read-only** from the Hub's `shared/vendor/pdfjs/` (3.11.174, Apache-2.0)
- `pdf-tools_icon.png`, `index.html` (opens `pdf-tools.html`)

## 3. Behaviour rules
- **Layout:** header (file name, page count / selection count) and the grid on the left; the action rail is on the **RIGHT** (right-handed): Menu, Open, Select all, Rotate left, Rotate right, Delete, Undo, Redo and, at the bottom, the big **Save** button.
- **Open:** Open button, Ctrl+O, or drop a PDF anywhere. Opening another file with unsaved changes asks first. Password-protected / encrypted PDFs and broken or non-PDF files show a friendly message in the app's own dialog.
- **Thumbnails:** only pages near the screen are rendered (IntersectionObserver, 400 px margin), one at a time with a yield in between, so 100+ page files stay responsive. Each original page is rendered once; rotation is shown with CSS and a small "90°" badge.
- **Select:** mouse click = just this page (click again to clear), Ctrl / ⌘ = toggle, Shift = range; click empty space clears. Touch: tap toggles. Select all (Ctrl+A) toggles all / none. Esc clears.
- **Reorder:** mouse: press and move. Touch: long-press (~0.4 s), then drag; a normal swipe scrolls. Dragging a selected page moves all selected pages (kept in order); a blue bar shows where they will land. The grid auto-scrolls near its top / bottom edge.
- **Rotate:** left / right 90° on the selected pages (R / Shift+R). Saved as the page's own rotation plus the change.
- **Delete:** selected pages, after the app's own confirm (Del / Backspace). Deleting every page is refused.
- **Undo / Redo:** every move, rotate and delete (Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z), up to 200 steps.
- **Save:** builds a new PDF with pdf-lib (pages copied from the original, so text and quality are kept) and downloads `name-edited.pdf`. Leaving the page with unsaved changes asks first.
- **Theme:** Dark (default) / Light / System in the menu; System follows the Hub preference `sites-hub.theme`, else the device.

## 4. Storage
- localStorage `pdf-tools-settings-v1` (`theme`). Files are only held in memory.
