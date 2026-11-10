<!-- Remote — README.md: how to use the RM6 connections list, tabs, SFTP browse and transfers, and the SSH terminal. -->
# Remote (RM6)

One saved-connections list for SSH, VNC, SFTP and FTP, with Remmina-style tabs. This release adds an SSH terminal on top of the SFTP folder browser and transfers. No passwords are stored. A relay token (SFTP only) is stored only if you save it on the connection or tick **Remember this token** when you connect (off by default).

Tapping a row:

- **SFTP** asks for the password (and relay token) and opens a folder browser in a new tab
- **SSH** asks for the password and opens a terminal in a new tab
- **VNC**: `viewer coming in a later RM release`
- **FTP**: `coming in RM4` (parked)

Several sessions can stay open at once. Switching tabs keeps each session alive. Re-tapping a connection focuses its existing tab. Closing a tab (or leaving the page) while an SFTP transfer is running asks you to confirm. The **Connections** tab is always first and cannot be closed. On a phone the tab strip scrolls sideways.

Remote is standalone. It does not open the old SSH or VNC apps, and it does not import their saved hosts or host keys. It keeps its own copies of the terminal and SSH libraries in `vendor/`. VNC and WebDAV will come in later releases. FTP, RDP, X2Go, WWW, EXEC and SPICE are parked.

The protocol picker defaults to SFTP. Changing the protocol fills in port 22, 5900, 22 or 21 unless you already edited the port. An optional **Start folder** on an SFTP connection is sent as the relay `root` (leave it empty for the account home).

The optional relay field accepts `ws://` and `wss://`. A bare host becomes `wss://` on https pages and `ws://` on http pages. An https page warns if you enter `ws://`. SSH uses the relay on port **8022**. SFTP uses the relay on port **8023**.

Connections are stored in this browser only, under localStorage key `remote-conns-v1`. Accepted SSH host-key fingerprints are stored under `remote-known-hosts-v1`. The terminal font size is stored under `remote-ssh-font-v1`.

## SSH terminal

The SSH encryption runs in this page. The relay only forwards encrypted bytes: it never sees your password or what you type.

**Run the relay only on your own machine, LAN or VPN. Do not forward port 8022 on a router.**

```
pip install websockify
cd apps/connectivity/ssh/relay
# edit allowlist.txt: one host:port per line (a bare host means port 22)
./start-relay.sh
```

On Windows use `start-relay.bat` or `.\start-relay.ps1`. The script prints `ws://<this-pc>:8022` (or `wss://` if you put `cert.pem` and `key.pem` next to it, for example from `tailscale cert`).

The app connects to `ws://relay:8022/?token=HOST:PORT`. The `token` query is the TCP target, not a secret. The relay refuses every host that is not in `allowlist.txt` (the file is re-read on every connection).

On first connect, Remote shows the server fingerprint and asks you to trust it. The fingerprint is saved, so you are only asked again if it changes (that warning can mean someone is intercepting the connection — replace the key only if you know the server was reinstalled).

In the terminal tab:

- The terminal fills the tab; a resize is sent to the server
- Copy the selection (it also copies as you select, or use Ctrl+Shift+C). Paste with Ctrl+Shift+V, a right-click, a long-press, or the overflow menu
- Font size +/− is in the overflow menu and is remembered on this device
- A special-keys bar for phones (Esc, Tab, sticky Ctrl, sticky Alt, arrows, `|`, `/`, `-`) starts open on a touch screen; on a desktop it is in the overflow menu
- Disconnect and Reconnect are in the overflow menu. Disconnect forgets the in-memory password, so Reconnect asks for it again. If the session drops on its own, Reconnect can reuse the password still held in memory for that tab
- The status line reports connected, disconnected, or a clear error: relay unreachable, host not in the allowlist, login failed, host key changed, or the session closed

SSH login is password-only in this release. The page must be https or localhost (the browser needs Web Crypto). Servers that offer only Ed25519 host keys, or only curve25519 key exchange, are not supported yet — enable an ECDSA or RSA host key (and a matching key exchange) on the server.

Relay URL examples:

- LAN or an http page: `ws://192.168.1.8:8022`
- https Hub: `wss://pc-main.<tailnet>.ts.net:8022`

## SFTP relay

A browser cannot speak SSH itself, so SFTP goes through the Hub SFTP relay: JSON over a WebSocket to `hub/relay/sftp_relay.py`, which logs in to the server for you.

**This relay logs in for you and sees the password and the files. Run it only on your own machine, LAN or VPN. Do not forward port 8023 on a router.**

```
pip install paramiko websockets
python3 hub/relay/sftp_relay.py
```

It prints the listen address and the **token** (created on the first run and kept in `hub/relay/sftp_token.txt`, or pass `--token …`, or set `HUB_SFTP_TOKEN`).

Allow the SFTP target in the same allowlist the SSH relay uses, `apps/connectivity/ssh/relay/allowlist.txt` (one `host:port` per line; a bare host means port 22). The file is re-read on every connection.

Relay URL examples:

- LAN or an http page: `ws://192.168.1.8:8023`
- https Hub: `wss://pc-main.<tailnet>.ts.net:8023` (put `cert.pem` and `key.pem` next to the relay, for example from `tailscale cert`)

## Transfers and file management

From an SFTP tab you can:

- Download a file (save picker in Chrome/Edge, otherwise a normal browser download), with a progress bar
- Download a whole folder (Chrome/Edge folder picker), with overall progress and Cancel
- Upload files with the Upload button or by dragging them onto the list (folders can be dropped too). Existing names are confirmed before overwrite (Overwrite, Skip, Overwrite all)
- Rename, delete (folders are deleted recursively after confirm), and create a new folder, from one overflow menu on each row plus a small toolbar

On a wide screen (about 900px and up) you can also **Open local folder**. The left pane is that folder on this device; the right pane is the server. You can upload the local selection or download the selected server item into it. Phones stay on a single pane.

Each file is sent or received as **one** message (the relay has no chunked transfer). The open reply includes `max` (default 100 MB, `--max-mb`). A file larger than that is refused with a clear message and is skipped in a folder transfer. Cancel stops further files; the file already in flight may still finish.

If something goes wrong, the app says so clearly: relay unreachable, wrong token, login failed, host not in the allowlist, or file too large. Those messages point back here.
