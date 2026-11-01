# Messages (MS1)

## What and why
Private one-to-one text messages between devices, like SMS. Jor wants private messaging as an integral part of phone/;
Pooh Chat becomes the group lobby chat (over HubMesh, H84), Messages stays private.

## Behaviour
- You are addressed by your Hub number (SharedLinkDevices.code() / SharedLink.deviceCode(), 5 digits), the same number Telephone uses.
- Anyone on Public 00000 can message anyone; a private Hub code gives a private room.
- Code order (FC5): `#code=` (5 digits only; 4-digit codes are rejected) > Hub private mesh (parent.HubMeshLink) > SharedLink.LOBBY / 00000.
  Every 5 s it follows the Hub mesh when idle; otherwise an in-bar Switch to / Back to Public button appears.
- Transport: own PeerJS lobby `jtsites-<code>-msg-0` (first device holds the roster {t:'hi'} / {t:'roster'}, failover like Telephone),
  device peers `jtsites-<code>-msg-<random>`. Messages go over a direct DataConnection to the recipient's peer (WebRTC, already encrypted).
  Never via the lobby, a server or a third device. HubMesh is not used (public 00000 only allows the group 'chat' channel).
- Shapes: `{t:'msg', id, from (my number), name, text (1–2000), ts}`, receiver replies `{t:'ack', id}` → ✓✓ delivered. Dedupe by id.
- Recipient offline: the message is kept as "Not online — not sent" with Retry.
- History: localStorage `messages-history`, per conversation (500 max), 3000 total (oldest conversations trimmed). Settings: `messages-settings-v1`.
- Names: Telephone's saved contacts (`telephone-contacts-v1`, read-only) first, else the roster name.
- UI: name once with a connection dot (green online / amber connecting / grey offline, tooltip + aria-label); Settings sheet: name, my number, Hub code (Change), About.

## Files
index.html (no-flash redirect), messages.html, messages.css, messages_store.js (history, caps, code choice; pure),
messages_peer.js (lobby + direct links), messages_app.js (UI), messages_icon.png.

## Testing
MS1: syntax + smoke only (node --check, static checks, node harness with stubs). No browser or two-device test yet.

## Limits
Both devices must have Messages open. No offline queue, no notifications, no Hub DND, text only.

## Planned
- MS2: automatic offline queue (send when the person comes online), notifications via HubNotify / attention card, Hub Do Not Disturb.
- MS3: Telephone contacts sharing, photos and files.

## Legacy code notes
None yet.
