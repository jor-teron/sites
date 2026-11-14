# Torrent (TR3–TR5)

Browser torrent client for Hub Connectivity. Uses **WebTorrent 2.8.5**
(vendored, no CDN) so traffic stays peer-to-peer in the tab.

## Features

### TR1+TR2 (base)
- Paste a **magnet** / info-hash, or open / drop a **.torrent**
- Progress card: size, speeds, peers, ETA
- **Choose folder** (Chrome / Edge): stream finished files to disk with
  collision-safe names; other browsers use normal Downloads

### TR3 — multi-torrent
- Several torrents in a list
- At most **2 active downloads**; extras stay **queued**
- Pause / Resume / Remove per card (remove never deletes folder files)
- List remembered in `localStorage` and restored **paused** after reload

### TR4 — files + player
- Per-torrent file checkboxes (`file.select` / `file.deselect`)
- In-page **video/audio** player: prefers WebTorrent `streamTo` via a
  **service worker scoped to this app folder**
  (`vendor/webtorrent/sw.min.js`); falls back to a blob URL
- “May not play” note for MKV / HEVC and similar

### TR5 — seeding & limits
- **Seed when done** toggle per torrent
- Global ↑ / ↓ speed limits (KB/s) via `throttleUpload` / `throttleDownload`
- Ratio / uploaded on each card; clearer 30s no-peer hint

## Files

| File | Role |
|------|------|
| `tr_helpers.js` | Pure helpers (magnet, queue, throttle, media) |
| `tr_store.js` | localStorage persist |
| `tr_save.js` | Folder picker + streamed writes |
| `tr_client.js` | Multi-torrent WebTorrent wrapper |
| `tr_player.js` | SW registration + playback |
| `tr_ui.js` / `tr_main.js` | UI + wiring |
| `vendor/webtorrent/` | `webtorrent.min.js`, `sw.min.js`, LICENSE |

## Limits

- WebRTC / WebTorrent peers only — many public magnets stay at 0 peers
- Folder save needs File System Access; player SW needs a secure context
- Seeding lasts only while the tab is open

## Legacy
IC9a: colourful hub icon added at torrent_icon.png; there was no previous icon file.
