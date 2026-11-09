# Torrent — notes

## TR1+TR2

- WebTorrent **2.8.5** ESM bundle in `vendor/webtorrent/webtorrent.min.js` (~213 KB).
- `tr_main.js` is the only module script; it imports WebTorrent and uses `window.TR*`.
- Finished files are copied out with an async iterator → `createWritable` (or `<a download>`).

## TR3 — multi-torrent + queue

- `TRHelpers.reconcileQueue(entries, 2)` decides `active` / `queued` / `paused` / `done`.
- Active means “allowed to download now”; queued torrents stay `torrent.pause()`’d.
- When one finishes or is paused, the next queued item is resumed.
- Persistence: `TRStore` → `localStorage` key `torrent.tr.state.v1`. On restore every
  torrent is re-added **paused** until the user hits Resume (avoids surprise bandwidth).

## TR4 — file pick + streaming

- Selection uses WebTorrent `file.select()` / `file.deselect()`.
- Playback prefers `client.createServer({ controller: serviceWorkerRegistration })`
  then `file.streamTo(video)`.
- Service worker: `vendor/webtorrent/sw.min.js` registered with **`scope: './'`** so it
  only controls `apps/connectivity/torrent/` — never the Hub root `sw.js`.
- Fallback: `file.blob()` → object URL (uses more memory).
- MKV / HEVC / AVI etc. get a “may not play” note; browsers often lack demuxers.

## TR5 — seed + throttle

- Per-torrent “Seed when done”: after `done`, `pause()` if seed is off, else leave running.
- Settings panel stores KB/s; `parseThrottleKBs` maps empty/unlimited → `-1`, else `KB * 1024`
  into `client.throttleUpload` / `throttleDownload`.
- No-peers hint after ~30s explains WebRTC-only reachability and suggests WebTorrent-seeded
  magnets or web seeds.
