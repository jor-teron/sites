# Hub on-screen keyboard (hub/osk/)

A keyboard panel for the Hub's Desktop mode. It types into the app in the **active window**.
It is part of the Hub page, not an app: there's no tile; open it from the taskbar tray.

## Use
- **⌨** in the taskbar tray: show / hide. The **⌨▾** key on the board and **Ctrl+Alt+K** do the same.
- The shown / hidden state is kept in localStorage `sites-hub.osk` (`1` = shown).
- Shift / Ctrl / Alt: tap = one-shot for the next key (tap again = off), hold = held while you press other keys.
- Caps toggles. Labels follow Shift / Caps. Hold a key to repeat (450 ms, then every 60 ms).

## How it works
- `osk.js` puts a fixed panel on the Hub page above the taskbar (below it when the taskbar is at the top).
  z-index 95: over windows and the taskbar (90), under the Hub menu, popovers, dialogs and right-click menus.
- While it is shown, `body.hub-osk-on` makes the desk (`#frame-wrap`) end above the panel, and a `resize`
  event lets `wm_windows.js` keep the windows inside. Maximised and snapped windows shrink with it.
- It never becomes the active window and never takes focus (keys: `type=button`, `tabindex=-1`,
  mousedown / touchstart / contextmenu cancelled; kb_common cancels pointerdown). On a key press, if the
  Hub page has focus, focus goes back to the active window (`__hubFocusFrame`) and to the app's last
  text field (Chrome drops it when you click the Hub page).
- Keys go through `window.__hubController.key(msg)`, which is `forwardKey` in `hub/hub-controller.js`
  (the same path as the phone Gamepad's keyboard):
  `{t:'key', key, code, s:1|0, shift, ctrl, alt, repeat}`, down and up. That fires keydown / keypress /
  keyup on the focused element (games) and types into inputs, textareas and contenteditable
  (`insertText`), plus Backspace, Delete, Enter, ← →, Home / End (line start / end in a textarea), Ctrl+A.
  Apps from another site only get the `{type:'hub-key', ...}` postMessage.
- Held keys are released on a window switch, a mode switch, page blur / hide, and when the panel hides.

## Files
| File | Role |
| --- | --- |
| `osk.js` | Panel, tray button, Ctrl+Alt+K, sending, focus, release |
| `osk.css` | Panel, keys, light theme, desk space, tray button |
| `osk_board.js` | Shared board: draws the rows, Caps, live labels, no-focus guard (also used by `apps/lab/keyboard/`) |
| `osk_layout.js` | Shared key rows + screen-reader names (data only) |

Also loaded: `hub/controller/kb_common.js` (`CTRL_KB`: pointer handling, modifiers, repeat, `code` values).
All of them are in the service worker shell (`hub/hub_sw.js`).

## Limits (R1)
- Desktop mode only (Phone mode has no tray).
- ↑ ↓, Tab and Shift+arrows don't move the caret or select (only the key events are sent). Ctrl+Z / C / V aren't done
  (synthetic events can't use the clipboard).
- No vibrate setting, fixed height (`--osk-h`), no number-pad layer yet.
