# File Drop

## 1. What it is
Send files between any two devices with a browser (phone ↔ PC, phone ↔ phone). Both devices open File Drop; one scans the other's QR or types its 4-digit code, and they connect straight away. Files go device-to-device over WebRTC (PeerJS). Nothing is uploaded to a server; the public PeerJS server is only used to find the other device, so both devices need internet.

## 2. Files
- `filedrop.html` / `filedrop.css`: pair screen, room screen, viewer, layout
- `filedrop_config.js`: every setting (ids, timeouts, chunk sizes, size limits, auto-save, sound)
- `filedrop_proto.js`: pure helpers and the wire protocol (no DOM; also used by the tests)
- `filedrop_pair.js`: QR / code pairing, the persistent link, heartbeat, reconnect
- `filedrop_send.js`: outgoing queue, backpressure, resume
- `filedrop_recv.js`: incoming files, resume, auto-save, Save all (.zip)
- `filedrop_scan.js`: live camera QR scan (BarcodeDetector, else jsQR)
- `filedrop_ui.js`: screens, list, progress, drag-drop, keys, start-up
- `filedrop_test.js`: Node tests for the pure parts (`node filedrop_test.js`, 90 passing)
- `vendor/`: PeerJS 1.5.4, qrcode.js, JSZip 3.10.1, jsQR 1.4.0 (all local, no CDN; see `vendor/README.txt`)
- `filedrop_icon.png`, `index.html` (opens `filedrop.html`)

## 3. Behaviour rules
- **Pair screen:** shows this device's QR and 4-digit code, and a live camera looking for the other device's QR. The code changes every 2 minutes and after each use.
- **Connect:** scan the QR, or type the other device's code and tap Connect. The link is accepted at once (no approve dialog); a secret token in the QR / code stops strangers joining.
- **One partner at a time:** other devices get "That device is already connected to another device."
- **Stays connected:** heartbeat every 3 s; after 10 s of silence the link counts as lost and redials by itself (backoff 0.5–8 s, also straight away when the page is shown again or the network returns). Only Disconnect (either side) ends the pairing. A reload of the tab reconnects (sessionStorage).
- **Send:** Send files, Choose files (before connecting: they wait in a queue), drag-drop anywhere, paste, or Ctrl+O. One file at a time.
- **Resume:** if the link drops mid-file, it continues from the last confirmed point (about every 1 MB) when it comes back.
- **Size limit:** 2 GB per file (1 GB on iPhone / iPad; warning above 300 MB).
- **Receive:** files download by themselves (desktop / Android). iOS can't save on its own, so it shows Save / Share buttons. Tap a file for a viewer. Save all (.zip) zips every received file. Received files stay in the list until the page closes, even after Disconnect.
- **Progress:** per-file bar, plus an overall bar with files done / total, speed and time left.
- **Extras:** chime and vibration on connect / done; screen kept awake while connected; leaving the page during a transfer asks first.
- **QR link on local copies:** when opened from file://, localhost or a LAN address, the QR points at the public GitHub Pages copy (`publicBaseUrl`) so a phone can open it.

## 4. Keyboard
- Esc: close the viewer / file list
- Ctrl/Cmd+O: choose files
- Enter in the code box: Connect

Inside the hub the phone D-pad sends synthetic keys: Select = Esc works; the file picker can't be opened from the phone.

## 5. Saved data
- sessionStorage only (this tab): `fd-me` (own id + token), `fd-client`, `fd-partner` (to reconnect after a reload).
- No localStorage. Files are never stored; they exist only in memory until the page closes.

## 6. Errors
Toasts and camera messages:
- "This browser cannot run WebRTC, or PeerJS failed to load." (Connect is disabled)
- "Enter the 4-digit code." / "That is this device's own code. Enter it on the other device."
- "That QR / link has expired. Scan the current one."
- "That device is already connected to another device." / "Already connected. Disconnect first."
- "Could not connect. Try again."
- "<name> is over 2 GB."
- "Large file on iPhone: keep File Drop open and the screen on until it finishes."
- "No received files yet." / "Zip library missing."
- Camera: "Camera needs https. Enter the code below instead.", "Camera blocked. Allow it, or enter the code below.", "No camera found…", "Camera unavailable…"

## 7. Screen sizes
- **Portrait:** your QR card above the camera / code card.
- **Landscape / square or wider:** the two cards side by side; centred up to 1000 px on large screens.
- **Short screens (under 420 px tall):** smaller header and padding.
- Reduced-motion turns off the spinner and bar animations.

## 8. Safe settings (`filedrop_config.js`)
- `publicBaseUrl`, `peerOptions` (to self-host the PeerJS server: `{ host, port, path, secure: true }`)
- `codeTtlMs`, `codeAnswerMs`, `pingEveryMs`, `deadAfterMs`, `reconnectDelaysMs`
- `chunkMax` / `chunkMin`, `bufferHigh` / `bufferLow`, `ackEveryBytes`
- `maxBytes`, `maxBytesIOS`, `warnBytesIOS`
- `autoSave`, `sound`, `vibrate`, `camera`, `scanEveryMs`
- Keep `peerPrefix` / `codePrefix` the same on both devices (changing them breaks pairing with older copies).
- Bump `?v=20261004a` in `filedrop.html` after changing a file.

## 9. Browser checklist
1. Open on a PC and a phone: both show a QR and a code.
2. Scan the PC's QR with the phone: both show "Connected".
3. Send a photo from the phone: it downloads on the PC; the progress bar reaches 100%.
4. Send a big file, turn the phone's Wi-Fi off and on: it resumes, not restarts.
5. Type a wrong code: error toast after a few seconds.
6. Disconnect: both go back to the pair screen.
7. `node filedrop_test.js` prints "90 passed, 0 failed".

## 10. Known limits
- Needs internet on both devices (PeerJS public signalling server), even on the same Wi-Fi.
- Camera scanning needs https (not file://); use the code instead.
- Some strict networks (corporate / mobile carrier NAT) block WebRTC with no TURN server, so the connection fails.
- Big files are held in memory on the receiver; iPhones may reload the page with very large files.
- iOS can't auto-save; use Save / Share.
- One partner at a time.

## 11. Change log
- 2026-10-04 04:33 IST: new app, replaces AirDrop (`airdrop-web` removed; hub entry AirDrop → File Drop) (commit 3ee0b86).

## 12. Related apps
- OCR: its "send from phone" uses the same pairing idea.
- Hub + controller: the hub can also receive files from the controller's Files tab.
- QR Scanner: general QR reader.
- Note: `hub_apps.js` still has an old hidden Tools row "FileDrop" → `apps/lab/file-drop/`, which no longer exists (harmless while hidden).
