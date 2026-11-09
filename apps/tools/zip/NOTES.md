# Zip — notes

## ZP1+ZP2

- Replaced the earlier unfinished JSZip-based draft in this folder. Catalogue
  row is new under Tools → Files.
- Library: **@zip.js/zip.js 2.24.0** UMD bundle `vendor/zipjs/zip.min.js`
  (~172 KB). Global `zip`. Workers / WASM are embedded in the min bundle.
- Make: `ZipWriter` + `BlobReader`; optional `password` + `encryptionStrength: 3`
  (AES-256). Protect toggle is off by default.
- Open: `ZipReader` + `getEntries`. Extract streams into
  `FileSystemWritableFileStream` when a folder is ready (zip.js accepts a
  `WritableStream`); otherwise `BlobWriter` + `<a download>`.
- Folder handle stored in IndexedDB (`zip-zp` / `root`), same pattern as Torrent
  TR2, copied locally (not shared across apps).
- Zip-slip: `ZPHelpers.sanitizeZipPath` rejects `..`, absolute, drive letters,
  control chars, and Windows device names before any write.
- Tests: `node tests/zp1.test.cjs` (pure helpers only).
