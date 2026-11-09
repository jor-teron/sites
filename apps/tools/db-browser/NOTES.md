# DB Browser — notes

## DB1+DB2

- New Tools → Files app: `apps/tools/db-browser/`.
- Library: **sql.js 1.13.0** (`sql-wasm.js` ~48 KB + `sql-wasm.wasm` ~644 KB)
  under `vendor/sqljs/`. Loaded with `locateFile` pointing at that folder.
  No CDN at runtime. Packed via `npm pack sql.js@1.13.0` on the box.
- Open: `File.arrayBuffer()` → `new SQL.Database(u8)`. New empty: `new SQL.Database()`.
- Browse: `sqlite_master` for tables/views; `COUNT(*)` for row counts;
  `SELECT * … LIMIT/OFFSET` for pages; header click toggles ASC/DESC.
- Query: `db.iterateStatements` so multiple statements run; SELECT rows capped
  at 1000; DDL/DML sets the modified badge.
- Save: `db.export()` → `showSaveFilePicker` when available, else `<a download>`.
  Suggested name is `original-copy.db`. Never writes back to the opened file handle.
- CSV: `DBHelpers.rowsToCsv` with RFC-style quoting.
- History: `localStorage` key `dbBrowser.queryHistory` (max 20).
- Size warn: confirm dialog above 100 MB (`DBHelpers.SIZE_WARN_BYTES`).
- Tests: `node tests/db1.test.cjs` (helpers + optional sql.js smoke).
