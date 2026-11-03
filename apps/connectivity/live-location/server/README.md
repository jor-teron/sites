# Live Location history server (LL2, optional)

A small always-on Node program that joins **one private Live Location group** (the same 5-digit code as the app)
as a member that never shares a position of its own. It records every position it hears into SQLite and, when a
device comes back online, sends it the points it missed, so trails fill in. Without it the app still keeps its own
history on each device (IndexedDB).

Good homes: an old PC, a Raspberry Pi 3/4/5, the Debian laptop. Uses about 100 MB RAM (measured ~95 MB RSS on x64 with Node 24) and almost no CPU when idle.

## What it needs
- **Node 22.13 or newer** (built-in `node:sqlite`). On older Node, also run `npm i better-sqlite3` (needs build tools on armv7).
- Internet: it uses the same PeerJS cloud (`0.peerjs.com`) and WebRTC as the app (`node-datachannel`, prebuilt for x64, arm64 and armv7).

## Install (Debian 12 / Raspberry Pi OS)
```sh
# Node 22 (NodeSource); skip if `node -v` already says v22.13+
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

git clone https://github.com/jor-teron/sites.git ~/sites      # or copy just this folder
cd ~/sites/apps/connectivity/live-location/server
npm install --omit=dev
```

## Run
```sh
node ll_server.js --code 12345                 # your private Hub mesh code (never the public 00000)
node ll_server.js --code 12345 --db ~/ll-history.db --days 30 --name "Home server"
```
Options (or env): `--code` (`LL_CODE`), `--db` (`LL_DB`, default `./ll-history.db`), `--days` 1–365 (`LL_DAYS`, default 30),
`--name` (`LL_NAME`), `--quiet` (`LL_QUIET`, no per-point log). A self-hosted PeerJS server: `--peer-host h --peer-port 443 --peer-path / --peer-key peerjs [--peer-insecure]`.

The app shows **History server online** (status line + a small chip on the map) while it is in the group.

## Run at boot (systemd)
Edit `ll-history.service` (User, WorkingDirectory, `--code`), then:
```sh
sudo cp ll-history.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now ll-history
journalctl -u ll-history -f
```

## How it works
- Same lobby protocol as `../ll_peer.js` (`jtsites-<code>-ll-0`); if nobody holds the lobby it takes it, which makes the group steadier.
- Live `{k:'pos'}` → table `pts(k, at, lat, lon, acc, rx)`, key `(k, at)`; same throttle as the app (≥ 15 m or ≥ 60 s).
  `rx` = when the server received it. `who(k, n, at, lat, lon)` = newest point and name per member.
- `{k:'hreq', since, from}` → `{k:'hist', pts, names, part, parts, done, now}` in parts of 300; `since`/`now` are the server's clock (`rx`), so late uploads reach everyone and device clocks don't matter.
- `{k:'hput', dev, pts}` → a device uploads its own points the server missed (when the server was down). Duplicates are ignored.
- Points older than `--days` are deleted hourly. Stop: Ctrl+C / `systemctl stop` (clean shutdown).

Privacy: anyone with the private code can ask for the group's history, the same trust as the live map. Use a code only your devices know.
Delete everything: stop the service and remove the `.db` file (plus `-wal` / `-shm`).
