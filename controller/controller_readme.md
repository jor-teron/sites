# Controller (phone gamepad)

## 1. What it is
Turns a phone into a controller for the hub. Pair once with the hub's QR or code, then use it as a gamepad, a PC or phone keyboard, a trackpad, or to send files to the hub. The hub forwards everything into the app that is open there.

## 2. Files
- `controller.html` / `controller.css`: pairing screen, gamepad, menu, overlays
- `ctrl_tabs.css`: tab strip and Keyboard & Mouse switch
- `controller_config.js`: every setting (pairing, buttons, messages, modes, tabs, stick / D-pad tuning, haptics, QR scanner, storage keys, layout sizes, themes, all texts)
- `controller_logic.js`: PeerJS link to the hub, gamepad, stick, haptics, rumble, reconnect, QR scanner, menu, demo mode
- `ctrl_tabs.js`: tabs (Gamepad · Keys+Mouse · Files) and the ⋯ menu button
- `kb_common.js`: shared keyboard-board code (keys, modifiers, auto-repeat)
- `kb_pc.js`: PC keyboard (landscape)
- `kb_phone.js`: phone-style keyboard (portrait ok)
- `ctrl_trackpad.js`: trackpad board
- `ctrl_sendfiles.js`: Send Files board (phone → hub)
- `vendor/jsQR.js`: local QR decoder; PeerJS comes from `../vendor/peerjs.min.js`
- `controller_icon.png`, `controller_qr_icon.png`
- `index.html`: redirects to `controller.html`
- `dpad.html` and the untracked `dpad.css`, `dpad.js`, `dpad_icon.png`: an old D-pad page, stale and not used by the hub

## 3. Behaviour rules
- **Pairing:** type the hub's code (4–8 characters) and Connect, tap Scan QR and point at the hub's QR, or open the hub's link (`controller.html#code=XXXXXX`). The phone connects to peer `jtsites-` + code.
- **Stays paired:** the last code that worked is remembered and connects by itself on page load. A dropped link retries with backoff (1–10 s; gives up after 5 minutes); the LED goes amber, and you can tap the light to retry now.
- **Tabs (top centre):** 🎮 Gamepad · ⌨️ Keys+Mouse (switch: PC Keys / Trackpad / Phone Keys) · 📤 Files. The last tab and the last Keys+Mouse pick are remembered. ⋯ opens the menu: all modes, fullscreen, Light / Dark, Diag.
- **Gamepad (landscape):** D-pad / stick on the left, A B X Y on the right, L / R shoulders, Select / Start / Home. The left side can be Both (floating stick + D-pad), Stick or D-pad. The stick also presses the arrows (8 directions), so arrow-key games work. Portrait shows "Rotate your phone to landscape".
- **What the hub does with buttons:** D-pad = arrows, A = Space, B = `x`, X = `z`, Y = `c`, L = `q`, R = `e`, Start = Enter, Select = Esc, Home = message only (see `../hub/hub_readme.md`).
- **Keyboards:** PC Keys (Esc, digits, qwerty, Tab, Caps, Enter, Shift, Del, Ctrl, Alt, Space, arrows) and Phone Keys (letters, 123 layer, Space / Enter, arrows, Del). Shift / Ctrl / Alt: hold = held, tap = for the next key only. Holding a key repeats it. Gaming keys (WASD, arrows, Space, Enter, Esc, Shift) have an accent border. The hub types into the focused field.
- **Trackpad:** one finger moves the hub's pointer, tap = left click, two-finger tap = right click, two-finger drag = scroll; Left / Middle / Right buttons and a hold-drag toggle.
- **Files:** pick files; they go one at a time over a second link (the gamepad keeps working), up to 2 GB each. The hub downloads each file by itself. A failed file can be tapped to send again.
- **Vibration:** the Vib toggle (remembered) gives a short tick on direction changes and a longer pulse on button presses. Games can rumble the phone through the hub (e.g. Snake). While a rumble runs, taps don't vibrate. Diag shows the vibration state and has a "Test 250 ms" button. iPhones have no vibration ("No vibe").
- **Fullscreen + screen awake:** on touch devices it tries fullscreen and landscape lock, and keeps the screen on (wake lock). ⛶ / ⊡ button.
- **Releases:** every held button / key is released on a mode switch, disconnect, blur or when the page is hidden.
- **Demo:** `controller.html?demo=1` runs without a hub ("DEMO" tag) and logs what would be sent (`window.__ctrlOut`).

## 4. Keyboard
- Enter in the code box: Connect.
- The controller is a touch page; it doesn't react to a physical keyboard otherwise.

## 5. Saved data (localStorage)
- `jtsites-ctrl-lastcode`: last code that connected (auto-connect)
- `jtsites-ctrl-mode`: last mode (`pad` / `pc` / `trackpad` / `phone` / `files`) = last tab
- `jtsites-ctrl-kmmode`: last Keys+Mouse pick
- `jtsites-ctrl-leftmode`: Both / Stick / D-pad
- `jtsites-ctrl-haptics`: Vib on / off
- `jtsites-ctrl-theme`: light / dark

## 6. Errors
- "Enter a valid code", "Hub not found — check the code", "PeerJS missing", "Error"
- "Disconnected — tap the light to reconnect", "Reconnecting… (tap the light to retry now)"
- QR scan: "That QR code is not a hub pairing code", "Camera needs a secure (https) page — type the code instead", "No camera found — …", "Camera permission denied — …", "Camera error — …", "QR decoder missing — …"
- Files: a failed file shows its reason and can be tapped to retry

## 7. Screen sizes
- Gamepad and PC Keys need landscape (rotate overlay in portrait; tabs still work).
- Trackpad, Phone Keys and Files work in portrait.
- Sizes use `vw` / `dvh` (`layout` in the config), so the pad fits phones and tablets.

## 8. Safe settings (`controller_config.js`)
- `reconnect` (delays, giveUpMs, autoConnectOnLoad)
- `stick` (deadZone, travel, sendHz, dpadThreshold, diagonals), `dpad` (deadZone, diagonals)
- `haptics` (enabled, shortMs, longMs, rumble limits), `diag.testMs`
- `keyboard` (repeatDelayMs, repeatMs, highlightKeys), `trackpad` (tapMs, tapSlopPx)
- `sendFiles` (chunk sizes, timeouts, maxBytes)
- `qrScanner` (camera, scan rate), `browser` (autoFullscreen, orientationLock, wake lock)
- `layout` sizes, `themes`, `defaultTheme`, `text`
- Keep `peer.idPrefix` = the hub's `PEER_PREFIX` (`jtsites-`) and the `buttons` names the same as the hub's map.
- **Cache-buster:** bump every `?v=` in `controller.html` after a change (currently `20261004f`).

## 9. Browser checklist
1. Open the hub, open the controller popover; on the phone scan the QR: "Connected", the hub's dot turns on.
2. Open a game in the hub: D-pad, stick and A / B work; Vib ticks.
3. Switch left side Both → Stick → D-pad.
4. Keys+Mouse → PC Keys: type into a hub app's text box. Trackpad: move and click. Phone Keys in portrait.
5. Files: send a photo; it downloads on the hub with a card.
6. Reload the hub: the phone reconnects by itself. Reload the phone: it reconnects to the last code.
7. `controller.html?demo=1` works with no hub.

## 10. Known limits
- Needs internet (public PeerJS server), even on the same Wi-Fi.
- The QR scanner needs https.
- No vibration on iPhones.
- The hub's keys are synthetic: browser actions (file pickers, fullscreen) can't be triggered from the phone.
- `controller/index.html` redirects without the `#code=` part, so links must use `controller.html#code=…` (the hub QR already does).
- The `dpad.*` files are stale (some untracked).

## 11. Change log
- 2026-09-29 09:06 IST: first version (commit 6d7ba68).
- 2026-10-03 22:51 IST: bigger controls, dvh sizes, fullscreen button, light theme, mode button with PC / phone keyboards (commit 2106fc4).
- 2026-10-03 23:50 IST: theme chip, Diag in the hold menu, capital key labels, gaming key borders (commit 5183d8a).
- 2026-10-04 00:39 IST: Vib label, 250 ms diag test (commit 4f9ae8f).
- 2026-10-04 23:16 IST: tabs Gamepad / Keys+Mouse / Files, trackpad, Send Files to the hub (commit 5809f29).

## 12. Related apps
- Hub (receiving side): `../hub/hub_readme.md`
- File Drop: two-way file transfer between any devices
- QR Scanner: general QR reader
