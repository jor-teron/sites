# Video Chat — VC1

One-to-one video + audio calls between devices on the same Hub Connect Code (Connectivity → Chat).

- **Code:** `#code=1234` / `?hub=` (QR), the Hub's `{sharedLink:'hello'}` inside the Hub, `parent.__hubRemote.code`, `jtsites-hub-ctrl-code` / `shared-link-join-code`, the last code (`videochat-last-code`), else the Code dialog.
- **Peers (own, never the Hub's):** `jtsites-<code>-vc-<random>` per device; lobby `jtsites-<code>-vc-0` is claimed by the first device and keeps the roster (`hi` → `roster`), and relays call signals (`ring`, `decline`, `busy`, `end`). If the lobby goes, a remaining device claims it. PeerJS from `SharedLink.PEERJS_URL` when loaded, else the same pinned URL (peerjs 1.5.4).
- **Files:** `videochat_store.js` (settings `videochat-settings-v1`, theme), `videochat_peer.js` (presence), `videochat_call.js` (media, ringtone, call state), `videochat_app.js` (UI, swipe, dialogs).
- Screens: Call (device list) and Settings (name, camera, mic, theme, About). Swipe 75 px, disabled during a call.
- Incoming call also goes to `window.top.HubNotify` when present.
