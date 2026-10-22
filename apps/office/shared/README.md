# Office shared files

Shared by the Office apps (Spreadsheet, Draftly). Not the repo-root `shared/` (Hub).
Plain scripts, no build, work from `file://`. Each app keeps its own storage keys.

- `office-ribbon.css` / `office-ribbon.js`: Draftly-style ribbon (36px top row with File + tabs,
  one scrolling row of `.of-group`s per tab, File dropdown). Tabs are data `{id, label}`.
- `office-dialog.css` / `office-dialog.js`: `OfficeDialog.prompt / confirm / form` modal dialogs.
- `office-page.js`: paper sizes, margin presets (Normal / Narrow / Wide), `clampMargins`,
  `pageRule` (@page text), `inject` (style tag), `customMarginsDialog`.
