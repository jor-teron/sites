<!-- Web MCP — relay/README.md: how to run the relay on the Radxa. MCP1 -->
# Web MCP relay (Radxa)

This file is the small Node program that sits on the Radxa and only forwards messages. It never sees the files in your picked folder. The tab does the real work.

Grok calls:

```
https://debian.tail94ffdb.ts.net/mcp/<PIN>
```

The Web MCP tab dials out to:

```
wss://debian.tail94ffdb.ts.net/ws
```

The tab has to stay open. If it is closed, Grok gets a JSON-RPC error: `Web MCP tab not connected`.

## 1. Copy and run

Copy `web-mcp-relay.js` onto the Radxa, for example to `/home/ai/web-mcp-relay.js`. Node is enough; there are no npm packages.

The existing Linux MCP server already listens on **port 8787** at `https://debian.tail94ffdb.ts.net/ai/mcp`. Do not start this relay on 8787 while that server is running. Use **8788** instead.

```bash
WEB_MCP_PORT=8788 node /home/ai/web-mcp-relay.js
```

It binds `127.0.0.1` by default (only Funnel / Serve should reach it). Useful environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `WEB_MCP_HOST` | `127.0.0.1` | Bind address |
| `WEB_MCP_PORT` | `8787` | Listen port (use `8788` next to Linux MCP) |
| `WEB_MCP_BODY_MAX` | `10485760` | Max POST body, bytes |
| `WEB_MCP_RPC_TIMEOUT_MS` | `60000` | How long to wait for the tab |
| `WEB_MCP_RATE_MAX` | `120` | Requests per IP per window |
| `WEB_MCP_RATE_WINDOW_MS` | `60000` | Rate-limit window |
| `WEB_MCP_CORS_ORIGINS` | `*` | CORS origins, or a comma-separated list |
| `WEB_MCP_TRUST_PROXY` | `1` | Honour `X-Forwarded-For` (safe because we bind localhost) |

Quick check: `curl -sS http://127.0.0.1:8788/health` should print `ok`.

## 2. systemd unit

`/etc/systemd/system/web-mcp-relay.service`:

```
[Unit]
Description=Web MCP relay
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/node /home/ai/web-mcp-relay.js
Environment=WEB_MCP_PORT=8788
Environment=WEB_MCP_HOST=127.0.0.1
Restart=on-failure
RestartSec=2
User=ai

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now web-mcp-relay
sudo systemctl status web-mcp-relay
```

## 3. Tailscale Funnel / Serve

Two options, depending on whether the Linux MCP server is already using Funnel on this host.

### Option A — path mapping (recommended)

Keep Linux MCP on port 8787 at `/ai/mcp`. Point `/mcp` and `/ws` at this relay on 8788. Funnel can already be on from the Linux MCP setup.

```bash
# Adjust to your tailscale serve syntax if a version prints a slightly different help line.
# The idea: two path prefixes on the same https://debian.tail94ffdb.ts.net host.

sudo tailscale serve --bg --https=443 /mcp http://127.0.0.1:8788/mcp
sudo tailscale serve --bg --https=443 /ws  http://127.0.0.1:8788/ws
# Funnel is probably already enabled. If not:
sudo tailscale funnel --bg --https=443 on
sudo tailscale serve status
```

After this:

- Linux MCP stays at `https://debian.tail94ffdb.ts.net/ai/mcp`
- Web MCP is at `https://debian.tail94ffdb.ts.net/mcp/<PIN>`
- The tab uses `wss://debian.tail94ffdb.ts.net/ws`

If `tailscale serve` on your version wants a JSON config instead of `--set-path` / path arguments, put `/mcp` and `/ws` in that config and point both at `http://127.0.0.1:8788`. WebSockets need the `/ws` upgrade to reach the relay unchanged.

### Option B — whole-port Funnel on a free port

Only use this if Linux MCP is not sharing this Funnel, or you have a second hostname. Funnel the relay port itself:

```bash
WEB_MCP_PORT=8787 node /home/ai/web-mcp-relay.js
sudo tailscale funnel --bg 8787
```

That would take over the host's HTTPS frontend, so it will clash with the existing `/ai/mcp` mapping. Prefer Option A.

## 4. Check

1. Start the relay (systemd or `node`).
2. Open Web MCP in Chrome or Edge, pick a folder, generate a PIN, press Connect. The status should say Connected.
3. From any machine:

```bash
curl -sS -X POST https://debian.tail94ffdb.ts.net/mcp/YOURPIN   -H 'Content-Type: application/json'   -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

You should get the six file tools back. `GET` on that URL returns 405.
