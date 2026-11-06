# Learn (category conventions)

Study/reference apps under `apps/learn/`. **Independent of HEX** — no Three/WebGPU engine, no `apps/games/engine` dependency.

Tiles page: `learn.html` (`index.html` redirects, keeps `?` / `#`). Shared tiles UI: `shared/tiles/` when present. Hub already maps Learn → `apps/learn/learn-apps.csv` / `learn.html` (do not edit `hub/` from a Learn docs PR).

## List / icons

Source of truth: **`learn-apps.csv`** (`name, path, icon, newtab, section, description`). Paths relative to this folder (cross-category rows may use `../tools/…`). Empty icon → `<folder>/<folder>_icon.png` or letter tile; some apps use SVG paths in the CSV when listed that way. Category icon: `learn_icon.png`.

Needs HTTP for CSV fetch (and most content `fetch`) — not `file://` for the tiles page.

## App folder shape

```
apps/learn/<name>/
  index.html           # no-flash redirect → <name>.html (sites-hub.theme / prefers-color-scheme)
  <name>.html          # shell + classic <script> tags
  <name>_icon.png
  core/                # app glue
  ui/                  # CSS
  assets/              # often plain .txt lesson cards (First Aid pattern)
```

Release id in **`<title>`** only (e.g. `First Aid LRN1c`, `Typing Tutor TT1`). No cache-buster query params on assets. No Hub Back chrome inside the page (Hub title bar / `shared/learn-hubbar.js` when in a Hub window).

Older one-off layouts remain; don’t force every app onto the card kit.

## Shared Learn kit (`common/`) — not for Games

Classic scripts attach **`window.LRN`**. Load order used by First Aid:

1. `common/core/parser.js` — `LRN.parseCard`, `LRN.parseIndex`, `LRN.load(base, ver, fallback)`
2. `common/core/state.js` — `LRN.store`, `LRN.mode` (`basics`|`expert`, key `learn.mode`), `LRN.progress(prefix)`
3. `common/core/quiz.js` — `LRN.quiz.build` / `shuffle`
4. `common/ui/views.js` — `LRN.h`, `LRN.views` (home / card / quiz)
5. `shared/learn-hubbar.js` — optional Hub title-bar attach
6. `common/ui/app.js` — `LRN.app({ root, base, ver, prefix, title, fallback, disclaimer })`
7. App `core/app.js` + `common/ui/learn.css`

**Basics / Expert** is one shared preference (`learn.mode`) across kit apps. Content is text-first (`.txt` cards with `[basics]` / `[expert]` / `[quiz]` sections). Not a “game loop” engine.

Apps that never adopted the kit (e.g. some tutors/tools-style pages) stay self-contained; inspect that folder.

## Themes

Many Learn pages use dark-friendly CSS (`learn.css` / app CSS). Redirect `index.html` still follows Hub theme for the brief load flash (light/dark class), same as Games.

## Conventions

- Self-contained folders; small procedural JS; **no build step** by default.
- Vendor locally if needed (example: Code School keeps sql.js under its own `vendor/`).
- Do **not** use Games `common/settings` or HEX here. Do **not** register Games tiles from Learn CSV.
- Tests: syntax / small Node checks when touching JS; browser only if Jor asks.

## Cross-links

- Games standalone + settings: [`../games/README.md`](../games/README.md), [`../games/GUIDE.md`](../games/GUIDE.md)
- HEX WebGPU (Games only): [`../games/engine/README.md`](../games/engine/README.md) — Learn does **not** link examples into Learn apps.
