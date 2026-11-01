# Pooh Chat (PC2)

The group lobby chat. Everyone on Public **00000** is in one room; a private 5-digit Hub code is a private room.

## Why
Jor wants Pooh Chat to be the public group lobby chat, with a separate private one-to-one **Messages** app coming later
(Connectivity). The work is split with Hub Main Bot: **H84** (his) moves the Hub's own chat (SharedChat, the 🐻 bubble)
onto HubMesh broadcast; **PC1/PC2** (this app) handle the app side. No extra encryption: it's a public lobby, and
WebRTC data channels are already encrypted in transit.

## PC1 — transport
- **Room code:** `#code=` / `?hub=` (5 digits only; 4-digit codes are rejected) → the Hub's private mesh
  (`parent.HubMeshLink.isPrivate()/privateCode()`) → `SharedLink.LOBBY` (self/parent/top) → `00000`.
- **Inside the Hub (relay mode):** detected once at boot by `PoohCore.hasRelay` = the parent has `SharedChat.send`
  (same-origin). Chosen over a ping handshake because it's synchronous and exactly matches "the Hub carries the chat".
  Protocol unchanged: `{sharedLink:'ready'}`, `{sharedLink:'chat', text}`, history = `shared-chat-history`
  (the Hub writes it). No second peer, so no duplicate messages.
- **Standalone, or a host without the relay (e.g. `/phone.html`):** own lobby peer (`pooh-chat-peer.js`, modeled on
  Intercom). Lobby id `jtsites-<code>-pooh-0`, members `jtsites-<code>-pooh-<random>`. Wire: `{t:'hi'}`,
  `{t:'roster'}`, `{t:'msg', m}`, `{t:'sync', list}` (backfill, last 50 each way on join).
  Message `m = {type:'chat', id, from (device id), name, text, ts}` (same as SharedChat). Dedupe by id.
  History `pooh-chat-history-<code>` (last 200), never touches `shared-chat-history`.
- In a host, the Hub's private mesh is re-checked every 5 s and followed; while typing, a **Switch to / Back to
  Public** button in the top bar (in-flow, not fixed) offers it. A code from the URL or Settings stays put.

## PC2 — cleaner screen
- Top bar: 🍯, connection dot (green online / amber connecting / grey offline, tooltip) + name once, a room chip
  (`Public` / `Private room` · member count, tap = who's here), ⚙️ Settings.
- Bubbles: mine right (honey), others left; name only when the sender changes; small time. Empty: "No messages yet. Say hi!".
- Settings sheet (in-app): This device · Rename, Hub code · Change (5-digit, in-app dialog).
- 🟢 WhatsApp share (tap text, long-press files) and ↗ per message kept. Light + dark (Hub theme, else device).

## Files
`pooh-chat.html`, `pooh-chat.css`, `pooh-chat-core.js` (pure logic, node-testable), `pooh-chat-peer.js`
(own lobby peer), `pooh-chat-ui.js` (render, sheet, notify), `pooh-chat.js` (boot, modes, composer),
`vendor/jsQR.js` (kept, unlinked).

## Testing
Syntax + smoke, plus a node harness for code order, relay detection, dedupe, 200 cap, backfill, bubble grouping, dot.

## Legacy code notes
- Release 4 `pooh-chat.js` and `pooh-chat-ui.js` are kept as `//` comments at the end of each file; release-4 CSS as a
  comment block at the end of `pooh-chat.css`; the old top bar as an HTML comment.
- Removed in PC1: 4-digit Join dialog + Scan QR (`shared/link/link_scan.js`, `vendor/jsQR.js` now unlinked),
  standalone `SharedLink.join('jtsites-' + code)` with `bcast:true` through the Hub, saved `shared-link-join-code`.
- Removed in PC2: "Connected · code" status line, ✏️ and "Join Hub" bar buttons (rename moved to Settings),
  name + time on every bubble.
