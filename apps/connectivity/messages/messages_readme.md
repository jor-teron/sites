# Messages (MS3 · CX1)

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
- Recipient offline (MS2): the message is queued (🕓 Waiting) in `messages-history` and sent automatically when they appear in the roster (and every 20 s); ✓ Sent → ✓✓ Delivered on ack. Undelivered sends are retried; the receiver dedupes by id.
- History: localStorage `messages-history`, per conversation (500 max), 3000 total (oldest conversations trimmed). Settings: `messages-settings-v1`.
- Names: Telephone's saved contacts (`telephone-contacts-v1`, read-only) first, else the roster name.
- UI: name once with a connection dot (green online / amber connecting / grey offline, tooltip + aria-label); Settings sheet: name, my number, Hub code (Change), About.

## Files
index.html (no-flash redirect), messages.html, messages.css, messages_store.js (history, caps, code choice; pure),
messages_peer.js (lobby + direct links), messages_app.js (UI), messages_icon.png.

## Testing
MS1: syntax + smoke only (node --check, static checks, node harness with stubs). No browser or two-device test yet.

## Limits
Both devices must have Messages open (the queue waits until they do). Files only while both are online (queued in memory otherwise).

## Planned
- MS2: automatic offline queue (send when the person comes online), notifications via HubNotify / attention card, Hub Do Not Disturb.
- MS3: Telephone contacts sharing, photos and files.

## Legacy code notes
None yet.

## MS2
- Queue: st 'queued' | 'sent' | 'delivered' (MS1 'unsent' treated as queued). MSStore.pending().
- Alerts (messages_notify.js): page hidden → Hub card (top.HubNotify.notice) in the Hub, else browser Notification. Setting `messages-settings-v1`.notify (default on).
- Hub DND (TP7 pattern: parent.HubDnd, else 'sites-hub.dnd'): no alerts, messages still stored; 🌙 next to the name.
- In-app notices use a Hub card when inside the Hub, the small in-app notice only standalone.

## MS3
- Files (messages_files.js): 📎 next to Send, any type, 100 MB cap. Wire {t:'fmeta'} → 64 KB {t:'fchunk', i, d} (back-pressure on bufferedAmount) → {t:'fend'}; receiver {t:'ack', id}. Duplicate chunks / finished ids ignored.
  Bytes in memory (blob URLs) until Save; history keeps only the file entry + a ≤200 px JPEG thumbnail for images. Outgoing files not sent before the app closed show ⚠ "Not sent".
- Ticks: 🕓 waiting/sending, grey ✓ sent, grey ✓✓ delivered, blue ✓✓ read. Read receipt {t:'read', ids} goes when the chat is open and visible (rr:1 on incoming entries). MS1/MS2 history works unchanged; older peers ignore 'read'.

## CX1 (Hub line)
- messages_hubline.js (MSLine) wraps window.top.HubLine (H91) when present: text via HubLine.send ('delivered' → ✓✓; 'queued' → 🕓, Hub retries, our own P2P may still deliver; 'offline' → own queue),
  HubLine.onMessage + takeInbox('msg') on start / when visible, merged into messages-history by id; CX1.1 HubLine.onDelivered({id,to}) turns a Hub-queued message ✓✓. #chat=<num> opens that chat.
- Files and read receipts stay on Messages' own P2P link. No HubLine → behaviour unchanged.
