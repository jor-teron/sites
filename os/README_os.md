# os/ — Jor OS (OS.js-style core)

A small browser OS that runs as static files on GitHub Pages. OS1 is the bare core only: no GUI yet.

**Owner:** Team 3 / Hub OS.js Bot

## Principles
- Modular: small files, one job each; apps live in their own folder under `packages/`.
- Static: plain ES modules, no build step, no npm, no server.
- Browser storage: files kept in IndexedDB (`jor-os`), localStorage fallback (`jor-os:file:` keys). Separate from the Hub's storage.
- No login.

## File map
- `index.html` — plain page; shows the boot status and log, loads `core/boot.js`.
- `core/boot.js` — boot loader: starts storage, checks a write/read, loads packages, runs autostart apps, logs each step.
- `core/storage.js` — file helper with folders: `writeFile`, `readFile`, `deleteFile`, `listFiles(dir)`, `mkdir`, `rename`, `exists`, `normalize`.
- `core/registry.js` — app registry: `register`, `list`, `get`, `loadPackages`, `start(id, os)`.
- `core/api.js` — builds the `os` object given to apps: `{ storage, registry, log }`.
- `packages/index.json` — list of package folder names to load.
- `packages/hello/` — example app (`metadata.json` + `main.js`).

## How to add an app
1. Make a folder `packages/<name>/`.
2. Add `metadata.json` with `id`, `name`, `version`, `main` (e.g. `main.js`), `description`, and `autostart: true` if it should run at boot.
3. Add the main file exporting `export async function start(os) { ... }`. Use `os.storage`, `os.registry`, `os.log`.
4. Add `"<name>"` to `packages/index.json`.
5. Reload `index.html` and check the boot log. A failing app is logged and does not stop boot.

## Change log
2026-10-30 IST: OS1 , bare-minimum core: boot loader, browser storage, app registry, no GUI
2026-10-30 IST: OS2 , app package loading, hello example app, storage folders + rename
