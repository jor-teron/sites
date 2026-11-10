<!-- Remote — README.md: how to use the RM2 connections list, tabs and SFTP browse. -->
# Remote (RM2)

One saved-connections list for SSH, VNC, SFTP and FTP, with Remmina-style tabs. This release adds an SFTP folder browser. No passwords are stored. A relay token is stored only if you save it on the connection or tick **Remember this token** when you connect (off by default).

Tapping a row:

- **SFTP** asks for the password (and relay token) and opens a folder browser in a new tab
- **SSH** and **VNC**: `viewer coming in a later RM release`
- **FTP**: `coming in RM4`

Several SFTP sessions can stay open at once. Switching tabs keeps each session alive. Closing a tab disconnects. The **Connections** tab is always first and cannot be closed. On a phone the tab strip scrolls sideways.

Remote is standalone. It does not open the old SSH or VNC apps, and it does not import their saved hosts. Later releases will add Remote's own SSH/VNC viewers (with their own `vendor/` copies), plus SFTP transfers (RM3) and plain FTP (RM4).

The protocol picker defaults to SFTP. Changing the protocol fills in port 22, 5900, 22 or 21 unless you already edited the port.

The optional relay field accepts `ws://` and `wss://`. A bare host becomes `wss://` on https pages and `ws://` on http pages. An https page warns if you enter `ws://`.

Connections are stored in this browser only, under localStorage key `remote-conns-v1`.

## SFTP relay

A browser cannot speak SSH itself, so SFTP goes through the Hub SFTP relay: JSON over a WebSocket to `hub/relay/sftp_relay.py`, which logs in to the server for you.

**This relay logs in for you and sees the password and the files. Run it only on your own machine, LAN or VPN. Do not forward port 8023 on a router.**

```
pip install paramiko websockets
python3 hub/relay/sftp_relay.py
```

It prints the listen address and the **token** (created on the first run and kept in `hub/relay/sftp_token.txt`, or pass `--token …`, or set `HUB_SFTP_TOKEN`).

Allow the SFTP target in the same allowlist the SSH app uses, `apps/connectivity/ssh/relay/allowlist.txt` (one `host:port` per line; a bare host means port 22). The file is re-read on every connection.

Relay URL examples:

- LAN or an http page: `ws://192.168.1.8:8023`
- https Hub: `wss://pc-main.<tailnet>.ts.net:8023` (put `cert.pem` and `key.pem` next to the relay, for example from `tailscale cert`)

A folder list shows name, size and date. Tapping a folder opens it; tapping a file shows details. Downloads and uploads arrive in RM3.

If something goes wrong, the app says so clearly: relay unreachable, wrong token, login failed, or the host is not in the allowlist. Those messages point back here.
