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
