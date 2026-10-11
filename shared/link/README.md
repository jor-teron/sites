# SharedLink (shared/link/)

One PeerJS connection layer for every app. Plain JS, script tags, no build.

## Files
- `link_core.js` — `window.SharedLink`: PeerJS loader (pinned **once**: `https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js`), host / join roles, retry, device list, messages.
- `link_devices.js` — `window.SharedLinkDevices`: this device's editable name (`shared-link-device-name`, default guess "Android phone", "Windows PC"…).
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
- app → Hub `{sharedLink:'send', msg, to?}`
- Files whose `app` does not match the open receiver → Hub viewer + toast, "Open in…", auto-download (`hub-auto-download`, on by default), IndexedDB `hub-received` (last 30).

## Manual test
1. Open the Hub; Gamepad QR tile shows the code; scan with a phone → Gamepad works; tile lists "Gamepad" with a green dot.
2. Reload the Hub (also hard reload) → phone reconnects by itself with the same code.
3. Open Print inside the Hub → it shows the Hub's code; scan its QR → print-send (hub mode) → send a photo → Print dialog opens; device list shows the phone's name.
4. Send from print-send with Home open → toast + viewer + download; Received list in the gamepad popover.
5. Open Print standalone (`apps/lab/print/print.html`) → own 4-digit code, QR, history work as before.
6. Disconnect in the popover → devices get bye and stop.
