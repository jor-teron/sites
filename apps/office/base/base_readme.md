# Base

Small database app (like a light LibreOffice Base / Access). Plain HTML/CSS/JS, no build, works from `file://`.
Uses the shared Office files in `../shared/` (ribbon, tools, icons, dialog, notify cards, theme, settings, hover, collapse).

Files: `base.html`, `base.css`, `base_icon.svg/.png`, `modules/base-store.js` (data + IndexedDB 'office-base', schema 8, 'pics' store),
`base-types.js` (field types, validation, conversion, auto-number), `base-history.js` (in-memory undo/redo),
`base-pics.js` (picture resize + blob store), `base-links.js` (BS6: Link to record, Lookup, related panel, delete guard), `base-report.js` (BS7: group-by reports, summary, SVG charts, print), `base-view.js` (BS8: header filters, saved views, freeze, resize, colours, gallery, calendar), `base-files.js` (BS9: .hbase backup/restore, Excel, JSON, Send to Spreadsheet),
`base-fields.js` (Fields / Add field dialogs and edit commit),
`base-csv.js` (import/export), `base-grid.js` (grid view), `base-form.js` (form view),
`base-query.js` (BS2 query builder, saved queries, SQL view), `base-delete.js` (BS4 delete safety: ⋯ menus + typed-confirm dialogs),
`base-ui.js` (ribbon, settings, commands, boot), `base_hub.js` (Hub title-bar bridge, same v:1 protocol as Spreadsheet).

## Releases

- **BS1** — tables (create from Contacts / Expenses / Stock / Blank template, rename, delete); fields typed Text,
  Number, Date, Yes/No (add, rename, retype, delete via "Fields…"); grid view with inline edit, add/delete record,
  header-click sort (asc → desc → off), search filter; form view (one record, big fields, Prev/Next/New/Delete,
  ←/→ keys); IndexedDB autosave (memory fallback + notice card); CSV import (new table, guessed types) and export;
  Settings: theme, open tabs on hover, collapse ribbon. Later (BS2+): filters, totals, reports, links between tables.

- **BS2** — Query tab: query builder (pick table, condition rows Field / operator / value with
  = ≠ > < >= <= contains, starts with, is empty, is not empty, is yes / is no; Match ALL (AND) / ANY (OR);
  sort field + asc/desc; checkboxes for fields to show). Run filters the grid (cells stay editable, edits go to the
  table; search still works on top). Saved queries (stored in the same IndexedDB record) in the Query tab picker
  and the File menu, one tap to rerun; Rename / Delete; "Show all" clears. "Show as SQL" (read-only, with a plain
  explanation of each part). View → Totals row: Sum / Avg / Count for Number fields over the visible rows.
  Field type and template are now dropdowns (shared OfficeDialog.form gained `type:'select'`, office-dialog.js?v=2).

### How queries work (beginner)

A query is a saved question you ask one table. "Show **Expenses** where **Amount > 500**, newest first" means:
pick table Expenses, add the condition Amount `>` 500, sort by Date descending. Several conditions joined by
**AND** must all be true; with **OR** any one is enough. In SQL the same thing reads
`SELECT * FROM Expenses WHERE Amount > 500 ORDER BY Date DESC;` — SELECT = which fields, FROM = which table,
WHERE = which records, ORDER BY = sort. Base writes this for you; you never have to type it.

- SH5: Settings opens as a centred pop-up dialog (shared office-settings.*, ?v=2).

## BS3 (safe start)
- If storage does not answer within 1.5 s or is blocked, Base works in memory only and shows a warning banner.
- Damaged saved data is repaired on load (original kept as a backup). If Base still cannot show it, a recovery dialog offers "Download raw data" and "Reset Base".

## BS4 (delete safety)
- No delete button beside the table, on rows or in the form view. Deleting lives in the small ⋯ menus on the Home tab, in red:
  Table ⋯ > 🗑 **Delete table…** and Records ⋯ > ⊖ **Delete record…** (pick a record first by tapping its row number or a cell).
- Delete table: a red dialog shows the table name, record and field count. Type the table name exactly to enable "Delete table".
- Delete record: a dialog with a red outline shows how many records and a preview of the record. Type DELETE (or the count) to enable "Delete record".
- Wrong or empty text keeps the button disabled; Cancel, Esc or a tap outside keep the data. Deletes are saved straight away.
- The Delete and Backspace keys never delete records; they only edit text inside a cell.

## BS5 (undo, field types and rules)
- **Undo / Redo** (Ctrl+Z / Ctrl+Y, and the Quick Access buttons) for cell edits, add/delete record, field add/rename/retype/delete, table rename, and CSV import. About 100 steps, kept in memory only (lost when you close Base). Deleting a whole table still cannot be undone — the dialog says so, and the undo stack is cleared.
- **New field types:** Choice (dropdown, options edited in Fields…), Email, Phone, Link (↗ opens in a new tab, `rel=noopener`), Currency ₹ (stored as a number, shown with Indian grouping), Long text (first line in the grid, textarea in the form), Picture (resized to a 800 px long side, WebP or JPEG, stored as a blob in IndexedDB, thumbnail in the grid).
- **Field rules** in Fields… / Add field: Required, Default value, Unique (checked on edit, add and import; the cell is marked and an in-app card explains the problem; unique violations are not saved). Email, Phone and Link get a light format warning but are not blocked.
- **Auto-number ID:** a read-only counter that never reuses a deleted number. Optional when you create a table from a template, and addable later (existing records are numbered 1, 2, 3… in their current order). A table may have only one ID field.
- Changing a field's type shows how many values would be lost, then asks you to confirm. Queries, sort, search, totals and CSV handle the new types (Currency is included in totals and exported as a plain number; Choice supports = and ≠; Picture columns are left out of CSV, with a note).
- Existing BS4 databases in IndexedDB `office-base` load unchanged. A schema version (5) is stored; the first BS5 open writes a backup and migrates in place.

## BS6 (links between tables)
- **Link to record** field: points at another table (or the same one). Single or several records, picked in an in-app search dialog. The cell shows the linked record's display field as a chip you can open; Change / Clear (and × on a multi link) edit it. Undo covers these edits.
- **Lookup** field: a read-only column pulled from the linked record (for example an Order can show the Customer's Village). If several records are linked, the values are joined.
- **Related records** panel (under the grid and the form, when a record is selected): lists records in other tables that link here, with Open and + Add (creates a new record already linked to this one).
- **Queries** can use a Link to record (= / ≠ / empty) and “Link ▸ field” paths, for example Expenses where Customer ▸ Village contains “Diphu”. A row matches if any of its linked records do.
- **Delete guard:** if other records or tables link to what you are deleting, the typed-confirm dialog lists them and the button becomes “Clear links and delete…”. Cancel keeps everything. Record deletes (including the cleared links) stay undoable; deleting a whole table still cannot be undone.
- CSV export writes the linked records' display text (several names joined with “; ”), not raw ids. Picture columns are still left out.
- Existing BS5 databases load unchanged. Schema becomes 6; the first BS6 open writes a backup and migrates in place.

## BS7 (reports, summaries and charts)
- **Report tab:** group records by a field (including a Link to record, a Lookup, or a “Link ▸ field” path). One optional second group-by gives subtotals plus a grand total. Dates can be bucketed by day, month or year. Empty values show as “(blank)”.
- **Aggregates:** Count of records, plus Sum / Average / Min / Max of Number, Currency and Auto-number ID fields (and lookups of those). The report uses the rows you can already see (the active query and the search box).
- **Saved reports** live in the same IndexedDB record (`BASE.db.reports`), listed in the Report tab picker and the File menu. Save / Rename / Delete are undoable (Ctrl+Z) until you close Base. Deleting a table drops its reports (that still cannot be undone).
- **Charts:** simple bar and pie charts drawn as SVG (no chart library). A bar chart shows up to 12 groups; a pie chart shows up to 8 slices plus “Other”. File > Print (and Print report / the Quick Access print button) opens the browser print window — use Save as PDF there. There is no PDF library.
- **Summary row** under the grid (View tab, was Totals) also shows Min and Max.
- Existing BS6 databases load unchanged. Schema becomes 7; the first BS7 open writes a backup and migrates in place.

## BS8 (views and filters)
- **Header filters:** click a column header to sort (A→Z / Z→A) or filter by ticked values and/or a condition (=, contains, >, is empty…). Filters on several columns all have to match (AND). They run on top of an active query, then the search box.
- **Saved views** per table remember filters, sort, which columns are shown and in what order, column widths, how many columns are frozen, colour rules, and whether you were in Grid, Gallery or Calendar. Listed in the View tab picker and the File menu. Save / Rename / Delete / Apply are undoable until you close Base.
- **Columns…** shows, hides and reorders fields. Drag a header's right edge to resize (60–480 px). Freeze 1 or 2 columns (plus the row number) so they stay visible when you scroll sideways.
- **Conditional colours:** a rule is “field, operator, value → colour the whole row or just that cell”. Up to 8 rules; the first match wins. Pastel washes that work in light and dark themes.
- **Gallery** shows a card per record (a picture field if the table has one, plus a few fields). Click a card to open the record in the form. **Calendar** is a month grid by a Date field; click a record to open it. Records with no date are listed under the month.
- Existing BS7 databases load unchanged. Schema becomes 8; the first BS8 open writes a backup and migrates in place. The current layout is stored on the table itself, so filters, widths and freeze survive a reload.

## BS9 (files and backup)
- **Backup / Restore** (File menu) writes or reads a `.hbase` file: every table, query, report, view, link and picture (pictures as Base64 next to the data). Restore asks first: **Replace everything** (typed confirm, cannot be undone) or **Add as a copy** (new ids so links still work, undoable).
- **Excel:** File > Export Excel and File > Open / Import… for `.xlsx` / `.xls`. SheetJS is lazy-loaded from the Spreadsheet app (`../spreadsheet/vendor/sheetjs/xlsx.full.min.js`) and is not copied into Base. Import makes a new table per sheet (up to 20 sheets, 5 000 rows each). Export (and **Send to Spreadsheet**) writes the current view's rows — the same rows the grid would show after a query and header filters, pictures left out, links as display text.
- **Send to Spreadsheet:** there is no in-app hand-off (Spreadsheet only opens a file you choose). Base saves a workbook and tells you to open it with File > Open in Spreadsheet. If SheetJS cannot load, a CSV is saved instead.
- **JSON import** (read-only): an array of objects, `{ rows: [...] }`, or a named list of arrays becomes new table(s). A `.hbase` JSON file still goes through Restore.
- **SQLite import** (read-only): if you open a `.sqlite` / `.db` file, Base lazy-loads sql.js already vendored in DB Browser (`../../tools/db-browser/vendor/sqljs/`, not copied). Each user table becomes a Base table. This needs the whole site to be served (a lone `file://` page may not load the wasm). The SQLite file is never written back.
- The IndexedDB schema stays at 8 — this release is about files, not a new data shape. Existing BS8 databases load unchanged.

**Limits:** undo is not saved across reloads; if you forget a unique/required fix, the cell stays marked; scanned or huge pictures are resized, not stored at original size; opening a URL-type Link that is not a real URL is refused (no `javascript:`); WebP may fall back to JPEG in older browsers. A Link to record whose table (or record) was removed shows as “(missing)” until you clear or repick it. Lookups only follow one link (they don't chain). CSV import still creates a new table and cannot rebuild links from names. A report that groups by a multi-link field counts the row in each linked group. Charts have no animation and cap the number of bars or slices. Print quality depends on the browser's print window. The grid draws at most 200 rows and the gallery at most 80 cards (narrow the filter to see the rest); a calendar day shows 8 records and then “+N more”. A header value list shows at most 50 values. Shared Office files were not edited in BS9.

## HO2

Settings → Theme → Auto follows the Hub when Base is open inside the Hub (dark only when the Hub theme is dark). On its own, Auto follows the device. It updates when the Hub theme changes. Excel and SQLite were already loaded on first use; that did not change.
