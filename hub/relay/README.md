# SFTP relay (H119)

Files can open SFTP servers as drives (🌐 Network drives › 🔐 name). A web page can't speak SSH by
itself, so Files talks JSON over a WebSocket to this small relay on your PC, and the relay does the SFTP:

```
browser (Files, shared/fs/sftp_fs.js) --ws/wss--> sftp_relay.py on your PC :8023 --ssh/sftp--> server :22
```

This is not the SSH app relay (`apps/connectivity/ssh/relay/`, websockify): that one only forwards
encrypted bytes. **This relay logs in for you, so it sees the password and the files.** Run it only on
your own PC or Pi, and only on your LAN or a VPN (Tailscale). Never forward port 8023 on the router.

## Start it

```
pip install paramiko websockets
python3 hub/relay/sftp_relay.py
```

It prints the address and the **token** (made on the first run and kept in `sftp_token.txt`; or pass
`--token …`, or set `HUB_SFTP_TOKEN`). Options: `--host 100.x.y.z` (listen on one address only),
`--port 8023`, `--max-mb 100` (largest file), `--origin https://jor-teron.github.io` (only that page may
connect), `--allowlist FILE`, `--cert/--key`.

## Allow the server

The relay only connects to targets in the SSH app's allowlist,
`apps/connectivity/ssh/relay/allowlist.txt` (one `host:port` per line, a bare host = port 22, wildcards
like `192.168.1.*:22`). It is re-read on every connection.

## Add the drive

Settings › Network drives › Type **SFTP**: Relay URL (`ws://192.168.1.10:8023`, or `wss://…` from the
https Hub), Relay token, Host, Port, User, Password, Folder (optional, default the home folder). Test, then Add.
The drive shows in Files under 🌐 Network drives. Everything is saved in this browser only.

## wss:// (from the https site)

Browsers only allow `wss://` from an https page. Put `cert.pem` and `key.pem` next to this script (or
next to the SSH relay, the same files work), e.g. from `tailscale cert pc-main.<tailnet>.ts.net`, and use
`wss://pc-main.<tailnet>.ts.net:8023`.

## Host keys

The first login to a server trusts and saves its key in `sftp_known_hosts`. A changed key is refused
("server key changed") until you delete that line.

## Limits

- Password login only (no SSH keys yet). One SSH login per open drive; it logs out after 2 minutes idle.
- A whole file is read or written in one go (up to `--max-mb`), no resume.
- Works only where the relay is reachable (same Wi-Fi or VPN).


---

# Shared relay (RL1)

RL1 is a separate Node relay in this folder. The SFTP instructions above and
`sftp_relay.py` are unchanged. One listener runs three switchable modules; no npm
install is needed. Use Node 18 or newer (a supported Node LTS is recommended).
It starts on **127.0.0.1:8787**, not on the LAN. Stop the old Web MCP relay first
if it already uses that port. Nothing touches the Linux MCP server on 10001.

## Install and start

These commands download from **main**. They become usable only after RL1 is
merged there; a local-only commit does not publish the installer.

Linux / macOS:

```bash
curl -fsSL https://raw.githubusercontent.com/jor-teron/sites/main/hub/relay/install.sh | bash
```

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/jor-teron/sites/main/hub/relay/install.ps1 | iex
```

Read the script first if preferred. Node must already be installed. The installer
downloads all runtime files before replacing an install, checks JavaScript syntax,
keeps previous runtime files in a `before-RL1...` folder, preserves `relay.json` and
any target lists, then starts in the foreground. No admin access, service, automatic
startup, Tailscale, Funnel, router or firewall changes. Ctrl+C stops it.

- Linux/macOS folder: `~/.local/share/sites-hub-relay`; restart with
  `bash ~/.local/share/sites-hub-relay/start-relay.sh`.
- Windows folder: `$env:LOCALAPPDATA\sites-hub-relay` (home if LOCALAPPDATA is absent).
  Restart with `node "$env:LOCALAPPDATA\sites-hub-relay\hub-relay.js" --config "$env:LOCALAPPDATA\sites-hub-relay\relay.json"`.
  `start-relay.ps1` is also supplied; no execution-policy bypass is installed.
- Set `HUB_RELAY_DIR` to choose a folder, or `HUB_RELAY_INSTALL_ONLY=1` to download
  without starting. User configuration is never overwritten on reinstall.
- From this checkout: `node hub/relay/hub-relay.js` (safe built-in defaults), or
  `bash hub/relay/start-relay.sh --config /path/to/relay.json`.
- `node hub/relay/hub-relay.js --help` lists flags. Start scripts read a sibling
  `relay.json` if present; the direct Node command needs `--config` or
  `HUB_RELAY_CONFIG` to read a file.

## Modules and paths

All use the same port, **8787** by default:

- `mcp`: `WS /ws`, `POST /mcp/<PIN>`. Reuses the Web MCP MCP2.2 protocol:
  tab sends `{type:"hello",pin:"..."}`, relay sends `hello-ok`, forwards
  `{type:"rpc",id,payload}`, tab replies `{type:"rpc-result",id,payload}`.
  JSON-RPC notifications get HTTP 202; a missing tab keeps the existing
  `Web MCP tab not connected` JSON-RPC error. The PIN is still required.
- `tcp`: binary WebSocket at `/tcp?token=HOST:PORT`. `/` and `/websockify` are
  accepted too for websockify clients. `?target=HOST:PORT` is an alias. Supports
  the `binary` subprotocol (or no subprotocol), not legacy base64. SSH and VNC
  use the same byte bridge; it does not log in, interpret SSH, or provide SFTP.
- `fetch`: `POST /fetch`, bounded HTTP(S) proxy for WebDAV and API calls.
- `GET /health` returns `ok` and loaded module names; `GET /` gives a banner.
  HTTP paths accept a trailing slash. Disabled module paths return 404.

`MODULES` in JSON or `--modules mcp,tcp` chooses modules. `--no-mcp`, `--no-tcp`
and `--no-fetch` disable them individually. Modules register HTTP/upgrade routes
with `relay_core.js`; the core applies Host, Origin, token and rate checks first.
No app code has been moved, deleted or repointed by RL1.

## Configure only the targets you need

Copy `config.example.json` to a private `relay.json` (the installers do this once).
JSON file settings are overridden by `HUB_RELAY_<KEY>` environment variables and
then flags. Array environment values are comma-separated. Relative certificate
and target-list paths are relative to the JSON file. Configuration changes need
a restart, except the TCP target file, which is read on every connection.

- `CORS_ORIGINS`: exact page origins, no paths or `*`. Defaults are
  `https://jor-teron.github.io`, `http://localhost:8787`, `http://127.0.0.1:8787`.
  Add the exact origin of a locally hosted Hub (including its port) if needed.
  `Origin: null` (including file pages) is refused. Requests without Origin are
  accepted for CLI/MCP services, subject to token/target checks.
- `TCP_ALLOWLIST`: array such as `["192.168.1.20:22", "127.0.0.1:5900"]`.
  Or set `TCP_ALLOWLIST_FILE` to a private text file. See
  `tcp_allowlist.example.txt`: `#` comments, bare host = 22, IPv6 in brackets,
  host-only `*` globs; no wildcard ports. A missing/unreadable file denies access.
  This reuses the old SSH allowlist format but does not edit or enable that file.
- `FETCH_ALLOWLIST`: exact HTTP(S) origins, for example
  `["https://dav.example.com", "http://127.0.0.1:11434"]`. Paths and wildcard
  origins are not allowed. **Both TCP and fetch start with empty target lists**
  and refuse all targets until configured. Fetch needs an allowlist even with a token.
- `TOKEN`: optional extra relay-wide secret, **16–512 characters**. Prefer setting
  `HUB_RELAY_TOKEN` in the environment, not shell arguments/history or shared JSON.
  HTTP uses `Authorization: Bearer SECRET` or `X-Relay-Token`. Browser WebSockets
  use `?relay_token=SECRET`; for MCP use `/ws?relay_token=SECRET`. This is distinct
  from the TCP `token=HOST:PORT` target and the MCP PIN. Do not share or log these
  URLs; a reverse proxy may log query strings unless configured not to.
- `HOST`: loopback by default. A non-loopback bind is refused unless a token is
  set. Add any external hostname/IP to `PUBLIC_HOSTS` (hostnames only, no port)
  so the Host-header check accepts it. Do not expose this relay openly.
- `TLS_CERT` and `TLS_KEY` together (or `--cert` and `--key`) enable HTTPS/WSS
  directly with your trusted certificate. HTTPS is not enabled by default.

The relay never trusts X-Forwarded-For. Browser Origin checks also run on WS
upgrades; Host checks help prevent DNS rebinding. Target DNS names resolve through
the OS: allowlist only names/DNS you trust, or use exact IPs. An allowed origin
permits **all paths and supported methods** there, not just one WebDAV folder.
No cookies are copied from browser requests; upstream auth must be supplied
explicitly. This is a trusted-user local tool, not a multi-user public proxy.

Limits: 64 client connections, 120 requests/upgrades per IP per 60 seconds,
10 MiB request envelopes / WS messages / upstream response bodies, 20 MiB WS/TCP
write queue, 128 pending MCP requests per tab, 60 s RPC wait, 30 s TCP-connect or
fetch deadline, 5 min idle sockets. WebSocket fragments, ping/pong, masking,
UTF-8 and message sizes are checked. Limits live in `relay_config.js` and can
be changed with config/environment. Fetch buffers whole bodies; not for SSE,
streaming AI responses or large file transfers. HTTP error responses do not echo
upstream URLs, credentials, PINs or stack traces.

## Fetch envelope

Send JSON to `/fetch` (add outer relay Authorization if configured):

```json
{"url":"https://dav.example.com/folder/","method":"PROPFIND","headers":{"Depth":"1","Content-Type":"application/xml"},"body":"<propfind/>"}
```

`method` defaults to GET. Supply `body` for UTF-8 text or `bodyBase64` for binary,
never both. Supported methods: GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS,
PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK, REPORT. COPY/MOVE Destination
must also match the fetch allowlist. Hop-by-hop headers, Host, Cookie, Origin,
Referer, forwarded headers and relay-token headers are not forwarded. Explicit
inner `Authorization` is upstream auth, not the outer relay token.

A completed upstream exchange gives outer HTTP 200 and JSON
`{status,statusText,headers,bodyBase64}`; decode the base64 body. Inspect the inner
status for upstream errors. Relay errors use 400/401/403/413/429/502.
Redirects are returned as 3xx in the envelope and **never followed**, so they
cannot jump the allowlist. Set-Cookie is not returned; the proxy has no cookie jar.

## Point apps here later (Apps Builder's area)

- Web MCP's editable relay URL can be `ws://127.0.0.1:8787/ws`, or
  `wss://YOUR-TRUSTED-HOST:8787/ws` with TLS; keep the same PIN and MCP paths.
- Remote/SSH/noVNC can use `ws://127.0.0.1:8787/tcp` as the relay base; they add
  `?token=HOST:PORT`. Add that target to RL1's allowlist first. Port 8022 is the
  **old relay**, not an additional RL1 listener. Client UI defaults remain unchanged.
- WebDAV / AI consumers would need an Apps release to send the fetch envelope;
  `/fetch` is not a transparent replacement for their current service URL.
- A secure page normally needs **wss:// / https://**, not ws:// to a LAN address.
  Use a certificate trusted by that browser or a separately managed HTTPS reverse
  proxy with WebSocket upgrades. Put its public hostname in PUBLIC_HOSTS, preserve
  the real Origin, and require a relay token. Scheme conversion preserves wss;
  RL1 cannot bypass mixed-content or local-network browser permission rules.
- Loopback is local to the PC running this relay. A remote MCP service cannot
  reach it automatically. RL1 does not create a public URL, tunnel, or VPN.
  Choosing external hosting/TLS and changing Apps defaults are separate decisions.

## Tests

`node --test hub/relay/tests/*.test.cjs` runs local-only integration and installer
checks. `node --test hub/tests/*.test.cjs apps/tools/web-mcp/tests/*.test.cjs` runs
the existing fast Hub/Web MCP checks. No live SSH/VNC service or provider keys are
needed. Real-device browser permissions and Windows installer execution still
need a test on those systems. No shell-cache/build bump is needed for RL1.
