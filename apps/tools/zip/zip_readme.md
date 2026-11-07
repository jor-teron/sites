# ZIP ZP1

A local ZIP tool. Create an archive from files on this device, or open a ZIP and download files from it. Nothing is uploaded. There is no account, no network service, and no runtime CDN.

The page is `zip.html`. `index.html` only redirects there (IX1 template).

## ZP1

- Add files with the picker or by dropping them on the page. The list shows each name and size. Remove one file, or clear the list (in-app confirm).
- Download ZIP writes a DEFLATE archive. A repeated file name is saved as `name (2).ext` so the first file is not overwritten.
- Open ZIP lists folders and files. Download one file, or extract all (each file downloads on its own; the browser may ask each time).
- Encrypted, split, damaged, and unknown-compression ZIPs fail with an in-app message. Entries that fail the checks below are skipped and named in a dialog. They are not inflated.

JSZip 3.10.1 is the vendored copy already in this repo (`shared/vendor/jszip.min.js`, same bytes as File Drop). License: `vendor/LICENSE-jszip.txt` (MIT or GPLv3). The app does not parse ZIP bytes itself.

## Limits

- 200 files, 32 MiB each, 64 MiB total uncompressed, 48 MiB for the ZIP itself.
- A file larger than 1 MiB whose declared uncompressed size is more than 80× its compressed size is refused (zip bomb). Sizes are taken from the central directory before inflate.
- After inflate, the byte length must match the header and the CRC-32 must match. A true empty file is kept only when the payload is 0 bytes (JSZip does not keep a checksum for those).
- Paths: no `..`, no absolute path, no drive letter, no null or other control characters, no Windows device names (`CON`, `COM1`, …), no trailing dot or space, depth at most 8.
- Added files use the file name only (one segment). Names inside an opened ZIP may use safe folders.

## Tests

`node zip_test.js` from this folder. It syntax-checks `zip_core.js` and `zip_ui.js`, then round-trips binary, text, empty, and Unicode files, and checks an invalid archive, an encrypted flag, an unknown method, a CRC mismatch, unsafe paths, and the size and ratio caps. No browser test.

## Legacy code notes

ZP1 is the first release. Searched the repo for an existing ZIP app (including `apps/tools`) before adding this folder. No page was replaced, so there is no old implementation to keep. `index.html` was created from the IX1 redirect template; it never had a visible “Open ZIP” body.

## Not in ZP1

Passwords, other archive types, cloud storage, and writing into a real folder on disk. Extract all does not build a second archive. The Hub catalogue is unchanged until a later release adds the tile.
