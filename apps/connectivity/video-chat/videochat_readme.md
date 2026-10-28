# Video Chat — VC2

Video + audio calls between devices on the same Hub Connect Code (Connectivity → Chat): one-to-one as in VC1, or a group of up to 4, with screen sharing from computers.

- **Code:** `#code=1234` / `?hub=` (QR), the Hub's `{sharedLink:'hello'}` inside the Hub, `parent.__hubRemote.code`, `jtsites-hub-ctrl-code` / `shared-link-join-code`, the last code (`videochat-last-code`), else the Code dialog.
- **Peers (own, never the Hub's):** `jtsites-<code>-vc-<random>` per device; lobby `jtsites-<code>-vc-0` is claimed by the first device and keeps the roster (`hi` → `roster`) and relays signals. If the lobby goes, a remaining device claims it. PeerJS from `SharedLink.PEERJS_URL` when loaded, else the same pinned URL (peerjs 1.5.4).
- **Group calls (mesh, max 4 incl. you):** every pair has its own MediaConnection.
  - Invite = `VCPeer.call(id, cam, {kind:'invite', room, members})` + `{t:'ring'}`. The ring screen shows "Already in: …". Start a call from the device list; add people from the call's ＋ sheet (Invite / Ringing… Cancel / In the call).
  - On Accept the newcomer calls every listed member with `{kind:'join', room}`; members auto-answer joins for their room while there is space (else `{t:'full'}`).
  - `{t:'st', mute, cam, share, ids}` goes to each peer on connect and on every change; a member that hears of someone it has no call with dials them if its peer id sorts lower (after 3 s), and a double dial keeps the lower id's call.
  - Other signals: `decline`, `busy`, `cancel` (invite withdrawn / no answer after 45 s), `end` (leave). Leaving the roster for 4 s or ICE `failed` drops a person; the call ends when nobody is left.
  - A VC1 device can still call / be called 1:1 (no `kind` = plain invite).
- **Layout:** 1:1 = remote full screen + draggable self picture-in-picture (as VC1). 3–4 people = grid of tiles (2×2; 3 = one big + two). Tiles show the name, 🔇 / 📷✕ / 🖥️ and Ringing…/Connecting…; the active speaker (WebAudio RMS of each stream, 200 ms, 1.5 s hold) gets a green outline.
- **Screen share (computers):** 🖥️ → `getDisplayMedia` (≤1080p, 15 fps) → `RTCRtpSender.replaceTrack` on every peer connection's video sender; people who join later get it too. The sharer's tile goes big (contain) with cameras small beside it (below on portrait). Stop, or the browser's own "Stop sharing", puts the camera track back. Phones don't show the button but watch the stage.
- **Files:** `videochat_store.js` (settings `videochat-settings-v1`, theme), `videochat_peer.js` (presence), `videochat_call.js` (media, ringtone, group state, screen share, speaker), `videochat_app.js` (UI, tiles, swipe, dialogs).
- Screens: Call (device list) and Settings (name, camera, mic, theme, About). Swipe 75 px, disabled during a call. Incoming calls also go to `window.top.HubNotify` when present.
