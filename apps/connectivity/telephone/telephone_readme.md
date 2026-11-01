# Telephone — TP6

Phone calls between devices on the same Hub Connect Code (Connectivity → Chat, after Intercom). Each device gets its own 5-digit number; dial it and only that device rings.

- **Number (TP2b):** 5 digits, made at random between `10000` and `99999` (inclusive) and shown big on the Phone screen. A new number is first only a candidate ("Checking that no other phone has this number…", greyed): it is not saved and not sent to other phones (`num:''` in `hi`) until the lobby's roster comes back; if any online device (other `did`) already has it, a new one is picked, and only then is it saved (`numAt` = when it was set). If nothing answers within 5 s (offline, no code yet) the candidate is kept. Settings → New number makes another one (avoiding the online numbers; not while a call or the check is running).
- **Later clash (TP2b):** if a device that was offline at the time turns up with the same number, the device whose number was set more recently (roster `at`) picks a new number and shows an in-app notice "Your number changed…"; same `at` → the higher device id moves. In a call, it waits until the call ends.
- **Old 4-digit numbers (TP2b):** a saved TP1/TP2 number is replaced ONCE by a new checked 5-digit number (`oldNum` keeps the old one, sent as `old` in the roster) with an in-app notice. Contacts and Recent entries that only have an old 4-digit number keep it, struck through as "old number" (Contacts: "not reachable until seen online"; no ＋ in Recent; dialling it explains), until the device is seen with its new number: matched by device id (`did`), or, for entries without a device id, by the device's advertised `old` number; then they switch to the new number (toast for contacts).
- **Code:** `#code=1234` / `?hub=` (QR), the Hub's `{sharedLink:'hello'}` after `{sharedLink:'ready', app:'telephone'}` inside the Hub, `parent.__hubRemote.code`, `jtsites-hub-ctrl-code` / `shared-link-join-code`, the last code (`telephone-last-code`), else the Code dialog. **Replaced by TP4 below.**
- **Peers (own, never the Hub's):** `jtsites-<code>-telephone-<random>` per device; lobby `jtsites-<code>-telephone-0` claimed by the first device keeps the roster (`hi {id, name, num, did, busy, dnd, since, at, old}` → `roster`) and relays `{t:'to'}` signals to one device. A remaining device claims the lobby if it goes (random 0.3–1.8 s). PeerJS from `SharedLink.PEERJS_URL` (`shared/link/link_core.js`), pinned peerjs 1.5.4.
- **Calling:** keypad (DTMF key tones, 5 digits, keyboard digits / Backspace / Enter) or tap a phone in Online now. The mic is asked for first, then `{t:'ring', cid, num, name, did}` goes ONLY to the device with that number (the newest one if two tabs share it). The callee acks `{t:'ringing'}` (none in 6 s → "Could not reach the phone") and shows the ringing screen with Answer / Decline (ringtone, vibrate, Hub notice when hidden). The caller hears ringback (440+480 Hz, 2 s on / 4 s off).
- **Answer:** callee gets its mic, sends `{t:'answer'}`; the caller opens one audio MediaConnection (metadata `{kind:'phone', cid, num, name}`), which the callee answers only if the peer and `cid` match. 15 s to connect, else "Call could not connect".
- **Not connected:** no answer in 30 s → `{t:'cancel', why:'timeout'}`, "No answer" (missed on the other side). Callee already in a call → `{t:'busy'}` → "Busy" + busy tone (480+620 Hz) and a missed entry "(you were on a call)" on the callee. Decline → "Call declined". Unknown number → "Not online" + three rising notes. Own number → dialog.
- **In a call:** timer, Mute (mic track off + `{t:'mute'}` so the other side sees "muted their microphone"), Speaker (`setSinkId` output picker where the browser supports it; `selectAudioOutput` on Firefox; otherwise a note that the browser chooses), Hang up (`{t:'hang'}` + close). Esc hangs up, Enter answers. A device leaving the roster ends the call ("Call dropped").
- **Recent calls:** incoming ↙, outgoing ↗, missed ✕ (red), with time, length or reason; tap one to call back; Clear asks first.
- **Contacts (TP2):** Contacts screen (third dot). ＋ Add / ✎ Edit an in-app form with Name, Number (5 digits) and ⭐ Favourite; wrong or duplicate numbers (or this device's own number) are refused inside the form. Delete is in the Edit form and asks again in an in-app dialog (red Delete, Recent calls stay). Each contact shows a green / amber / grey dot and online · on a call · do not disturb · offline. A contact keeps the device id (`did`) when known, so if that device comes back with a new number the contact follows it (toast). Contact names replace device names in Online now, the keypad, Recent calls and the ringing screen. Recent calls shows ＋ next to numbers that are not contacts (prefilled form).
- **Missed calls (TP2):** a red count on the Recent dot and "(n) Telephone TP2b" in the tab title for missed calls since Recent was last on screen (`missedSeen`); viewing Recent clears both. Inside the Hub, when the app is hidden, a missed call also sends `HubNotify.notice` (📞, as the ring notice).
- **Do Not Disturb (TP2):** 🌙 DND on the Phone screen and in Settings. A ring while DND is on gets `{t:'dnd', cid}` back (caller: "Do Not Disturb"), no sound and no screen, and is logged as missed "(Do Not Disturb)" (badge only, no toast or Hub notice). "Favourites still ring" (on by default) lets ⭐ contacts through. DND is shared in the roster (`dnd`) so other phones show it.
- **Video during a call (TP2):** 📹 Video turns the camera on (640×480, 15 fps) and sends it as a second one-way MediaConnection `{kind:'phone-video', cid}` + `{t:'vid', on}`; the other side answers it receive-only (only for the live call's peer + cid) and shows it big, your own picture small (mirrored for the front camera). Both sides can send at once. 🔄 Flip switches front/back with `replaceTrack` (saved `facing`; one camera → note). Video off or Hang up releases the camera.
- **Files:** `telephone_save.js` (the one save module: `telephone-settings-v1` `{name, theme, num, did, volume, sink, keytones, dnd, dndFav, facing, missedSeen, numAt, oldNum}`, `telephone-log-v1` (newest first, max 100, entries keep the caller's `did`), `telephone-contacts-v1` `[{id, name, num, did, fav}]` (max 200), `telephone-last-code`, theme), `telephone_peer.js` (presence + one-device signals), `telephone_call.js` (call state, media, tones), `telephone_app.js` (UI, swipe, dialogs), `telephone.html/.css`, `telephone_icon.png`.
- Screens: Phone · Recent · Contacts · Settings (dots, 75 px wrap-around swipes). Controls on the right on wide screens; on phones the keypad sits under the number and the online list below it. Dark by default; System follows `sites-hub.theme`.
- Limits: a call rings only while Telephone is open on the other device (the PH1 launcher plan keeps it open on a phone). Phones usually do not let a web page switch between earpiece and loudspeaker. One call at a time. Video has been tested only with fake cameras (the box blocks WebRTC). Devices still on TP2 do not see TP2b numbers (and the other way round), so update every device. The number check only covers devices online at that moment (later clashes fix the rest). TP3 (call waiting, voicemail, conference) is dropped for now.

## TP4 — Public 0000 by default

- **Code choice:** `#code=` / `?hub=` / `join=` in the URL wins (and is not changed later). Inside the Hub: if `parent.HubMeshLink.isPrivate()` → `privateCode()`, else **0000 (Public)**, shown as `0000 · Public`. The Hub's own Connect Code (`{sharedLink:'hello'}`, `__hubRemote.code`, `jtsites-hub-ctrl-code`, `shared-link-join-code`) is used only in an older Hub without `HubMeshLink`, ending at 0000. Standalone: last code, else 0000. No code dialog at start.
- **Public button:** the Code / Change dialog has Cancel · Public · Join; Public picks 0000.
- **Following the Hub:** every 5 s Telephone re-reads `HubMeshLink` (read-only). If the Hub joined or left a private mesh and no call is dialling, ringing or active, it switches by itself with a toast; during a call it only shows a **Switch to <code>** / **Back to Public** button at the top and never changes rooms mid-call (the button and Code dialog say "Hang up first" during a call).
- A code picked with Code/Change (or Public) holds for the session. Safety unchanged: every call rings and must be answered, DND with favourites stays, and the 5-digit number check now covers every phone on 0000. On 0000, anyone online can see your name and number in Online now.
- (TP3 stays reserved for the dropped call-waiting plan.)

## TP5 — Minimal Phone screen

Jor asked for a minimalist look: the device name was shown twice and the "Online · code 0000" line and Code button were no longer needed.

- **Top bar:** the name once, with a small connection dot before it (green online, amber connecting, grey offline / PeerJS failed); the status text is the dot's tooltip / `aria-label` (`setStatus` writes there). Do Not Disturb is a 🌙 icon button (same `b-dnd`, `on` state, `aria-pressed`). The code is changed only in Settings → Hub code → Change; the `#tp-switch` offer button is unchanged.
- **My number:** one line "My number 12345"; the name is no longer repeated under it, `#my-sub` only shows "Checking…" while a new number is checked.
- **Shorter texts:** empty lists say "No other phones online." / "No calls yet." / "No contacts yet."; About is short and mentions Public 0000. "PeerJS could not load" also shows as a toast.
- Title and About version say TP5.

## TP6 — Incoming calls get your attention

Calls didn't come to the front: when Telephone was in a background tab or behind another Hub app, a call only flashed the tab title. Browsers don't let a page raise its own window, so TP6 adds what a page is allowed to do (`telephone_alert.js`, `TPAlert`):

- **System notification:** on an incoming call (state `incoming`; Do Not Disturb declines never get there), when the page is hidden or its host frame isn't visible / focused, and permission is `granted`, it shows "📞 <name or number> is calling" (tag `tp-call`, `requireInteraction`, `renotify`, icon `telephone_icon.png`). If a service worker registration already exists for the page it uses `showNotification` with Answer / Decline actions, else a plain `new Notification` with no actions. Tapping it focuses the window (and the host), shows the Phone pane and the call screen. It's closed when the call is answered, declined, missed or ended. All in try/catch; unsupported / denied = nothing extra.
- **Permission:** never asked on load. Settings → Alerts → Call notifications asks for it when turned on; if the browser blocks it, an in-app message explains and the switch goes off. The first call that comes in while permission is still `default` shows a one-time "🔔 Turn on call notifications" button (tap = ask). Saved in `telephone-settings-v1` as `callNotify` and `notifyHinted`.
- **Host hint (proposed contract for a future Hub system-wide notification):** inside a host only, Telephone posts to `window.parent`:
  - ringing starts: `{sharedLink:'attention', app:'telephone', kind:'call', title:'📞 <who> is calling', urgent:true}`
  - ringing stops (answered / declined / missed / ended): `{sharedLink:'attention', app:'telephone', kind:'call-end'}`
  Hosts that don't know it ignore it. The idea: the Hub (and phone/) would show an urgent pop-over above any app and switch to Telephone on tap; that needs Hub Main Bot's side.
- Title flashing, vibrate and ringtone are unchanged. A true pop-over above everything needs Hub support or the Android app (PH3).

## TP7 — Do Not Disturb follows the Hub; Answer / Decline from the Hub's call card

Why: Jor wants Do Not Disturb to belong to the Hub, with connectivity apps following it automatically (Hub H82, PR #350).

- **No own DND:** the 🌙 `#b-dnd` button and the Settings "Do Not Disturb" / "Favourites still ring" rows are gone. `telephone_dnd.js` (`TPDnd`) reads `window.parent.HubDnd` (isOn / allowFavs / on('change')) inside a host, else localStorage `sites-hub.dnd` / `sites-hub.dndFavs` (`'1'` = on) plus the `storage` event. While the Hub's DND is on, an incoming call is declined silently (`{t:'dnd'}` to the caller) and logged as missed (Do Not Disturb), except a ⭐ contact when the Hub's "Favourites still ring" is on. Presence `dnd` follows the Hub. A read-only 🌙 next to the name shows it ("Do Not Disturb is on in the Hub"). Old `dnd` / `dndFav` values in `telephone-settings-v1` are ignored.
- **Attention message** now carries `from: '<name> (<number>)'` and `fav: true` for a ⭐ contact.
- **attention-reply:** `{sharedLink:'attention-reply', app:'telephone', kind:'call', action:'answer'|'decline'}` from `window.parent` only, while a call is ringing in, goes through the Answer / Decline buttons (Answer also shows the Phone pane / call screen). Anything else is ignored.

## FC5 (TP8) — 5-digit Hub codes, public 00000
- **Why:** the Hub moved to 5-digit codes in H83 (clean cut-over, no 4-digit fallback). Public lobby is now **00000** (`SharedLink.LOBBY`, fallback `'00000'` while H83 is not live).
- **What:** URL `#code=` / `?hub=` / `join=`, the code dialog (maxlength 5, "5-digit code"), Hub hello codes, mesh codes and the last code now take exactly 5 digits. Saved 4-digit codes are ignored (`c5()`), so the app falls to Public or asks.
- **Phone number:** this device's Hub number (`SharedLinkDevices.code()` / `SharedLink.deviceCode()`, looked up on this page, then parent, then top). With it: no own number picking, no clash renumbering, the **New number** button is gone. Without it (H83 not live) the TP2b picked + checked number is still used. Contacts and Recent keep working; old 4-digit contacts are still shown as old.

## FX1 (TP9) — overlay fix
- Why: Jor reported something covering the first device row ("No other devices online." / first device hidden).
- What: the Switch to/Back to Public button and the notifications banner are no longer position:fixed; they sit in the normal layout (top bar / under it), so they can't float over the list. Top bar and texts are flex:none so they never squash or overlap. Switch-button JS unchanged.

## Legacy code notes
- FX1: old fixed-position CSS for the switch button / notify banner and its old markup at the end of the body are kept as comments (TP8).

- TP5 removed markup (noted in an HTML comment in `telephone.html`): `#status` ("Online · code …") and `#btn-code` (Code) in the Phone bar; "🌙 DND" text became 🌙 only. The old `setStatus` (writing `#status`), the `btn-code` hook and the old `my-sub` text (name / long checking text) are kept as comments in `telephone_app.js`; the `btn-code` hook stays guarded.

- TP1–TP2b `localCode()` + `go()` + `askCode()` + `boot()` (Hub's own Connect Code first, code dialog when none) are kept as comments in `telephone_app.js` above the TP4 code choice.

- TP2–TP6 Telephone Do Not Disturb (`paintDnd` / `setDnd` / `#b-dnd` / `#chk-dnd` / `#chk-dndfav` hooks in `telephone_app.js`, the `TPSave.get('dnd')` / `dndFav` check in `telephone_call.js`, presence `dnd` in `telephone_peer.js`) is kept as comments; the removed markup is noted in HTML comments in `telephone.html`. Replaced in TP7 by the Hub's DND (`TPDnd`).
- FC5: `$('b-newnum')` handler kept as `//` comments in telephone_app.js; `checkClash` now returns early when `TPSave.fromHub()`. Old 4-digit code regexes kept in the TP1–TP4 `//` legacy blocks.

## CX1 (Hub line)
- telephone_hubline.js (TPLine) wraps window.top.HubLine (H91) when present. Calling a number whose Telephone is closed rings through HubLine.call(num,{video:false});
  on accepted, Telephone dials over its own lobby as soon as the number appears (20 s). #call=<callId>&from=<num> auto-answers the next ring from that number (60 s).
  takeInbox('missed'/'call') entries go into the call log as missed. Media stays P2P. No HubLine → unchanged.
