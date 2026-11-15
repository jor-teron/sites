# Relay (RY1)

A small Tools page to set up and test the **Hub relay** (`hub/relay/`, RL1): the Node program on your PC or Pi
that serves Web MCP (`/ws`, `/mcp/<PIN>`), SSH/VNC (`/tcp?token=HOST:PORT`) and fetch (`/fetch`) on one port,
`127.0.0.1:8787` by default. A web page can't start the relay; it must run on the PC (see hub/relay/README.md).

- **Connection:** relay address + optional relay token (16–512 characters), Save, Test. Test calls
  `GET <address>/health` (token sent as `Authorization: Bearer …`) and shows connected / not running /
  wrong token / blocked by the browser, plus which modules are on (`ok\nmodules: mcp, tcp, fetch`).
- **Endpoints:** derived URLs with copy buttons; the token is masked unless shown.
- **Set up:** install / restart commands for Linux/macOS and Windows.
- **Allow lists:** builds a `relay.json` snippet (`TCP_ALLOWLIST`, `FETCH_ALLOWLIST`, `PUBLIC_HOSTS`) with
  the same format checks as the relay.

Files: `relay.html` (page), `index.html` (IX redirect), `relay_shared.js` (pure helpers), `relay_ui.js`,
`relay.css`, `relay_icon.svg`, `tests/ry1.test.cjs` (`node --test apps/tools/relay/tests/ry1.test.cjs`).

## Shared setting `hub.relay`

`localStorage['hub.relay']` = JSON `{"url":"http://127.0.0.1:8787","token":"","savedAt":"2026-11-15T17:30:00.000Z"}`

- `url`: relay origin (http or https, no path). `token`: `''` or 16–512 characters. `savedAt`: ISO time.
- Other Hub apps (same origin) can load `apps/tools/relay/relay_shared.js` and use `HubRelay.load(localStorage)`,
  then `HubRelay.wsUrl(cfg)`, `tcpUrl(cfg, host, port)`, `mcpUrl(cfg, pin)`, `fetchUrl(cfg)`, `healthUrl(cfg)`
  and `authHeaders(cfg)`. WebSocket URLs carry `?relay_token=`; HTTP calls use the header.
- RY1 only writes the key; no other app reads it yet (each app switches in its own release).
- The token is kept in plain text in this browser's storage.
