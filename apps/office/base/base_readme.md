# Base

Small database app (like a light LibreOffice Base / Access). Plain HTML/CSS/JS, no build, works from `file://`.
Uses the shared Office files in `../shared/` (ribbon, tools, icons, dialog, toast, theme, settings, hover, collapse).

Files: `base.html`, `base.css`, `base_icon.svg/.png`, `modules/base-store.js` (data + IndexedDB 'office-base'),
`base-csv.js` (import/export), `base-grid.js` (grid view), `base-form.js` (form view), `base-ui.js` (ribbon, settings,
commands, boot), `base_hub.js` (Hub title-bar bridge, same v:1 protocol as Spreadsheet).

## Releases

- **BS1** — tables (create from Contacts / Expenses / Stock / Blank template, rename, delete); fields typed Text,
  Number, Date, Yes/No (add, rename, retype, delete via "Fields…"); grid view with inline edit, add/delete record,
  header-click sort (asc → desc → off), search filter; form view (one record, big fields, Prev/Next/New/Delete,
  ←/→ keys); IndexedDB autosave (memory fallback + toast); CSV import (new table, guessed types) and export;
  Settings: theme, open tabs on hover, collapse ribbon. Later (BS2+): filters, totals, reports, links between tables.

- SH5: Settings opens as a centred pop-up dialog (shared office-settings.*, ?v=2).
