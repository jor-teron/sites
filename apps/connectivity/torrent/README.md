# Torrent (TR1+TR2)

Browser torrent client for the Hub Connectivity section. Uses **WebTorrent**
(vendored, no CDN) so everything stays on-device.

## What it does

- Paste a **magnet** link or a raw **info-hash**, or open / drop a **.torrent** file
- One big download card: name, size, progress, ↓/↑ speed, peers, ETA, status
- After ~30s with 0 peers, shows a clear hint (browsers only reach WebTorrent / WebRTC peers)
- **Choose folder** (Chrome / Edge desktop): writes finished files into that folder,
  keeps subfolders, streams via `createWritable` (no giant in-memory Blob), never
  overwrites — adds ` (1)`, ` (2)`, …
- Other browsers: finished files go to the normal Downloads folder
- At most **one** active torrent; adding another asks to replace
- Client is destroyed on `pagehide`

## Files

| File | Role |
|------|------|
| `index.html` | App page |
| `tr_helpers.js` | Magnet / size / ETA / unique names |
| `tr_save.js` | Folder picker, IndexedDB handle, saves |
| `tr_client.js` | WebTorrent wrapper (one torrent) |
| `tr_ui.js` | Card + status DOM |
| `tr_main.js` | ESM entry (imports vendored WebTorrent) |
| `vendor/webtorrent/` | `webtorrent.min.js` + LICENSE + VERSION |

## Limits

- Not a full BitTorrent client: no TCP/UDP peers in the browser
- Folder save needs the File System Access API (hidden on unsupported browsers)
- Seeding only lasts while the tab is open (no controls yet — see TR5)
