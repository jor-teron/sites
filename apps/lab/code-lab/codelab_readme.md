# Code Lab (N1 · CL2)

Jupyter/Kaggle-style code cells that run on a **remote Jupyter Server**. Separate from the Sketchbook app.

- **Connection bar**: server URL (remembered), token (password field; only remembered if *Remember* is ticked), Connect, status dot (red = not connected, amber = busy, green = connected).
- **Kernel**: kernelspecs are listed from the server; Start / Switch, Restart (↻), Interrupt (■).
- **Cells**: CodeMirror editor, ▶ run, ↑ ↓ move, ✕ delete, `+ Cell`, `Run all` (stops at the first error). Shift+Enter runs and moves to the next cell; Ctrl+Enter runs in place.
- **Output**: stdout/stderr, execute_result/display_data (text/plain, text/html, image/png/jpeg/svg), errors with traceback (ANSI colours stripped). `[n]` execution count, `[*]` while running.
- **Screens**: Cells and Settings (System/Light/Dark, default Dark; System follows `sites-hub.theme`), swipe ≥75 px outside editors/outputs or tap the dots.
- **Saving**: only through `codelab_save.js` (`codelab-cells-v1`, `codelab-settings-v1`) so Hub Drive can be plugged in later. Code is saved 300 ms after typing and immediately when the page is hidden or closed. Saved data is validated on load: damaged cells are removed or repaired, the original is kept once in `codelab-cells-v1.corrupt`, and the app never starts blank. If outputs do not fit (2 MB cap or browser storage full) a warning shows in the bottom bar; code is always saved first.
- **Delete / Clear**: deleting a cell that has code or output, and *Clear all outputs*, ask for confirmation (no undo).

## HTML output is sandboxed

`text/html` output (pandas tables, `display(HTML(...))`) comes from the server and is not trusted. It is shown in an `<iframe sandbox>` with no `allow-scripts` and no `allow-same-origin` (only `allow-popups`, so links open in a new tab), plus a CSP inside the frame and `<base target=_blank>`. Scripts, `onerror=`, `javascript:` links and `<style>` rules therefore cannot run or restyle the app, or read this site's localStorage. Consequences: interactive HTML/JS output (plotly, ipywidgets) does not run; the frame height is an estimate, so drag the bottom-right corner to resize; the frame follows the app theme.

## Server

The server needs token auth and CORS for this site's origin, e.g.

```sh
jupyter server --ServerApp.token=<token> --ServerApp.allow_origin='https://jor-teron.github.io'
```

The site is served over https, so the server must be https too (e.g. `tailscale serve`); browsers block http/ws from an https page (localhost is the exception).

### Opening from a file (file://)

The app also works when `codelab.html` is opened straight from disk, but then the browser sends `Origin: null`, so the server must allow it. `allow_origin` lists exact origins, so use `*` (the token still protects the server):

```sh
jupyter server --ServerApp.token=<token> --ServerApp.allow_origin='*'
```

`allow_origin` (or `ServerApp.allow_origin_pat`) must match the page's origin: `https://jor-teron.github.io` for the hosted site, `http://localhost:<port>` for a local static server, `*` for file://. A wrong value shows as "Cannot reach server" or "Wrong token" in the bar. Use http only for localhost; anything else must be https.

Library: `@jupyterlab/services` bundled in `vendor/codelab-lib.min.js` — see `vendor/README.md`.

Planned: N2 import/export `.ipynb`.
