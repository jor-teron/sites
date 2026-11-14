# VNC (VNC1)

Remote desktop in the browser using noVNC (v1.7.0, bundled in `vendor/novnc/`, MPL-2.0).
A browser can't open raw TCP, so it reuses the **SSH app relay** (`../ssh/relay/`, websockify + `allowlist.txt`).
The page connects to `wss://relay:8022/?token=HOST:PORT`. No relay code change was needed.

## 1. Run a VNC server
- **Linux (existing desktop):** `sudo apt install x11vnc` then `x11vnc -display :0 -forever -shared -rfbauth ~/.vnc/passwd` (make the password with `x11vnc -storepasswd`).
- **Linux (new virtual desktop):** `sudo apt install tigervnc-standalone-server`, `vncpasswd`, then `vncserver :1 -localhost no` (port 5901).
- **Windows:** install TightVNC Server, set a password in its settings; it listens on 5900.

## 2. Allow the target in the relay
Add a line to `apps/connectivity/ssh/relay/allowlist.txt` **with the port** (a bare host means port 22):
```
127.0.0.1:5900
192.168.1.20:5900
```
The file is re-read on every connection.

## 3. Run the relay on pc-main (Tailscale)
`cd apps/connectivity/ssh/relay && ./start-relay.sh` (Windows: `start-relay.bat`). Listens on port 8022.
In the app add a host: Relay `wss://pc-main.<tailnet>.ts.net:8022` (or `ws://100.x.y.z:8022` when the page itself is served over http), VNC host `127.0.0.1`, port `5900`.

## 4. https needs wss://
The live site is https, so the browser only allows a `wss://` relay. Put `cert.pem` and `key.pem` next to the start script
(e.g. from `tailscale cert pc-main.<tailnet>.ts.net`) – see `../ssh/relay/README.md`.

## Using it
Tap ☰ at the top for: Ctrl-Alt-Del, Keyboard (phones), Send clipboard, Scale fit / 1:1, View only, Fullscreen, Disconnect.
Touch: tap = click, two-finger drag = scroll (noVNC defaults). Deep link: `vnc.html#host=<name>`.

IC9c: icon redrawn colourful, no tile; old icon kept as vnc_icon_before_IC9c.svg
