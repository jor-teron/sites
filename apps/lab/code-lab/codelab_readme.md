# Code Lab (N1)

Jupyter/Kaggle-style code cells that run on a **remote Jupyter Server**. Separate from the Sketchbook app.

- **Connection bar**: server URL (remembered), token (password field; only remembered if *Remember* is ticked), Connect, status dot (red = not connected, amber = busy, green = connected).
- **Kernel**: kernelspecs are listed from the server; Start / Switch, Restart (↻), Interrupt (■).
- **Cells**: CodeMirror editor, ▶ run, ↑ ↓ move, ✕ delete, `+ Cell`, `Run all` (stops at the first error). Shift+Enter runs and moves to the next cell; Ctrl+Enter runs in place.
- **Output**: stdout/stderr, execute_result/display_data (text/plain, text/html, image/png/jpeg/svg), errors with traceback (ANSI colours stripped). `[n]` execution count, `[*]` while running.
- **Screens**: Cells and Settings (System/Light/Dark, default Dark; System follows `sites-hub.theme`), swipe ≥75 px outside editors/outputs or tap the dots.
- **Saving**: only through `codelab_save.js` (`codelab-cells-v1`, `codelab-settings-v1`) so Hub Drive can be plugged in later.

## Server

The server needs token auth and CORS for this site's origin, e.g.

```sh
jupyter server --ServerApp.token=<token> --ServerApp.allow_origin='https://jor-teron.github.io'
```

The site is served over https, so the server must be https too (e.g. `tailscale serve`); browsers block http/ws from an https page (localhost is the exception).

Library: `@jupyterlab/services` bundled in `vendor/codelab-lib.min.js` — see `vendor/README.md`.

Planned: N2 import/export `.ipynb`.
