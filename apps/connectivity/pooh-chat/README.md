# Pooh Chat (release 4)

The built-in group chat on the one Hub link (`shared/link`).

## Behaviour
- Inside the Hub: uses the Hub's link (`{sharedLink:'chat', text}`); history is the Hub's.
- Standalone (phone): joins the Hub with `#code=` / `?hub=` in the URL, the saved code (if it connected before), or the Join dialog (4-digit code + Scan QR).
- Every message carries the device name and time. Hub relays to all connected devices.
- History: last 200 messages per device (`shared-chat-history`), survives reload.
- 🟢 tap: share typed text (or the last message) to WhatsApp (`wa.me`). Long-press / Shift+click: pick files and share via the phone share sheet. ↗ on a message shares that message.
- Hub header 🐻 bubble: last 20 messages, quick reply, "Full chat"; one quiet toast for new messages.

## Files
`pooh-chat.html`, `pooh-chat.css` (WebRTC Chat neon + Pooh honey), `pooh-chat-ui.js` (render), `pooh-chat.js` (boot, roles, composer), `vendor/jsQR.js`.

## Testing
Open the Hub, scan its QR with Pooh Chat on two phones, chat; reload a phone → it rejoins and keeps history.

## Limits
Text only in chat (files go through File Drop). No direct device-to-device link yet (mesh is later).
