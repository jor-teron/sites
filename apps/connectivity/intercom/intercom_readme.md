# Intercom — IC1

Live, tap-to-talk audio between devices on the same Hub Connect Code (Connectivity → Chat). Talk to everyone at once or pick one device.

- **Code:** `#code=1234` / `?hub=` (QR), the Hub's `{sharedLink:'hello'}` after `{sharedLink:'ready', app:'intercom'}` inside the Hub, `parent.__hubRemote.code`, `jtsites-hub-ctrl-code` / `shared-link-join-code`, the last code (`intercom-last-code`), else the Code dialog.
- **Peers (own, never the Hub's):** `jtsites-<code>-intercom-<random>` per device; lobby `jtsites-<code>-intercom-0` is claimed by the first device and keeps the roster (`hi {id,name,dnd}` → `roster`), relays `{t:'all'}` / `{t:'to'}` signals. If the lobby goes, a remaining device claims it (random 0.3–1.8 s). PeerJS from `SharedLink.PEERJS_URL` when loaded, else the same pinned URL (peerjs 1.5.4).
- **Talk:** Talk button (right) → `getUserMedia({audio})` (echo cancel, noise suppression, AGC) → one audio-only MediaConnection per target with metadata `{kind:'talk', sid, all, name}` + `{t:'talk', on:true}`. Tap again, or hold > 0.5 s and let go, or 2 min max → `{t:'talk', on:false}` and calls close; the mic is released.
- **Hear:** incoming talk calls are answered receive-only; audio stays muted for a two-note chime (~0.45 s, can be turned off), then plays at the chosen volume. Banner: "<name> is talking · to everyone / to you only" with **Reply** (talks straight back to that device; both directions are live = two-way). Several talkers are mixed.
- **Do Not Disturb:** shown to everyone (🌙 in the list, skipped by "Everyone"); a talk that still arrives is closed and the talker gets `{t:'dnd'}` → "did not hear you".
- **Files:** `intercom_save.js` (the one save module: `intercom-settings-v1` `{name, theme, dnd, volume, chime, target}` + `intercom-last-code`, theme), `intercom_peer.js` (presence), `intercom_talk.js` (mic, calls, chime, volume, DND), `intercom_app.js` (UI, swipe, dialogs).
- Screens: Talk (device list + Talk / DND / volume on the right) and Settings (name, Hub code, chime, DND, volume, theme, About). Swipe 75 px, wrap-around. Inside the Hub, a hidden page also shows `window.top.HubNotify.notice`.
