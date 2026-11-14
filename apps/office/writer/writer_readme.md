<!-- (before DF24) # Draftly -->
# Writer

<!-- (before DF25) Formerly Draftly. The folder stays `apps/office/draftly/`. File names, storage keys, message types, ids and URLs are unchanged, so saved documents and Hub links keep working. -->
Formerly Draftly. Since DF25 the folder is `apps/office/writer/`, the files are `writer.html` / `modules/writer-*.js`, the JavaScript global is `Writer`, the Hub id is `writer` and the localStorage keys are `writer_*`. Old links, Hub ids and settings keep working (see DF25 below).

## DF25 — full rename

- **Folder and files:** `apps/office/draftly/` → `apps/office/writer/`; `draftly.html` → `writer.html`, `draftly_icon.png` → `writer_icon.png`, `draftly_readme.md` → `writer_readme.md`, every `modules/draftly-*.js` → `modules/writer-*.js` (moved with `git mv`). `vendor/`, `ui/`, `assets/` and `samples/` moved with the app. The page title is `Writer DF25` (`Writer.config.release` = `DF25`).
- **Code:** the global `Draftly` is now `Writer` (`window.Draftly` is kept as an alias of the same object, set in `writer-config.js`). Each module header says which `draftly-*.js` it was; key lines carry `(before DF25)` comments.
- **Old address:** `apps/office/draftly/` keeps only `index.html` and `draftly.html`, thin redirects to `../writer/writer.html` that keep `?query` and `#hash` (so a `.how` opened from Files still arrives). No app files or vendor copies are left there.
- **Hub id:** `writer`. The old id `draftly` still works: `hub/core/hub_apps.js` has a HIDDEN row `apps/office/draftly/` (id `draftly`), so an old `#draftly` link, the last-app memory and saved Desktop windows open the redirect, which lands on Writer; the Hub then shows `#writer`. `shared/fs/filetypes.js` opens `.how` with id `writer` and still answers `FileTypes.app('draftly')` with Writer.
- **Settings:** the keys are now `writer_settings`, `writer_theme`, `writer_nonprinting`, `writer_orientation`, `writer_paper_size`, `writer_margin_preset`, `writer_margin_custom`, `writer_page_numbers`, `writer_page_number_pos`, `writer_ruler`, `writer_status_bar`, `writer_zoom`, `writer-ribbon-tab`, `writer.lastTextColour`, `writer.lastHiliteColour`, `writer_last_name`, `writer-backup`, `writer_merge_settings`. On the first DF25 start on each device `Writer.config.migrateKeys()` (in `writer-config.js`, before any module reads storage) copies every `draftly_*` / `draftly-*` / `draftly.*` key to the same name with `writer`, only where the new key is still empty, then sets `writer_df25_migrated` = `1` and never copies again. The old keys are left in place (a rollback still finds them). `draftly_margins` is not copied (an old key that start-up removes).
- **Unchanged on purpose:** the IndexedDB name `draftly` (Writer has not stored documents there since HOW1); the `.how` format (`"format": "how"`, version 1; it holds no app id); the DOCX relationship ids `draftlyHdr1` / `draftlyFtr1` in the patched `vendor/html-docx.js`; old `(before …)` comments and the change log below.
- Test: `node apps/office/writer/test/test-df25-rename.js`.

## DF24 — visible name

The name on screen is Writer: the page title, the header next to the icon, Settings → About, PDF title and creator, the Hub Office tile, and the name sent to the Hub title bar. IndexedDB is still `draftly`. localStorage keys such as `draftly_settings` and `draftly_last_name` are still those keys. The Hub id is still `draftly`. Replaced lines are commented with `(before DF24)` and were not deleted.

## HOW1 — .how files

`.how` (Hub Office Writer) is the default native file. It is one UTF-8 JSON file, readable in a text editor, with no zip and no new library.

| Field | What it holds |
| --- | --- |
| `format` | `"how"` |
| `version` | `1`. Any other version is refused. |
| `name`, `created`, `updated` | Document name and times |
| `html` | The document, including formatting. Images are embedded as `data:` URLs. |
| `hf` | Header and footer. Three text slots each. `{page}`, `{pages}` and `{date}` stay as typed. |
| `page` | Size (`A4` or `Legal`), orientation, margin preset, custom centimetres, page numbers on/off and position |

File → **Save** and **Save As** write `.how`. File → **Open .how**, or dropping a `.how` on the page, restores that document (text, formatting, images, header/footer, page setup). **Open .docx**, **Export DOCX**, **Export PDF** and **Print** are unchanged.

**In the Hub**, Save, Save As and autosave write the browser's Local drive, folder **Documents**. That is the same disk the Files app shows. Documents is created the first time a file is saved. Writer reopens the newest `.how` in Documents when it starts inside the Hub. Recent lists those files. A double-click on a `.how` in Files opens Writer on that file (the Hub id is still `draftly`).

**Outside the Hub**, Save uses the browser's save picker when the browser has one, and otherwise downloads the `.how` file. Autosave outside the Hub continues only into a file you already picked. It does not download on each keystroke.

### Legacy (before HOW1)

The old native copy was IndexedDB database `draftly`, store `documents` (`name`, `html`, `hf`, `updated`), plus the localStorage crash copy `draftly-backup`. Writer does not migrate those records and does not open them. The old load, Recent, backup and IndexedDB save calls are still in the source, commented with `(before HOW1)`. `Draftly.storage.save` is still the IndexedDB function so the shared save-failure check can run it; while Writer is open, `draftly-how.js` replaces it and keeps the original on `Draftly.storage.saveLegacy`. Theme, margins and the other localStorage prefs are unchanged. Open .docx still uses the Word reader.

## DF21 — writing helpers (Review tab)

A new **Review** ribbon tab (also in the Hub title bar) holds four helpers. Plain code, no new library, no dictionary download.

- **Spelling** turns the browser's own spell checker on or off for the page text (every page, including pages added as you type). The same switch is in Settings → Editing → Spell check. It is stored in `draftly_settings` as `spellcheck` and is **off by default**, as before DF21. Header and footer slots stay off (they hold `{page}` / `{date}` fields). Squiggles are never printed or exported.
- **UPPER / lower / Title Case** change the selected text. Bold, italic, colour and links stay, because only the letters inside the text are changed. It is one undo step and autosaves like typing. With nothing selected a short message says "Select some text first" and nothing changes. **Title Case rule:** every word starts with a capital and the rest of the word is lower case. Small words (a, of, the) are capitalised too, so the result is predictable. An apostrophe inside a word does not start a new word (don't → Don't); a hyphen does (well-known → Well-Known). A selection that starts in the middle of a word keeps that word's first part as it was.
- **Status bar** now shows the character count (with spaces) and a reading time next to the word count, updated with it. **Reading time rule:** about 200 words a minute, rounded up to whole minutes (1–200 words = 1 min, 201–400 = 2 min, an empty page = 0 min). The word count popup lists it too. Read Aloud's own estimate is a listening time (about 160 words a minute, scaled by speed), so the two numbers differ on purpose. The character count hides on screens under 560 px.
- **Focus** hides the top row, ribbon, ruler and status bar and shows just the page. A small bar at the top right keeps Undo, Redo, Save and **Exit focus**; Ctrl/⌘+Z, Ctrl+Y, Ctrl/⌘+S and Ctrl/⌘+P still work. **Esc** ends focus mode (unless Esc is first needed to close Find, a menu, a dialog, header/footer editing or a selected image). Clicking any tab in the Hub title bar also ends it. The File menu still opens from the Hub title bar. Focus mode is for this session only and is not saved. Print, PDF and DOCX are not affected.
- **Read aloud** sends the selected text, or the whole document as plain text when nothing is selected, to the Read Aloud app (`apps/tools/read-aloud/`). Writer writes Read Aloud's own keys (`readaloud.source` = `text`, `readaloud.text`, and clears `readaloud.pos.text` so it starts at the top), then opens it the way other apps open apps: in the Hub with `__hubOpenApp('apps/tools/read-aloud/')` (after saving the `.how`, because in Phone mode Read Aloud replaces Writer in the frame), otherwise in a frame with a `hub-open-app` message, and standalone in a new tab (`../../tools/read-aloud/read-aloud.html`). Read Aloud itself was not changed. Text is capped at Read Aloud's 200,000 characters. Header, footer and page numbers are not read.

Limits: if Read Aloud is **already open** in a Desktop-mode window, the Hub brings that window forward and it still shows the text it loaded when it opened; close it and press Read aloud again (or reload it). Sending text replaces what was in Read Aloud's Text tab. Spell check languages and suggestions are the browser's. Change case works on letters only (Hindi and other scripts without capitals are unchanged).

Files: `modules/draftly-writetext.js` (text rules, no DOM; used by the Node test), `modules/draftly-write.js` (Review tab, spelling, case, focus, read aloud), `ui/write.css`. Small hooks: `draftly-settings.js` (default and switch), `draftly-pages.js` (new pages follow the setting), `draftly-wordcount.js` (status bar and popup), `draftly-hub.js` (Review tab for the Hub). The page title is `Writer DF21`. Replaced lines are commented with `(before DF21)`. Test: `node apps/office/draftly/test-df21-helpers.js` (DF25: `node apps/office/writer/test-df21-helpers.js`; DW5: `node apps/office/writer/test/test-df21-helpers.js`).

## 1. What it is
An offline document editor laid out as fixed A4 pages, like a word processor. Text flows from page to page line by line. Documents autosave in the browser and download as PDF or DOCX. Plain JavaScript, no internet needed, works from `file://`.

## 2. Files
- `writer.html`: page shell; links the stylesheets and scripts in order (order matters)
- `ui/` stylesheets, linked in this cascade order:
  `fonts.css` (Tinos faces), `theme.css` (variables, light/dark), `base.css`, `toolbar.css`,
  `popups.css` (File / Recent / Page), `workspace.css`, `ribbon.css`, `page.css` (paper, page numbers, breaks),
  `editor.css`, `marks.css`, `print.css`, `colour.css`, `find.css`,
  `statusbar.css` (status bar, word count, zoom), `table.css`, `format.css` (selection, sup/sub),
  `headerfooter.css`, `margins.css` (Custom margins dialog)
- `modules/writer-config.js`: all sizes, keys, timings and default text
- `modules/writer-storage.js`: IndexedDB documents, theme / marks / orientation flags
- `modules/writer-ui.js`: messages as cards (`../shared/office-notify.js`), theme, orientation, toolbar active state, click helper, theme / marks buttons
- `modules/writer-editor.js`: selection, formatting commands, font, plain-text paste (`pastePlain`), Enter / Shift+Enter
- `modules/writer-paste.js` (DF16): formatted paste - allow-list sanitizer, Word / Google Docs / LibreOffice clean-up, tables, data images, "Paste as text" chip
- `modules/writer-pages.js`: page cards and pagination entry points
- `modules/writer-flow.js`: flow across pages (push / pull, caret, reflow, joined HTML)
- `modules/writer-flow-blocks.js`: block helpers for flow (measure, join, text map, split a block)
- `modules/writer-marks.js`: ¶ / ↵ format marks overlay
- `modules/writer-export.js`: DOCX download, Print, File-menu export buttons, Ctrl+P
- `modules/writer-docxgen.js`: MM6 real DOCX writer (editor HTML to WordprocessingML, packed with `writer-zip.js`)
- `modules/writer-pdf.js`: PDF download (image PDF; since MM4 only the fallback for non-Latin text or errors)
- `modules/writer-pdfgen.js`: MM4/DF14 real-text PDF (selectable text, jsPDF standard fonts) and Merge to PDF
- `modules/writer-lists.js`: bullet and numbered lists
- `modules/writer-view.js`: fit-to-screen scaling, Recent and Page popups
- `modules/writer-history.js`: undo / redo
- `modules/writer-breaks.js`: page breaks and page numbers
- `modules/writer-colour.js`: font colour and highlight
- `modules/writer-wordcount.js`: word count, status bar on / off
- `modules/writer-writetext.js` (DF21): change case, reading time, character label, plain text and keys for Read Aloud (no DOM)
- `modules/writer-write.js` (DF21): Review tab — Spelling, UPPER / lower / Title Case, Focus mode, Read aloud; `ui/write.css`
- `modules/writer-find.js`: text model, Find & Replace, wiring for find and word count
- `modules/writer-table.js`: tables
- `modules/writer-spacing.js`: line spacing and indents
- `modules/writer-zoom.js`: document zoom
- `modules/writer-headerfooter.js`: Header & Footer (left / centre / right slots, fields {page} {pages} {date}, saved with each document; the Page-tab page-number buttons write {page} into the footer)
- `modules/writer-margins.js`: Custom margins dialog (0.5–5 cm per side, "Same for all"; a global pref like Normal / Narrow)
- `modules/writer-how.js` (HOW1): `.how` read/write, Hub Documents autosave, standalone picker or download
- `modules/writer-docs.js`: load / open / new / delete / save, Recent list, autosave, Ctrl+S
- `modules/writer-format.js`: Home-tab formatting buttons, selects, shortcuts, toolbar sync
- `modules/writer-ribbon.js`: ribbon tabs and File menu (File > Rename asks with a dialog; File > Dark mode / Light mode toggles the theme, same `writer_theme` pref as the top-row button)
- `modules/writer-dialog.js` (alias of the shared `../shared/office-dialog.js` + `office-dialog.css`): modal `Writer.dialog.prompt({title, label, value, okLabel})` → name or null, and `Writer.dialog.confirm({title, message, okLabel, danger})` → true/false. Enter = OK (unless Cancel has focus), Esc or a backdrop click = cancel, focus stays inside. A prompt refuses empty text. A danger confirm has a red OK and starts on Cancel. Writer uses no window.prompt / confirm / alert.
- `modules/writer-hub.js`: sites hub bridge (v:1). Only active in a frame. After `hub-hello` it adds `body.in-hub`, which hides the top row. It sends `hub-app` {app, tabs, activeTab, title}, `hub-tab` {id} and `hub-title` {value}. It handles `hub-action` {id:'tab:<id>'}: `tab:file` opens the File menu at the top-left of the frame. The message shapes are kept in `Writer.hub.shape`.
- `modules/writer-app.js`: thin start-up (checks modules, calls each `bind()`, loads the document)
- `vendor/` (local, MIT; see `vendor/README.txt`):
  - `html-docx.js`: html-docx-js 0.3.1, old DOCX writer; since MM6 only a fallback if `writer-docxgen.js` throws (it stores the text as an embedded HTML chunk that only Word shows; LibreOffice and viewers show a blank page)
  - `jspdf.umd.min.js`: jsPDF 2.5.1, PDF file
  - `html2canvas.min.js`: html2canvas 1.4.1, page images for the PDF
- `assets/fonts/tinos/`: Tinos fonts (regular, bold, italic, bold italic), a Times New Roman-compatible fallback, with licences
- `writer_icon.png`: hub icon
- `index.html`: opens `writer.html`

- Mail merge (MM1): `ui/merge.css`; `modules/writer-csv.js` (CSV reader), `writer-merge.js` (engine and settings), `writer-zip.js` (stored zip writer), `writer-merge-ui.js` (Merge tab, chooser, preview, Export all); samples in `samples/`
- Spreadsheet .hos import (MM8): `modules/writer-hos.js` (version-1 .hos reader, saved values, Spreadsheet number formats, no library); `samples/merge_sample.hos`
- Excel import (MM3): `modules/writer-xlsx.js` (.xlsx reader: zip + XML, no library), `modules/writer-numfmt.js` (Excel number / date format text); `samples/merge_sample.xlsx` and its generator `samples/make_merge_sample.py`. Only if the browser has no `DecompressionStream`, `shared/vendor/jszip.min.js` (JSZip, MIT) is loaded as a fallback

## 3. Behaviour rules
- **Pages:** fixed A4 (21 × 29.7 cm) or Legal (8.5 × 14 in, 21.59 × 35.56 cm), portrait or landscape. An old saved Letter choice loads as A4. Margins: top 0.5, bottom 0.5, left 2, right 2 cm. Pages never stretch.
- **Flow:** when a page is full, the overflowing lines move to the next page; a paragraph that crosses the bottom is split at the last line that fits. Deleting pulls content back. Split paragraphs are joined again when saving or exporting.
- **Enter / Shift+Enter:** Enter starts a new paragraph (6 pt space after it). Shift+Enter is a line break inside the paragraph.
- **¶ button (format marks):** shows ¶ at each paragraph end and ↵ at each line break. They are drawn on an overlay only, so they are never saved, printed or exported and don't change line wrapping. The on/off setting is remembered.
- **Type:** Times New Roman (machine font), else the built-in Tinos, then Liberation Serif, then serif. Size list 8–36 (default 12 pt). Line height 1.6.
- **Formatting:** bold, italic, underline, align left / centre / right, lists (• bullet, 1 2 3, a b c, A B C; suffix `.` `,` `)` or none for numbered lists, display only).
- **Paste (DF16):** formatted. Bold, italic, underline, strike, sup/sub, colour, highlight, font size (nearest Draftly size), headings, lists, links, tables and pasted images are kept; everything else is cleaned out. Ctrl+Shift+V pastes plain text, and a **Paste as text** chip appears after a formatted paste.
- **Saving (HOW1):** see the HOW1 section. Autosave is 0.8 s after typing stops. In the Hub the file is `Documents/<name>.how` on the Local drive. Outside the Hub, Save downloads or uses the save picker. An empty name box gets `Doc_YYYY_MM_DD_HH-MM`.
- **Recent:** in the Hub, lists `.how` files in Documents, newest first.
- **Before HOW1:** documents were IndexedDB records. Those are not opened any more.
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

<!-- (before MM8) ### Mail merge (Merge tab: CSV and Excel .xlsx) -->
### Mail merge (Merge tab: CSV, Excel .xlsx and Spreadsheet .hos)
- Write placeholders as `{{Column Name}}`. Matching ignores spaces around the name and upper/lower case. `{{#}}` is the row number (1, 2, 3 …) unless the data has a column called `#`.
- **Data**: *Choose file* (CSV, Excel `.xlsx` or Spreadsheet `.hos`) opens a chooser for the files of the Hub drives (Local, or a folder you mounted in the Hub drive; no file picker). *Browse this computer* is the fallback: it uses the browser's file picker. *Refresh* reads the file again. For CSV the delimiter is detected (`,` `;` or tab); the select can force one (hidden for Excel files). The file type is found from its content, not its name.
  - The first row must be the header. Duplicate header names get ` (2)`, ` (3)`; short rows are padded and long rows trimmed, with a warning; the file may be UTF-8 (with or without BOM) or UTF-16 with BOM; anything else is read as Windows-1252, with a note.
  - **Excel (.xlsx, .xlsm; MM3)**: the first sheet is used; when the workbook has two or more visible sheets a *sheet* dropdown appears next to the file name (hidden sheets are not listed). The chosen sheet is remembered for that file (`sheet` in the saved settings); if it is gone after a change the first sheet is used, with a note. Choosing another file starts on its first sheet. The header is the first non-empty row; leading empty rows and empty columns are skipped, and a title row above the table becomes the header, so delete it in Excel.
  - Cell values are read as the text Excel shows: numbers use the cell's number format (`#,##0.00`, `0%`, `€`, scientific, fractions, `[>n]` conditions, text in quotes), dates use the date format (e.g. `05-Mar-2024`; the short locale formats are shown as `yyyy-mm-dd`), `TRUE` / `FALSE` for booleans, error cells as their code (`#N/A`), formulas as their last saved result, shared and inline strings, `_x000D_` escapes decoded. Merged cells: the value is in the top-left cell only. The 1900 and 1904 date systems are handled. The display is an approximation of Excel (English month and day names, no colours, no regional settings).
  - **Spreadsheet (.hos; MM8)**: a Hub Office Spreadsheet file (version 1) works like an Excel workbook: first sheet by default, the *sheet* dropdown for two or more sheets, the chosen sheet remembered, same header and empty-row / empty-column rules, live refresh. Values are the ones Spreadsheet saved, shown with the cell's number format (Currency `₹1,250.00`, Percent, Thousands, Date `YYYY-MM-DD` / `DD/MM/YYYY`, Time, ...). Formulas are not recalculated: a formula with no saved value is blank, with a warning (open and save the file in Spreadsheet). Limits: version 1 only, 26 columns × 100 rows, 20 sheets; filters and hidden rows are not applied (the whole sheet is read); charts are ignored; merged cells keep the top-left value. A newer `.hos` version and a Writer `.how` file are refused with a message. Double-clicking a `.hos` in Files still opens Spreadsheet.
  - Formulas keep the result the program saved. A file written by a script (e.g. openpyxl) has no results: those cells are blank and a warning is shown; open and save it once in Excel or LibreOffice.
  - Limits: at most 20000 data rows are read (a warning says so; Export all still allows 2000, see below), 1000 columns, 200 MB per part. Old `.xls` and `.ods` are not read (the message says to save as .xlsx). Password-protected files and Zip64 are not supported. Images, charts, comments and formatting are ignored.
  - A file from the browser's file picker with a handle (Chrome / Edge) can be re-read for live refresh. A file from the old `<input type=file>` can't (the browser gives a snapshot): choose it again after you change it.
- **Fields**: *Insert field* puts `{{Name}}` at the caret. Known placeholders are shaded green in the text, unknown ones red; unknown ones are also listed under the *warning* button and stay as typed in the output.
- **Preview**: shows the document with one row's values (Previous / Next). It is a copy: the document is not changed. Values are shown as text (HTML in a cell is not run); line breaks in a cell are kept. While preview is open, and while the file is chosen from a drive, the file is checked every 3 seconds; if it changed, the fields and the preview update and the row number is kept. When preview is closed a *File changed* mark shows instead; press *Refresh*.
- **Export all**: one DOCX per row in a `.zip`, or one combined DOCX with a page break between rows (header / footer fields such as page number and date stay blank in the combined file). File names come from a pattern, default `<document name>-{{#}}`; characters `\ / : * ? " < > |` and control characters become `_`, names are cut at 80 characters, and duplicates get ` (2)`, ` (3)`. Limit 2000 rows (split larger files; the same for Excel); over 200 rows shows a note; progress and Cancel are shown.
- Saved in `writer_merge_settings`: the file name (and drive path), delimiter, sheet (Excel), file name pattern, export type and row number. The file content is not saved.
- Try it (MM8): `samples/merge_sample.hos` has the customers on a *Customers* sheet (currency, date, percent, a formula) and an *Orders* sheet; copy it to a Hub drive and choose it in Merge.
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
- Esc ends Focus mode (DF21) when no menu, dialog, Find bar or header/footer is open
- Ctrl/Cmd+Z undo, Ctrl+Y or Ctrl/Cmd+Shift+Z redo (also the Undo / Redo toolbar buttons). Draftly keeps its own history of up to 100 steps (a typed word, a format change, a line break), so undo works across page breaks. Opening, New or Delete clears it.
- Other editing keys (copy, paste, arrows) are the browser's own.

Works inside the hub and responds to its phone D-pad, but the hub's key presses are synthetic: only shortcuts the app handles itself work (e.g. Ctrl+S / B / I / U, Enter, Esc). Browser actions such as typing letters, moving the caret or undo don't happen.

## 5. Saved data
- **HOW1:** a `.how` file (see the HOW1 section). In the Hub it lives in Local → Documents.
- IndexedDB database `draftly`, store `documents`, is no longer read or written by Writer (before HOW1). The database name is unchanged.
- localStorage:
  - `writer_last_name`: last opened document
  - `writer_theme`: `dark` / `light`
  - `writer_nonprinting`: `1` / `0` (format marks)
  - `writer_orientation`: `portrait` / `landscape`. Before 2026-10-21 it was saved under the literal key `undefined`; at start-up that value is copied to `writer_orientation` (if empty) and the `undefined` key is removed, only when it holds `portrait` / `landscape` (other data under that key is left alone)
  - `draftly_margins`: old key, removed at start-up
  - `writer_merge_settings`: Merge tab settings (JSON: `src`, `delim`, `sheet`, `pattern`, `fmt`, `row`)
  - `writer-ribbon-tab`: last ribbon tab (now may be `merge`)
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
- Up to 820 px wide: smaller toolbar, the "Writer" name is hidden, and the toolbar scrolls sideways. Pages are scaled to fit.
- Popups stay inside the screen and follow their button when the toolbar scrolls.

## 8. Safe settings (`modules/writer-config.js`)
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
6. Page popup → Landscape, reload: still landscape (localStorage `writer_orientation` = `landscape`, no `undefined` key).
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
- 2026-11-12 IST: MM8 Merge opens Spreadsheet `.hos` (version 1): own reader `writer-hos.js`, saved values with Spreadsheet number formats, sheet dropdown, chooser / Browse list `.hos`; `samples/merge_sample.hos`. MM7 is not part of this.
- 2026-11-12 IST: DF25 full rename: folder `apps/office/writer/`, `writer-*` files, global `Writer`, Hub id `writer` (alias `draftly`), `writer_*` settings copied once from `draftly_*`, redirect left at `apps/office/draftly/`.
- 2026-11-12 IST: DF21 writing helpers: Review tab (Spelling on/off, UPPER / lower / Title Case, Focus mode, Read aloud), character count and reading time in the status bar.
- 2026-10-30 IST: MM4 Merge to PDF + DF14 real-text PDF (`draftly-pdfgen.js`); old image PDF kept as fallback.
- 2026-10-23 IST: MM6 real DOCX export: new `draftly-docxgen.js` writes WordprocessingML (all DOCX paths, incl. Merge zip / combined, were blank outside Word before); html-docx kept only as a fallback.
- 2026-10-23 IST: MM3 Excel (.xlsx) import for Merge: own reader (no library), sheet dropdown (remembered), number and date formats as shown in Excel, live refresh like CSV; `samples/merge_sample.xlsx`.
- 2026-10-23 IST: MM1 mail merge: Merge ribbon tab, CSV reader, live refresh, preview, Export all (zip / combined DOCX).
- 2026-10-23 IST: orientation fix: saved only under `draftly_orientation` (config `storageKeyOrientation`); the old `undefined` key (written 2026-10-02 to 2026-10-21, when that config entry was missing) is migrated once at start-up and removed if it holds an orientation value. Invalid values are not saved.
- 2026-10-31 IST: DF18, plain bulleted and numbered lists show their bullets/numbers in the editor and Merge preview (1.6em indent, same as styled lists).
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

## HO2 — save notice, Hub theme, lighter open

- If a document cannot be saved (disk full, private mode, IndexedDB blocked), a card stays on screen: "Couldn't save — storage full" or "Couldn't save — storage blocked". It stays until a later save works. One card, not a new one every keystroke.
- Settings → Theme → Auto follows the Hub's light/dark when Draftly is inside the Hub, and the device's light/dark setting when you open Draftly on its own. It updates when the Hub theme changes.
- PDF and DOCX libraries (jsPDF, html2canvas, html-docx) load the first time you export, from the same files in `vendor/`. Opening Draftly no longer loads them. The normal DOCX download still uses Draftly's own writer; html-docx loads only if that writer fails.

## Legacy
IC6: icon redrawn plain without tile; old icon kept as *_icon_before_IC6.png
