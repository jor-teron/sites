# SharedLink (shared/link/)

One PeerJS connection layer for every app. Plain JS, script tags, no build.

## Files
- `link_core.js` — `window.SharedLink`: PeerJS loader (pinned **once**: `https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js`), host / join roles, retry, device list, messages.
- `link_devices.js` — `window.SharedLinkDevices`: this device's editable name (`shared-link-device-name`, default guess "Android phone", "Windows PC"…). H19 / H50a: `id()` = the permanent device id `hub-xxxxxxxx-xxx` (16 chars, `^hub-[a-z0-9]{8}-[a-z0-9]{3}$`, key `shared-link-device-id`); an old `d-…` id is converted once and kept in `shared-link-device-id-old` (`oldIds()`, `isMe(id)`). Never synced or exported.
- `hub_mesh.js` — `window.HubMesh` (H50): one shared mesh per Connect Code. Peers `jtsites-<code>-mesh-<deviceId>` + lobby `jtsites-<code>-mesh-0`, roster, full mesh up to 8 then relay via the lobby, heartbeat / takeover with terms, `channel(name)` send / broadcast, `setAppIdentity`. Needs `link_core.js` (PeerJS) and `link_devices.js`. Started by the Hub (`hub/link/hub_meshlink.js`). Details: hub/docs/README_technical_team2.txt (H50).
- `link_files.js` — chunked file transfer (`SharedLink.sendFile`), progress events, Hub relay.
- `link_ui.js` — `SharedLinkUI.mountDevices(el)` (name + green online dot), `mountName(el)`.
- `link.css` — widget styles.

## Behaviour rules
- PeerJS default config only. Never set `iceServers`: the default list carries the PeerJS TURN relay (needed behind CGNAT / mobile data).
- Host peer id = `prefix + code` (Hub: `jtsites-`, same as the Gamepad). New codes are 4 digits; saved older 6-letter codes keep working.
- Code survives reload (host: caller's key, Hub uses `jtsites-hub-ctrl-code`; join: `shared-link-join-code`). `unavailable-id` after a reload → same code retried with backoff; network trouble → backoff, never a silent new code.
- Only a manual Disconnect (`stop()`) sends `bye` and ends the link. `pause()` (page hide) drops the peer quietly so devices reconnect.
- Connections with `metadata.kind === 'link'` speak SharedLink; others (old Gamepad, `kind:'files'`) go to `onLegacy(conn)` and are still listed as devices.

## API
```js
SharedLink.loadPeer()                         // Promise<Peer>
SharedLink.host({prefix, code, codeKey, onLegacy})
SharedLink.join({prefix, code})
SharedLink.newCode(); SharedLink.stop(); SharedLink.pause()
SharedLink.on('status'|'devices'|'message'|'file'|'progress'|'open'|'close'|'bye', fn)
SharedLink.send({type:'chat', text}, to?)     // host relays `to`
SharedLink.sendFile(file, {app, to, onProgress})
SharedLink.code / role / devices / connected / live
```

## Wire messages (JSON, key `t`)
| t | fields | |
|---|---|---|
| hello | name | device → host on open; host answers `ready` |
| ready | | host → device |
| name | name | rename |
| devices | list [{id,name,online}] | host → all devices |
| msg | type, …, to?, from? | app messages (chat, …) |
| meta / chunk / end | id, name, mime, size, app?, to? / id, d (base64) / id | file (same frames as Print) |
| bye | manual / reason | manual Disconnect only |

Any other `t` (Gamepad `btn`/`stick`/`key`/`ptr`…, Hub → pad `rumble`) is emitted as `raw(msg, from, conn)`. Since release 3 the Gamepad joins as a SharedLink device (`metadata.pad`) and sends its keys over the link; old Gamepad pages without `kind:'link'` still use the legacy channel.
`SharedLink.id` = this device's own peer id (to hide yourself in the device list).

## Hub ↔ app (iframe) contract
- app → Hub `{sharedLink:'ready', app:'print', types:['image/','application/pdf']}`
- Hub → app `{sharedLink:'hello', code, prefix, devices}`, `{sharedLink:'file', name, type, blob, from}`, `{sharedLink:'devices'}`, `{sharedLink:'message'}`
- app → Hub `{sharedLink:'send', msg, to?}`, `{sharedLink:'sendFile', blob, name, type, app, to}` (release 3)
- Files whose `app` does not match the open receiver → Hub viewer + toast, "Open in…", auto-download (`hub-auto-download`, on by default), IndexedDB `hub-received` (last 30).

## Manual test
1. Open the Hub; Gamepad QR tile shows the code; scan with a phone → Gamepad works; tile lists "Gamepad" with a green dot.
2. Reload the Hub (also hard reload) → phone reconnects by itself with the same code.
3. Open Print inside the Hub → it shows the Hub's code; scan its QR → print-send (hub mode) → send a photo → Print dialog opens; device list shows the phone's name.
4. Send from print-send with Home open → toast + viewer + download; Received list in the gamepad popover.
5. Open Print standalone (`apps/office/print/print.html`) → own 4-digit code, QR, history work as before.
6. Disconnect in the popover → devices get bye and stop.

## Release 3 (2026-10-11)
- On SharedLink: Hub, Gamepad (pad over the link, `raw`), File Drop (Hub panel + Send to), Photo Editor v2 (Send), OCR, Paper Keyboard, Print (Hub and standalone host).
- `shared/vendor/peerjs.min.js` and every per-app PeerJS copy were removed; PeerJS loads only through `loadPeer()` (P2P Chat, WebRTC Chat and Pooh Chat still use their own script tag of the same pinned CDN URL until release 4).
- `stop()` only destroys the peer it stopped, so a new `join()` / `host()` right after a Disconnect survives.
- Manual test (release 3): scan the Hub QR once on a phone → Gamepad works → 📤 File Drop is already connected → send 3 files → Open OCR / Paper Keyboard / Print in the Hub → the phone pages (`ocr_send.html#hub=`, `?role=input&hub=1`, `print-send.html?hub=1`) join the same link; reload the Hub → everything reconnects.

## Release 4 (2026-10-11)
- `link_chat.js` — `window.SharedChat`: group chat `{type:'chat', id, from, name, text, ts}`, history `shared-chat-history` (last 200). Devices send with `bcast:true`; the host re-broadcasts to every other device and emits `message` locally.
- `link_scan.js` — `SharedLinkScan.ask()` code entry + Scan QR (BarcodeDetector, else the app's `vendor/jsQR.js`); `parse(text)`.
- `../share/share_wa.js` — `ShareWA.text(t)` (`https://wa.me/?text=`) and `ShareWA.files(list)` (`navigator.share`, else download). WhatsApp and WhatsApp Business via the OS chooser.
- Unknown code: `join()` on `peer-unavailable` for a code that never connected stops, sets status state `notfound`, emits `notfound`, and shows a "Hub not found — check the code" banner with Retry (`noBanner:true` to skip). Codes that connected once (`shared-link-ok-codes`) keep auto-reconnecting with backoff.
- Hub ↔ app: app → Hub `{sharedLink:'chat', text}` (Pooh Chat inside the Hub).
- Manual test: phone A + phone B open Pooh Chat (standalone, scan the Hub QR) → messages appear on both and in the Hub 🐻 panel; type a wrong code → banner, Retry.
