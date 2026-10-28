# Base

Small database app (like a light LibreOffice Base / Access). Plain HTML/CSS/JS, no build, works from `file://`.
Uses the shared Office files in `../shared/` (ribbon, tools, icons, dialog, notify cards, theme, settings, hover, collapse).

Files: `base.html`, `base.css`, `base_icon.svg/.png`, `modules/base-store.js` (data + IndexedDB 'office-base'),
`base-csv.js` (import/export), `base-grid.js` (grid view), `base-form.js` (form view), `base-query.js` (BS2 query builder, saved queries, SQL view), `base-delete.js` (BS4 delete safety: ⋯ menus + typed-confirm dialogs), `base-ui.js` (ribbon, settings,
commands, boot), `base_hub.js` (Hub title-bar bridge, same v:1 protocol as Spreadsheet).

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
- No Undo yet (Undo/Redo is a later release); the Quick Access Undo/Redo stay disabled in Base.
