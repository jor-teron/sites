# Games (standalone conventions)

Conventions for most titles under `apps/games/`. This is **not** the HEX WebGPU API guide.

| Doc | Use when |
|-----|----------|
| [GUIDE.md](./GUIDE.md) | Shared `common/settings/` (GameSettings, fps gear, rollout). |
| [engine/README.md](./engine/README.md) | **HEX** WebGPU engine (Three r170 local vendor). New opt-in 3D only. |
| [engine/EXAMPLE.md](./engine/EXAMPLE.md) | Minimal HEX scene snippet. |

HEX (from Nov 2026) applies to **new** WebGPU games that choose it (e.g. Valley Explorer). It does **not** force a migration of the existing ~40 classic games.

## Ownership / scope

- **Core game logic** lives in the game’s `core/` (rules, sim, AI). Keep numbers/keys in a config-style module when the game already does.
- **UI / display** lives in `ui/` (HTML shell, CSS, HUD wiring). Prefer **code-drawn** canvas/SVG over shipping large art packs; small icons (PNG/SVG) are fine.
- **Vendored libs** (if any) stay **inside the game or `engine/3d/vendor/`** — local copies only. No required CDN/npm at runtime.
- Do **not** edit `hub/`, `hub_appindex*`, or regenerate catalogs from a Games docs/PR unless Jor asks. Menu rows: edit **`games-apps.csv`** only when intentionally listing/changing a tile.

## Folder shape (current practical default)

```
apps/games/<name>/
  index.html          # no-flash redirect → <name>.html
  <name>.html         # real app shell + scripts/canvas
  <name>_icon.png     # or SVG path listed in CSV
  core/               # logic
  ui/                 # style + thin boot/HUD
```

Older layouts still exist (flat scripts, special cases). Leave them; don’t “HEX-ify” unless that title opts in.

## `index.html` redirect (new-standard)

Match Osmos / Valley pattern:

- No visible flashy body; head sets light/dark from `localStorage['sites-hub.theme']`, else `prefers-color-scheme`.
- `location.replace('<name>.html' + location.search + location.hash)` — preserve `?` and `#`.
- **No** cache-buster query params (`v=` on scripts/links) or release query params on scripts/links.
- Release id belongs in the **`<title>`** (e.g. `Osmos OSM1d`, `Valley Explorer HEX-7a`), not in the URL.

Game pages do **not** add Hub Back/header chrome; the Hub window supplies that.

## Scripts & runtime

- **Classic majority:** `<script src=…>` (GUIDE: many titles aim to open from `file://`). Shared settings: `../common/settings/games-settings.js`.
- **ES module games** (Osmos, Valley/HEX, some others): need **HTTP**; `import` from relative paths. HEX imports Three only through `engine/3d/core/…` (local MIT vendor) — classic games have **no** Three/HEX dependency.
- Default loop target ~**30 fps** where GameSettings/`frameMs` apply; HEX loops hard-cap at 30. No invented performance claims in docs or PRs.
- Prefer small procedural JS; **no build step** by default.

## Menu CSV

`games-apps.csv` columns: `name, path, icon, newtab, section, description` (see file header). Empty icon → `<folder>/<folder>_icon.png` or letter tile. This CSV is the Games menu source of truth; Hub catalog regeneration is a separate Hub concern.

## Testing

Typical: `node --check` on owned JS + small Node smoke. Broad browser/GPU playtest only when Jor asks. No cloud-agent requirement for ordinary game work.

## Boundaries

- Games **`common/`** = settings kit only (`common/settings/`). Not Learn’s `LRN` kit; not HEX.
- Do not copy full HEX API tables here — use [engine/README.md](./engine/README.md).
