# Office shared files

Shared by the Office apps (Spreadsheet, Draftly; PDF Tools loads none of these today). Not the repo-root `shared/` (Hub).
Plain scripts, no build, work from `file://`. Each app keeps its own storage keys.

- `office-ribbon.css` / `office-ribbon.js`: Draftly-style ribbon (36px top row with File + tabs,
  one scrolling row of `.of-group`s per tab, File dropdown). Tabs are data `{id, label}`.
- `office-dialog.css` / `office-dialog.js`: `OfficeDialog.prompt / confirm / form` modal dialogs.
- `office-page.js`: paper sizes, margin presets (Normal / Narrow / Wide), `clampMargins`,
  `pageRule` (@page text), `inject` (style tag), `customMarginsDialog`.

SH1 (moved from Draftly, used by Draftly and Spreadsheet). Colours come from the app's `--of-*`
variables (`--of-bg, --of-text, --of-border, --of-group, --of-muted, --of-focus, --of-ui-font`);
set them on `body` so dark/light overrides flow through.

- `office-toast.css` / `office-toast.js`: `OfficeToast.show(msg, ms)`; uses `.of-toast` / `#toast` or creates it.
- `office-theme.css` / `office-theme.js`: `OfficeTheme.isDark(mode)` (light / dark / auto),
  `apply(dark, {darkClass, lightClass, key})` (body classes + per-app storage key), `watch(fn)`, `modes`.
  Theme colours stay in each app's CSS.
- `office-settings.css` / `office-settings.js`: `OfficeSettings.create({key, defaults, sections, migrate,
  validate, gearBtn, onChange, onReset, confirm, toast})`. Builds the slide-in panel (switch / select /
  external / about rows), one JSON localStorage key per app. Draftly: `draftly_settings`
  (sections + migration in draftly-settings.js); Spreadsheet: `spreadsheet_settings`.
- `office-colour.css` / `office-colour.js`: `OfficeColour.create({btn, arrow, menu, bar, palette, key,
  fallback, autoBar, onPick, onOpen, onClose, autoRemember})`. Split button + swatch grid, one open at a time.
- `office-hover.js` (DF13): `OfficeHover.attach({tabsEl, tabSelector, selectTab, fileBtn, fileMenu,
  isFileOpen, setFile, enabled, delay:100, closeDelay:300})`: mouse-only hover opens ribbon tabs (100 ms)
  and the File menu (closes 300 ms after leaving). Touch keeps click. Used by Draftly + Spreadsheet,
  each gated by a `hoverTabs` setting ("Open tabs on hover").
- `office-collapse.css` / `office-collapse.js` (DF13c): `OfficeCollapse.attach({tabsEl, tabSelector, ribbonEl,
  docEl, collapsed, onUserChange, onLayout})`: Word-style ribbon collapse. Click the active tab to collapse
  (`body.ribbon-collapsed`), click / hover a tab to peek the ribbon as an overlay (`.of-peek`, hides on a
  doc click, Esc or 300 ms after the mouse leaves), double-click a tab to expand. The ribbon element needs
  class `of-collapsible`. Persisted by each app as setting `ribbonCollapsed` ("Collapse ribbon").

## SH4 — shared ribbon controls
Shared `../shared/office-tools.css` (tool groups, tool buttons, File menu items) and `office-icons.js` (one SVG icon set via `data-icon`). Both apps use the same Bold/Italic/Underline, Align left/center/right and File menu icons. Spreadsheet: Draftly-style File menu (with Settings) and Alignment buttons instead of the select.
