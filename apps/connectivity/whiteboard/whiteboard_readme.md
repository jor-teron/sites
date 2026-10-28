# Whiteboard — WB1

Draw together live with every device on the same Hub Connect Code (Connectivity → Share).

- **Code:** `#code=1234` / `?hub=` (QR), the Hub's `{sharedLink:'hello'}` inside the Hub, `parent.__hubRemote.code`, `jtsites-hub-ctrl-code` / `shared-link-join-code`, the last code (`whiteboard-last-code`), else the Code dialog. Without a code it still works as a local board.
- **Peers (own, never the Hub's; data connections only):** `jtsites-<code>-wb-<random>` per device; lobby `jtsites-<code>-wb-0` is claimed by the first device, keeps the roster (`hi` → `roster`), relays board messages (`all` → every other device) and sends a new device the full board (`{k:'state', its, clr}`). If the lobby goes, a remaining device claims it and its board becomes the source.
- **Sync messages:** live strokes `lb` (begin) / `lp` (points, batched every 40 ms) / `ls` (shape points) / `le` (end) / `lx` (abort); committed `add` / `del` / `clear`; cursors `cur` (every 70 ms). Items are sorted by (ts, id) so stacking matches on every device. Ops made while offline are replayed after the lobby's state arrives; an empty lobby board is seeded from ours.
- **Files:** `whiteboard_store.js` (settings `whiteboard-settings-v1`, theme), `whiteboard_peer.js` (presence + relay), `whiteboard_board.js` (model, render, input, undo/redo), `whiteboard_save.js` (the one save module: IndexedDB autosave `whiteboard-v1`/`boards` by code, PNG export), `whiteboard_app.js` (UI, sync glue, dialogs, swipe).
- **Input:** mouse, touch, stylus (pointer events). Two fingers pan + pinch; Hand tool / middle button / Space+drag pan; wheel zooms (Shift+wheel pans). Once a stylus is seen, single fingers pan (palm rejection). Keys: P H E L R O A T, 0 fit, +/−, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y.
