# Pooh Chat (PC2)

The group lobby chat. Everyone on Public **00000** is in one room; a private 5-digit Hub code is a private room.

## Why
Jor wants Pooh Chat to be the public group lobby chat, with a separate private one-to-one **Messages** app coming later
(Connectivity). The work is split with Hub Main Bot: **H84** (his) moves the Hub's own chat (SharedChat, the 🐻 bubble)
onto HubMesh broadcast; **PC1/PC2** (this app) handle the app side. No extra encryption: it's a public lobby, and
WebRTC data channels are already encrypted in transit.

## PC1 — transport (on the Hub mesh; merges together with / after H84)
- Depends on Hub Main Bot's **H84** `shared/link/hub_mesh.js` (`HubMesh.broadcast` / `onMsg` / `room` / `linked`,
  channel `chat` allowed on public 00000) and H84's `link_chat.js` (room tag). **Must merge with or after H84.**
- **Room code:** `#code=` / `?hub=` (5 digits only; 4-digit codes are rejected) → the Hub's private mesh
  (`parent.HubMeshLink.isPrivate()/privateCode()`) → `SharedLink.LOBBY` (self/parent/top) → `00000`.
- **Transport** (`PoohCore.mode`, checked once at boot, same-origin try/catch):
  1. `relay`: `parent.SharedChat.send` exists (hub.html). Release-4 relay unchanged (`{sharedLink:'ready'}`,
     `{sharedLink:'chat', text}`, repaint from `shared-chat-history`). H84 makes the Hub carry it over the mesh.
  2. `parent`: `parent.HubMesh.broadcast/onMsg` exist but no relay (e.g. `/phone.html`). Uses the parent's mesh;
     never starts a second HubMesh (same device id would clash). The room is the parent's mesh room.
     `old`: the parent has a HubMesh from before H84: no transport, a notice only.
  3. `own`: standalone, `HubMesh.start(code)` (lobby `jtsites-<code>-mesh-0`, peers `jtsites-<code>-mesh-<deviceId>`).
- Send: `HubMesh.broadcast({t:'chat', type:'chat', id, from, name, text, ts, room})`, where `from` =
  `SharedLinkDevices.id()`. On `{ok:false, reason}` (stopped/type/public/shape/size/rate) a toast says why; the
  message stays in local history. Receive: `HubMesh.onMsg('chat', fn(data, fromDeviceId))` → `SharedChat.add`.
- History = SharedChat (`shared-chat-history`, last 200, dedupe by id), the same store the Hub uses.
- No backfill for late joiners (H84 has none); Hub Main Bot may add a Hub `chat-sync` channel later.
- Own mode in a host: the Hub's private mesh is re-checked every 5 s and followed; while typing, a **Switch to / Back
  to Public** button in the top bar (in-flow, not fixed) offers it. A code from the URL or Settings stays put.

## PC2 — cleaner screen
- Top bar: 🍯, connection dot (green online / amber connecting / grey offline, tooltip) + name once, a room chip
  (`Public` / `Private room` · member count, tap = who's here), ⚙️ Settings.
- Bubbles: mine right (honey), others left; name only when the sender changes; small time. Empty: "No messages yet. Say hi!".
- Settings sheet (in-app): This device · Rename, Hub code · Change (5-digit, in-app dialog).
- 🟢 WhatsApp share (tap text, long-press files) and ↗ per message kept. Light + dark (Hub theme, else device).

## Files
`pooh-chat.html`, `pooh-chat.css`, `pooh-chat-core.js` (pure logic, node-testable), `pooh-chat-ui.js` (render, sheet, notify), `pooh-chat.js` (boot, modes, composer),
`vendor/jsQR.js` (kept, unlinked).

## Testing
Syntax + smoke, plus a node harness: code order, the three modes (+ old), from = device id, H84 chatOk shape,
broadcast failure toast, dedupe, 200 cap, bubble grouping, dot.

## Legacy code notes
- Release 4 `pooh-chat.js` and `pooh-chat-ui.js` are kept as `//` comments at the end of each file; release-4 CSS as a
  comment block at the end of `pooh-chat.css`; the old top bar as an HTML comment.
- Removed in PC1: 4-digit Join dialog + Scan QR (`shared/link/link_scan.js`, `vendor/jsQR.js` now unlinked),
  standalone `SharedLink.join('jtsites-' + code)` with `bcast:true` through the Hub, saved `shared-link-join-code`.
- Removed in PC2: "Connected · code" status line, ✏️ and "Join Hub" bar buttons (rename moved to Settings),
  name + time on every bubble.
- PC1 first build (H84 rework): `pooh-chat-peer.js` (own `jtsites-<code>-pooh-*` lobby, `hi/roster/msg/sync`, last-50
  backfill) was deleted, never merged; its boot code is kept as `//` comments in `pooh-chat.js`, and
  `PoohCore.merge/backfill` stay for reference. The separate `pooh-chat-history-<code>` store is gone.
