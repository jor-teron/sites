# DB Browser (DB1+DB2)

Browse and query **SQLite** databases in the browser. Uses **sql.js 1.13.0**
(WebAssembly, vendored — no CDN) so everything stays on the device.

## Features

### DB1 — Open & browse
- Open a `.db` / `.sqlite` / `.sqlite3` by drop or file picker
- **New empty database**
- Tables & views list with row counts (dropdown on narrow screens)
- Paged row grid (50 per page) with Prev / Next / page jump
- Click a column header to sort (`ORDER BY`)
- Collapsible schema panel (CREATE statement)
- Warns before opening files over ~100 MB (whole DB is in memory)

### DB2 — Query, CSV, save
- SQL box with **Run** (Ctrl+Enter); multiple statements allowed
- Results in the same grid (first 1000 rows, with a note if capped)
- Friendly error messages
- **modified** badge when the in-memory DB has changed
- **Export CSV** of the current table or query result
- **Save as new .db** via File System Access picker when available, else download
  — never overwrites the original silently
- Recent query history in `localStorage`

## Files

| File | Role |
|------|------|
| `db_helpers.js` | Size, CSV, identifiers, paging, history |
| `db_engine.js` | sql.js load, open/browse/query/export |
| `db_save.js` | Save picker / download |
| `db_ui.js` / `db_main.js` | UI + wiring |
| `vendor/sqljs/` | `sql-wasm.js`, `sql-wasm.wasm`, LICENSE |

## Limits

- The whole database is held in memory (sql.js WASM). Large files need RAM.
- Folder / save-picker needs Chrome or Edge on desktop; others get a download.
- No concurrent writers; this is a viewer/editor for one tab.
