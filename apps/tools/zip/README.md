# Zip (ZP1+ZP2)

Browser zip tool for Hub Tools. Uses **@zip.js/zip.js 2.24.0**
(vendored, no CDN) so create and extract stay on the device.

## Features

### ZP1 — Make / Open
- **Make zip:** add files or a folder (picker or drop), list with sizes and
  Remove, choose a name, Create, then download the `.zip`
- **Open zip:** drop or pick a `.zip`, see a file tree with sizes, Save one
  file, or Extract all

### ZP2 — Folder save, optional password, progress
- **Choose folder** (Chrome / Edge): extract (and optional create) writes
  straight to disk with subfolders kept and collision-safe ` (1)` names
- Other browsers fall back to normal Downloads
- **Protect with password** is off by default; when on, Make uses **AES-256**
- Open asks for a password only when entries are encrypted; wrong password
  shows a clear message
- Progress bar + Cancel for create and extract
- Unsafe paths (`../`, absolute, device names) are skipped (zip-slip safe)

## Files

| File | Role |
|------|------|
| `zp_helpers.js` | Path sanitize, unique names, size, tree |
| `zp_save.js` | Folder picker + streamed writes |
| `zp_make.js` | Create zip (optional password) |
| `zp_open.js` | Open / extract |
| `zp_ui.js` / `zp_main.js` | UI + wiring |
| `vendor/zipjs/` | `zip.min.js`, LICENSE, VERSION |

## Limits

- Folder save needs File System Access (desktop Chrome / Edge)
- Password zips use AES; very old unzip tools that only know ZipCrypto may not open them
- Large archives still need enough free memory for zip.js buffers
