# SSH relay

A web page cannot open a TCP connection, so the SSH app talks to a tiny **WebSocket-to-TCP relay**
([websockify](https://github.com/novnc/websockify), LGPL-3.0, installed with pip, not vendored here).
The SSH encryption runs in the browser, so the relay only ever sees encrypted bytes: never your password
or what you type.

```
browser (SSH app) --ws/wss--> relay on your PC :8022 --tcp--> SSH server :22
```

## Start it

1. Install Python 3, then `pip install websockify` (Windows: `py -m pip install websockify`).
2. Edit `allowlist.txt`: one `host:port` per line for the machines you want to reach.
   The relay refuses every other target. The file is re-read on each connection.
3. Run the script on the PC (or an always-on machine such as a Raspberry Pi):
   - Windows: double-click `start-relay.bat` (or `.\start-relay.ps1 -Port 8022`)
   - Linux / macOS: `./start-relay.sh` (or `./start-relay.sh 0.0.0.0 8022`)
4. In the SSH app, set **Relay** to `ws://<PC address>:8022` (or `wss://` with TLS, below).

The scripts run:

```
websockify --token-plugin=ssh_allowlist.Allowlist --token-source=allowlist.txt 0.0.0.0:8022
```

The app connects to `ws://relay:8022/?token=HOST:PORT`; `ssh_allowlist.py` maps that to the target
only when it is in the allowlist.

## Keep it private

- **Only expose the relay on your home network (LAN) or a VPN** such as Tailscale or WireGuard.
  Never forward port 8022 on your router to the internet.
- On Windows allow it through the firewall for **Private** networks only.
- To listen on one interface only, pass its address, e.g. `./start-relay.sh 192.168.1.10` or
  your Tailscale address.
- Keep the allowlist short. Use SSH keys or strong passwords on the servers.

## wss:// (TLS)

When the SSH app is opened over **https** (for example the published site), browsers only allow
`wss://` relays. Put `cert.pem` and `key.pem` next to the scripts and they turn TLS on automatically.

- Easiest: a VPN name with a real certificate, e.g. `tailscale cert <machine>.<tailnet>.ts.net`
  (rename the files to `cert.pem` / `key.pem`), then use `wss://<machine>.<tailnet>.ts.net:8022`.
- Or [mkcert](https://github.com/FiloSottile/mkcert): `mkcert -install` and
  `mkcert -cert-file cert.pem -key-file key.pem 192.168.1.10 mypc.local`, and install the mkcert root
  on the phone too.
- A plain self-signed certificate works only after you open `https://<relay>:8022` once in the same
  browser and accept the warning.

When the SSH app is opened from `http://localhost` or a LAN `http://` address, plain `ws://` works.
