<!-- Remote — README.md: how to use the RM7 connections list, tabs, SFTP and WebDAV browse and transfers, the SSH terminal, and the VNC viewer. -->
# Remote (RM7)

One saved-connections list for SSH, VNC, SFTP, WebDAV and FTP, with Remmina-style tabs. RM4 added the VNC viewer on top of SFTP, WebDAV (RM5), and the SSH terminal (RM6). No passwords are stored. A relay token (SFTP only) is stored only if you save it on the connection or tick **Remember this token** when you connect (off by default).

## RM7

Saved-connection actions work inside a Hub window.

- **Delete** asks with an in-app card (`Delete "Name"?`, Delete and Cancel). The same kind of card is used for closing a tab while a transfer is running, and for deleting a file or folder. The page does not call `alert`, `confirm` or `prompt` (a Hub window blocks those, so Delete used to do nothing).
- The **⋯** menu stays inside the visible window. It opens under the button and flips upward when the window is too short to show it below. It sits above the tabs and above open dialogs, and it works with a mouse or a finger.
- **Right-click** a connection row, or **press and hold** it for about half a second, to open that same menu.
- Each open session (SFTP, WebDAV, SSH, VNC) has an **Edit** button in its own bar. It opens the connection editor, so the host, user, relay and token can be changed without going back to the list. The password is still asked when you connect and is not stored.
- The top of the page is one bar: the title, the **RM7** tag, the session tabs, and **Add**. The Back link is gone. When several sessions are open the tabs scroll sideways, including on a narrow phone.

The notes below are the RM4, RM5 and RM6 guide. They still apply.

Tapping a row:

- **SFTP** asks for the password (and relay token) and opens a folder browser in a new tab
- **SSH** asks for the password and opens a terminal in a new tab
- **WebDAV** asks for the password and opens the same folder browser (no relay; the server must allow CORS)
- **VNC** asks for the password and opens a desktop viewer in a new tab
- **FTP**: `parked`

Several sessions can stay open at once. Switching tabs keeps each session alive. Re-tapping a connection focuses its existing tab. Closing a tab (or leaving the page) while a transfer is running asks you to confirm. The **Connections** tab is always first and cannot be closed. On a phone the tab strip scrolls sideways.

Remote is standalone. It does not open the old SSH or VNC apps, and it does not import their saved hosts or host keys. It keeps its own copies of the terminal, SSH, and noVNC libraries in `vendor/`. FTP, RDP, X2Go, WWW, EXEC and SPICE are parked.

The protocol picker defaults to SFTP. Changing the protocol fills in port 22, 5900, 22, 443 or 21 unless you already edited the port. A WebDAV URL that starts with `http://` uses port 80. An optional **Start folder** on an SFTP or WebDAV connection is the folder to open first (leave it empty for the SFTP account home, or the WebDAV base URL).

The optional relay field accepts `ws://` and `wss://`. A bare host becomes `wss://` on https pages and `ws://` on http pages. An https page warns if you enter `ws://`. SSH and VNC use the relay on port **8022**. SFTP uses the relay on port **8023**.

Connections are stored in this browser only, under localStorage key `remote-conns-v1` (WebDAV rows also keep their base `url`; VNC rows keep optional `quality` and `compression`). Accepted SSH host-key fingerprints are stored under `remote-known-hosts-v1`. The terminal font size is stored under `remote-ssh-font-v1`.


## WebDAV

The browser talks to the WebDAV server directly with `fetch`. There is no relay. The password is sent as HTTP Basic authentication, so use **https**. An https Hub page cannot call an `http://` server (the browser blocks mixed content).

**The server must allow this page with CORS**, including a preflight `OPTIONS` for `PROPFIND`, `GET`, `PUT`, `MKCOL`, `MOVE` and `DELETE`, and the `Authorization`, `Depth`, `Destination`, `Overwrite` and `Content-Type` request headers.

On first connect, Remote lists the base URL (plus an optional start folder) with `PROPFIND`. The folder tab is the same one SFTP uses: browse, download, upload (with overwrite choices), rename, delete (folders are recursive), and new folder. On a wide screen you can also open a local folder.

If something goes wrong, the app says so clearly: can't reach the server (CORS or the network), login failed (401), access denied (403), not found (404), method not allowed (405), or the server is out of storage (507).

### CORS examples

The origin must be the page that serves Remote, for example `https://jor-teron.github.io`. Using `*` is simpler on a LAN, but is a bad idea on a server that uses a password.

**rclone** (the flag is `--allow-origin`, not `--cors`):

```
rclone serve webdav /path/to/files --addr :8080 --user me --pass secret --allow-origin https://jor-teron.github.io
```

On a LAN http Hub you can pass `--allow-origin http://192.168.1.8:port` (the origin of the Hub page). `--allow-origin *` allows any origin; rclone itself warns that this is a risk on an authenticated server.

**nginx** (needs the DAV module, and [nginx-dav-ext-module](https://github.com/arut/nginx-dav-ext-module) for PROPFIND; adjust the origin and path):

```
location /dav/ {
  dav_methods PUT DELETE MKCOL COPY MOVE;
  dav_ext_methods PROPFIND OPTIONS;
  dav_access user:rw group:rw;
  autoindex on;
  if ($request_method = OPTIONS) {
    add_header Access-Control-Allow-Origin "https://jor-teron.github.io";
    add_header Access-Control-Allow-Methods "GET, PUT, OPTIONS, DELETE, PROPFIND, MKCOL, MOVE, HEAD";
    add_header Access-Control-Allow-Headers "Authorization, Content-Type, Depth, Destination, Overwrite";
    add_header Access-Control-Max-Age 86400;
    add_header Content-Length 0;
    return 204;
  }
  add_header Access-Control-Allow-Origin "https://jor-teron.github.io" always;
  add_header Access-Control-Allow-Methods "GET, PUT, OPTIONS, DELETE, PROPFIND, MKCOL, MOVE, HEAD" always;
  add_header Access-Control-Allow-Headers "Authorization, Content-Type, Depth, Destination, Overwrite" always;
}
```

**Apache** (needs `mod_dav`, `mod_dav_fs` and `mod_headers`):

```
Dav On
Header always set Access-Control-Allow-Origin "https://jor-teron.github.io"
Header always set Access-Control-Allow-Methods "GET, PUT, OPTIONS, DELETE, PROPFIND, MKCOL, MOVE, HEAD"
Header always set Access-Control-Allow-Headers "Authorization, Content-Type, Depth, Destination, Overwrite"
RewriteEngine On
RewriteCond %{REQUEST_METHOD} OPTIONS
RewriteRule ^(.*)$ $1 [R=204,L]
```


## VNC viewer

The VNC viewer uses this app's own copy of noVNC (v1.7.0, MPL-2.0, in `vendor/novnc/`). A browser cannot open raw TCP, so the session goes through the same **websockify relay on port 8022** that SSH uses (`apps/connectivity/ssh/relay`). The app connects to `ws://relay:8022/?token=HOST:PORT` (default port **5900**). The `token` query is the TCP target, not a secret. IPv6 hosts are sent as `[host]:port`.

**This relay forwards the VNC session as plain bytes. It can see the screen and, on most servers, the password. Run it only on your own machine, LAN or VPN. Do not forward port 8022 on a router.**

```
pip install websockify
cd apps/connectivity/ssh/relay
# edit allowlist.txt: one host:port per line (a bare host means port 22, so VNC needs the port)
#   127.0.0.1:5900
#   192.168.1.20:5900
./start-relay.sh
```

On Windows use `start-relay.bat` or `.\start-relay.ps1`. The script prints `ws://<this-pc>:8022` (or `wss://` if you put `cert.pem` and `key.pem` next to it, for example from `tailscale cert`). The allowlist file is re-read on every connection.

Run a VNC server on the target (examples):

- Linux, existing desktop: `x11vnc -display :0 -forever -shared -rfbauth ~/.vnc/passwd` (make the password with `x11vnc -storepasswd`)
- Linux, virtual desktop: `vncserver :1 -localhost no` (port 5901)
- Windows: TightVNC Server on port 5900

The password is asked in the connect sheet and is never stored. It is kept in memory for **Reconnect**. **Disconnect** forgets it, so Reconnect asks again. An https page cannot use a `ws://` relay — use `wss://`, or open the Hub over http on a LAN.

In the VNC tab:

- The desktop scales to fit the tab; the overflow menu toggles **Scale: fit** and **Scale: 1:1** (1:1 can pan)
- **View only** blocks sending pointer and keyboard
- **Ctrl+Alt+Del**, **Send clipboard** (a box appears if the browser blocks clipboard read), and **Fullscreen**
- **Keyboard** focuses a hidden input so a phone can type; the button is also shown in the toolbar on a touch screen
- Touch uses noVNC's gestures: tap = click, long-press = right-click, two-finger drag = scroll
- Slow-network settings are saved on the connection: **quality** 0–9 and **compression** 0–9 (noVNC `qualityLevel` / `compressionLevel`). **Low bandwidth** sets quality 0 and compression 9. You can also set them in the connection editor
- Disconnect and Reconnect are in the overflow menu. The status line reports connected, disconnected, or a clear error: relay unreachable, host not in the allowlist, login failed, or the session closed

Relay URL examples:

- LAN or an http page: `ws://192.168.1.8:8022`
- https Hub: `wss://pc-main.<tailnet>.ts.net:8022`

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

IC9c: colourful hub icon added at remote_icon.png; old icon kept as rm_icon_before_IC9c.svg
