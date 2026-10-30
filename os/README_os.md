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
- `core/boot.js` — boot loader: starts storage, checks a write/read, loads the registry, logs each step.
- `core/storage.js` — file helper: `writeFile`, `readFile`, `listFiles`, `deleteFile`.
- `core/registry.js` — app registry: `register`, `list`, `get`, `loadPackages` (reads `packages/index.json`).
- `packages/index.json` — list of app packages (empty for now).

## Change log
2026-10-30 IST: OS1 , bare-minimum core: boot loader, browser storage, app registry, no GUI
