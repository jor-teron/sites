# Torrent — notes

## TR1+TR2 (this release)

- WebTorrent **2.8.5** browser ESM bundle in `vendor/webtorrent/webtorrent.min.js` (~213 KB).
  Loaded from `tr_main.js` as `import WebTorrent from './vendor/webtorrent/webtorrent.min.js'`.
- Classic scripts (`tr_helpers`, `tr_save`, `tr_client`, `tr_ui`) attach to `window`; the
  module entry wires them after WebTorrent loads.
- Default browser chunk store uses OPFS / memory inside WebTorrent. We still **copy**
  finished files out with an async iterator → `FileSystemWritableFileStream.write`, so a
  chosen folder gets real files with collision-safe names.
- `noPeers` / 30s timer: many public magnets will stick at 0 peers. That is expected.

## Planned

### TR3 — multi-torrent
Several torrents at once, pause / resume / remove, cap at 2 active, remember the list
after reload.

### TR4 — streaming + file pick
Play video / audio while downloading; choose which files inside a torrent to fetch.

### TR5 — seeding controls
Upload limit, stop seeding when done, clearer “no WebTorrent peers” guidance, maybe a
note about a desktop helper for full BitTorrent compatibility.
