# Intercom — IC2

Live, tap-to-talk audio between devices on the same Hub Connect Code (Connectivity → Chat). Talk to everyone at once or pick one device.

- **Code:** `#code=1234` / `?hub=` (QR), the Hub's `{sharedLink:'hello'}` after `{sharedLink:'ready', app:'intercom'}` inside the Hub, `parent.__hubRemote.code`, `jtsites-hub-ctrl-code` / `shared-link-join-code`, the last code (`intercom-last-code`), else the Code dialog.
- **Peers (own, never the Hub's):** `jtsites-<code>-intercom-<random>` per device; lobby `jtsites-<code>-intercom-0` is claimed by the first device and keeps the roster (`hi {id,name,dnd}` → `roster`), relays `{t:'all'}` / `{t:'to'}` signals. If the lobby goes, a remaining device claims it (random 0.3–1.8 s). PeerJS from `SharedLink.PEERJS_URL` when loaded, else the same pinned URL (peerjs 1.5.4).
- **Talk:** Talk button (right) → `getUserMedia({audio})` (echo cancel, noise suppression, AGC) → one audio-only MediaConnection per target with metadata `{kind:'talk', sid, all, name}` + `{t:'talk', on:true}`. Tap again, or hold > 0.5 s and let go, or 2 min max → `{t:'talk', on:false}` and calls close; the mic is released.
- **Hear:** incoming talk calls are answered receive-only; audio stays muted for a two-note chime (~0.45 s, can be turned off), then plays at the chosen volume. Banner: "<name> is talking · to everyone / to you only" with **Reply** (talks straight back to that device; both directions are live = two-way). Several talkers are mixed.
- **Do Not Disturb:** shown to everyone (🌙 in the list, skipped by "Everyone"); a talk that still arrives is closed and the talker gets `{t:'dnd'}` → "did not hear you".
- **Files:** `intercom_save.js` (the one save module: `intercom-settings-v1` `{name, theme, dnd, volume, chime, target, video, facing, did, autoAnswer, trusted, keys}` + `intercom-last-code`, theme), `intercom_peer.js` (presence), `intercom_talk.js` (mic, calls, chime, volume, DND), `intercom_app.js` (UI, swipe, dialogs).
- Screens: Talk (device list + Talk / DND / volume on the right) and Settings (name, Hub code, chime, DND, volume, theme, About). Swipe 75 px, wrap-around. Inside the Hub, a hidden page also shows `window.top.HubNotify.notice`.

## IC2 — video, camera flip, trusted auto-answer

- **Video toggle (📹, right):** off by default (saved). With video on, a talk opens camera + mic and sends audio+video calls (metadata `video:true`). Turning the camera off mid-talk uses `replaceTrack(null)` + `{t:'vid', on:false}` and releases the camera; on again replaces the track back. Turning video on during a voice-only talk restarts it with video (`cont`). A red "camera on · everyone can see you / <name> is watching" bar shows whenever the camera is live; the tab title shows 🔴.
- **Flip (front/back):** shown only while video is on; swaps `facingMode` user/environment (saved as `facing`), toast if the device has only one camera.
- **Receiving video:** the caller's picture shows at once while audio stays muted during the chime. Banner adds **📹 Two-way** (talk back with your camera) next to Reply. Stage: other side big, you small; camera-off shows a placeholder.
- **Trusted devices + auto-answer (Settings):** each device gets a lasting random id (`did`). Trusting an online device makes a 32-hex token, saved in `trusted` and sent to it (`{t:'trust'}`, re-sent when it comes back); that device stores it in `keys` and gets a **📹 View** button. A view request `{t:'view', did, token}` is accepted only when Auto-answer is on (default off), the device and token match, DND is off and nobody else is viewing; otherwise `{t:'viewno', why:'off'|'untrusted'|'dnd'|'busy'}`. **DND always wins** and also stops a running view. A view has no 2-minute limit; it ends on Stop (either side), untrust (`{t:'untrust'}`), DND, or the viewer leaving. The viewer hears at once (no chime) and gets Two-way / Talk back / Stop.
- IC1 voice talks still work unchanged between IC1 and IC2 devices.

## IC4 — Public 0000 by default

- **Code choice:** `#code=` / `?hub=` / `join=` in the URL wins (and is not changed later). Inside the Hub: if `parent.HubMeshLink.isPrivate()` → `privateCode()`, else **0000 (Public)**. The Hub's own Connect Code (`{sharedLink:'hello'}`, `__hubRemote.code`, `jtsites-hub-ctrl-code`, `shared-link-join-code`) is used only in an older Hub without `HubMeshLink`. Standalone: last code, else 0000 (no code dialog at start).
- **Following the Hub:** every 5 s Intercom re-reads `HubMeshLink` (read-only). If the Hub joined or left a private mesh and nobody is talking, it switches by itself with a toast; during a talk it only shows a **Switch to <code>** / **Back to Public** button at the top.
- A code picked with Code/Change (or Public) holds for the session; the default logic never overrides it. IC3 Accept/Decline on 0000 is unchanged.

## Legacy code notes

- IC2/IC3 `localCode()` + `boot()` (Hub's own Connect Code first, code dialog when none) are kept as comments in `intercom_app.js` above the IC4 code choice.
