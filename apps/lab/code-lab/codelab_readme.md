# Code Lab (N1 · CL10)

Jupyter/Kaggle-style code cells that run on a **remote Jupyter Server**. Separate from the Sketchbook app.

- **Connection bar**: server URL (remembered), token (password field; only remembered if *Remember* is ticked), Connect, status dot (red = not connected, amber = busy, green = connected).
- **Kernel**: kernelspecs are listed from the server; ＋ Start / ⇆ Switch, ↻ Restart, ■ Interrupt: three icon buttons at the left of the kernel row.
- **Connection loss**: if the server or the kernel websocket dies (checked by websocket events and an 8 s health check), the status dot goes amber (reconnecting) then red (lost), the bottom bar says "Connection lost" (aria-live, assertive), running cells get an error-style *ConnectionLost* note instead of a stuck `[*]`, queued cells are marked *skipped*, and the Connect button becomes **Reconnect**. When the server answers again the bar tells you. Reconnect reattaches to your kernel if it survived, otherwise starts a new one ("variables lost"). A cell that is running can always be deleted.
- **Kernel reattach / shutdown**: the id of the kernel this app started is remembered with the server URL. After a reload, Connect reattaches to that kernel (variables survive); with *Remember* ticked and a kernel remembered, the page reconnects by itself. If the kernel is gone, a new one is started. *Disconnect* shuts the kernel down (default; no leaked kernels). Settings → *On Disconnect*: shut it down / keep it running / ask. Closing or reloading the tab never shuts it down. Kernels started by something else are never touched.
- **Run timeout** (Settings: Off, 30 s, 1/5/15 min, 1 h; default Off): a cell running longer is interrupted, shows a *TimeoutError* note, and the rest of the queue is skipped. If the kernel ignores the interrupt for 6 s the app stops waiting and suggests Restart.
- **Queue**: cells run one at a time. Clicking ▶ on a running cell does nothing; on a queued cell (shows `[…] queued`, button `…`) it removes it from the queue. Outputs are only cleared when the cell actually starts. Interrupt and Restart empty the queue (cells show `⚠ skipped: …`), so nothing carries on into the new kernel; Run all stops at the first failed, interrupted or timed-out cell.
- **Cells**: CodeMirror editor, ▶ run, ↑ ↓ move, ✕ delete, `+ Cell`, `Run all` (stops at the first error). Shift+Enter runs and moves to the next cell; Ctrl+Enter runs in place.
- **Keyboard / screen reader (CL5)**: Tab and Shift+Tab always move focus, also out of an editor (no keyboard trap). **Ctrl+M** inside an editor makes Tab indent (Shift+Tab un-indents; a dashed focus ring shows the mode); **Esc** or Ctrl+M switches it off. A one-time hint explains this. Esc closes Settings; the closed screen is `inert` + `aria-hidden`, focus moves into a screen when it opens and back to the opener when it closes. Cell buttons are named by number ("Run cell 3", "Delete cell 3", …) and renumber on move/add/delete. The connection dot has a text name and a shape (circle connected, ring busy, square lost, dashed not connected); `#msg` and connection changes are live regions. Text on accent/amber buttons is dark-on-light in dark mode (≥ 4.5:1).
- **Friendlier UI (CL10)**: compact 30 px buttons, 14 px text, more space between cells. Each cell has ▶ Run plus a **⋯ menu** (Add above, Add below, Move up, Move down, Duplicate, Clear output, Delete); the menu opens with Enter/Space, arrows/Home/End move, Esc closes and returns focus. Top bar has labelled **Run all, Start, Restart, Stop** buttons and a plain status line ("Connected · idle", "Running cell 3…"). Stronger 3 px focus rings and darker muted text for contrast. On phones (≤480 px) cells go full width and the top bar wraps. Run/queue/kernel logic unchanged.
- **Output**: stdout/stderr, execute_result/display_data (text/plain, text/html, image/png/jpeg/svg), errors with traceback (ANSI colours stripped). `[n]` execution count, `[*]` while running. Streams behave like a terminal (`\r` overwrites the current line, `\b` erases a char, so progress bars show one line); `update_display` updates the existing output in place (also from a later cell); about 2000 lines / 200 KB per cell are shown, then **Show more** / **Show all** (5 MB kept per cell, 200 KB saved per stream). Output code lives in `codelab_output.js`.
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
