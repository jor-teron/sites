<!-- Web MCP — relay/README.md: how to run the relay on the Radxa. MCP2.2 -->
# Web MCP relay (Radxa)

This is the small Node program that sits on the Radxa and only forwards messages. It never sees the files in your picked folder, and it writes nothing to disk. The tab does the real work.

Grok calls:

```
https://debian.tail94ffdb.ts.net/mcp/<PIN>
```

The Web MCP tab dials out to:

```
wss://debian.tail94ffdb.ts.net/ws
```

The tab has to stay open. If it is closed, Grok gets a JSON-RPC error: `Web MCP tab not connected`.

The relay listens on **port 8787** by default. The existing Linux MCP server is on **port 10001** and is left alone.

## 1. Quick start

On the Radxa (Debian 12):

```bash
# Node 18 or newer. Debian 12's apt package is fine.
sudo apt update && sudo apt install -y nodejs

# Fetch the starter script and run it. It downloads the relay files,
# adds Funnel routes for /mcp and /ws, and starts the relay on 8787.
curl -fsSL https://jor-teron.github.io/sites/apps/tools/web-mcp/relay/start-relay.sh -o start-relay.sh
chmod +x start-relay.sh
./start-relay.sh
```

To also start on boot:

```bash
./start-relay.sh --install
```

Other options: `--no-funnel`, `--no-update`, `--uninstall`, `--help`.

The script prints the Grok URL. The PIN itself comes from the Web MCP page (Show / Copy / Copy URL).

Quick check: `curl -sS http://127.0.0.1:8787/health` should start with `ok` and list the loaded modules (`mcp` in this release).

## 2. What start-relay.sh does

- Checks for Node 18+ and prints the apt install line if it is missing.
- Downloads the latest relay files from this Pages folder into `~/web-mcp-relay`. If a download fails, the previous copy is kept. `--no-update` skips the download.
- Adds Tailscale Funnel routes for `/mcp` and `/ws` only. It does **not** reset or remove any existing Serve or Funnel config, and it does **not** touch port 10001. The commands are:

```bash
tailscale funnel --bg --yes --set-path=/mcp http://127.0.0.1:8787/mcp
tailscale funnel --bg --yes --set-path=/ws http://127.0.0.1:8787/ws
```

  If `tailscale` is not installed, those two lines are printed and Funnel is skipped. `sudo` is used only when a run without it fails.

- `--install` writes `/etc/systemd/system/web-mcp-relay.service` so the relay starts on boot. It runs as the current user, with `Restart=always`. `--uninstall` removes that unit and leaves the files and Funnel routes alone.

Environment variables: `WEB_MCP_PORT` (default 8787), `WEB_MCP_HOST` (default 127.0.0.1), `WEB_MCP_DIR` (default `~/web-mcp-relay`), `WEB_MCP_SRC` (Pages base URL).

## 3. Modules

The relay is one Node program on one port, built so later apps can share it.

| File | Role |
|---|---|
| `web-mcp-relay.js` | Entry point (this is the file you run) |
| `relay_config.js` | All constants, overridable with env vars |
| `relay_core.js` | HTTP server, routing, CORS, rate-limit helpers, `/health` |
| `relay_ws.js` | Shared WebSocket helpers |
| `mod_mcp.js` | Web MCP module: `POST /mcp/<PIN>` and `WS /ws` |
| `relay_files.txt` | List of files `start-relay.sh` downloads together |

A new module registers HTTP and WebSocket routes with the core. This release only ships the MCP module. A TCP bridge (SSH / VNC / SFTP / FTP, for the Remote app) and a fetch proxy are planned later; they are not in MCP2.2.

`GET /health` returns:

```
ok
modules: mcp
```

Useful environment variables (same names as MCP1):

| Variable | Default | Meaning |
|---|---|---|
| `WEB_MCP_HOST` | `127.0.0.1` | Bind address |
| `WEB_MCP_PORT` | `8787` | Listen port (do not use 10001) |
| `WEB_MCP_BODY_MAX` | `10485760` | Max POST body, bytes |
| `WEB_MCP_RPC_TIMEOUT_MS` | `60000` | How long to wait for the tab |
| `WEB_MCP_RATE_MAX` | `120` | Requests per IP per window |
| `WEB_MCP_RATE_WINDOW_MS` | `60000` | Rate-limit window |
| `WEB_MCP_CORS_ORIGINS` | `*` | CORS origins, or a comma-separated list |
| `WEB_MCP_TRUST_PROXY` | `1` | Honour `X-Forwarded-For` (safe because we bind localhost) |

To run the entry by hand, without the starter script:

```bash
node ~/web-mcp-relay/web-mcp-relay.js
```

The sibling module files must sit in the same folder.

## 4. Check

1. Start the relay (`./start-relay.sh` or the systemd service).
2. Open Web MCP in Chrome or Edge, pick a folder, generate a PIN, press Connect. The status should say Connected.
3. From any machine:

```bash
curl -sS -X POST https://debian.tail94ffdb.ts.net/mcp/YOURPIN \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

You should get the file tools and `run_command` back. `GET` on that URL returns 405.
