# Lab page

`apps/lab/index.html` — a 4-column grid of square tiles for test apps that are not on the Hub home menu.

- **List:** `lab-apps.csv` (columns `name, path, icon`; `icon` optional; lines starting `#` are comments; paths relative to this folder). Add an app = add one line. Moving an app to the Hub = move its line into `hub/hub_apps.js`.
- **Icons:** empty icon → `<folder>/<folder>_icon.png`; if missing, a letter tile.
- **Needs http:** the CSV is fetched, so open the page from the live site or a local server, not `file://`.
- **Files:** `index.html`, `lab.css`, `lab.js`, `lab-apps.csv`.
