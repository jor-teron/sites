# vendor/ (Code School)

- **sql.js 1.15.2** (SQLite compiled to WebAssembly / asm.js), MIT licence: `sql.js-LICENSE.txt`.
  From `npm pack sql.js@1.15.2`, files copied unchanged from `dist/`:
  - `sql-wasm.js` + `sql-wasm.wasm`: used over http(s) (smaller and faster).
  - `sql-asm.js`: pure JavaScript fallback, used on `file://` (where the .wasm cannot be fetched) or if WebAssembly fails.
- Loaded only when SQL mode is opened (`ui/sql.js`), so Web mode never downloads these files.
