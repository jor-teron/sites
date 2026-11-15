# Tailscale Funnel setup

Publish the MCP server on your tailnet so clients can reach it without opening firewall ports.

## Prerequisites

1. Tailscale is installed and the machine is logged in (`tailscale status`).
2. Funnel is enabled for your tailnet (admin console → DNS → Funnel).
3. The MCP server is running and bound to loopback (default).

## Ports and paths

| Item | Value | Set in |
|------|-------|--------|
| MCP port | 10001 | `mcp.conf` `PORT` |
| Funnel path | `/sandbox` | `mcp.conf` `FUNNEL_PATH` |
| Public URL | `https://<host>.<tailnet>.ts.net/sandbox` | `mcp.conf` `PUBLIC_URL` |
| API port | 10002 | `mcp.conf` `API_PORT` (not funneled by default) |

## One-time setup

```bash
cd /home/ai/mcp/server
./mcp.sh start          # if not already running
./mcp.sh funnel         # registers the Funnel path
```

`./mcp.sh funnel` runs:

```bash
tailscale funnel --bg --set-path /sandbox http://127.0.0.1:10001/mcp
```

## Check

```bash
./mcp.sh status
tailscale funnel status
```

You should see the path `/sandbox` pointing at `http://127.0.0.1:10001/mcp`.

## Connect

- Single-PIN: `https://<host>.<tailnet>.ts.net/sandbox/<PIN>`
- Multi-user: `https://<host>.<tailnet>.ts.net/sandbox/<user>/<password>`

## Change the path

Edit `mcp.conf`:

```ini
FUNNEL_PATH=/sandbox
PUBLIC_URL=https://your-host.example/sandbox
```

Then re-run `./mcp.sh funnel`.

## Notes

- The API (port 10002, RAG dashboard at `/rag`) is **not** exposed by the MCP Funnel route.
- Keep `HOST=127.0.0.1` so the server is only reachable through Funnel or localhost.
- Funnel must be re-applied after a Tailscale restart or path change.
