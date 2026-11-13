# Deployment checklist

1. Install on a supported Debian host with Python 3.8+ and required kernel namespace support.
2. Set a strong production PIN in `mcp.conf` or a protected PIN file. Never use the demo PIN.
3. Keep authentication enabled (`AUTH=1`).
4. Keep the server bound to loopback when publishing through Tailscale Funnel or a trusted reverse proxy.
5. If using forwarded client IPs, configure `TRUST_PROXY=1` and a narrow `TRUST_PROXY_IPS` allowlist for the actual proxy addresses.
6. Configure Funnel and boot-time startup only if needed.
7. Run `./mcp.sh --selftest` after configuration and after host/kernel changes.
8. Check `./mcp.sh --status`, logs and `./mcp.sh --version` after reboot.

The installer preserves an existing `mcp.conf`; review it manually when upgrading so credentials and local settings remain intact.


## Optional standalone API

The API is a separate process from MCP. Start it only when needed:

```sh
API_HOST=127.0.0.1 API_PORT=10002 python3 -m api.server
```

It shares `mcp.conf` workspace, sandbox and PIN settings. Keep it bound to
loopback unless a separate exposure/security review has been completed. The
API is not included in the existing MCP Funnel route. Check `GET
http://127.0.0.1:10002/api/health`; authenticated clients can use
`GET /api/tools` and `POST /api/tools/call`.
