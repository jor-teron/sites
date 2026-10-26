# Hub on-screen keyboard (hub/osk/)

A keyboard panel for the Hub's Desktop mode. It types into the app in the **active window**.
It is part of the Hub page, not an app: there's no tile; open it from the taskbar tray.

## Use
- **⌨** in the taskbar tray: show / hide. **✕** on the keyboard's top bar closes it, **Ctrl+Alt+K** toggles (H23: the old ⌨▾ bottom-right key is gone).
- The shown / hidden state is kept in localStorage `sites-hub.osk` (`1` = shown).
- Shift / Ctrl / Alt: tap = one-shot for the next key (tap again = off), hold = held while you press other keys.
- Caps toggles. Labels follow Shift / Caps. Hold a key to repeat (450 ms, then every 60 ms).

## Moving it (R11, `osk_drag.js`)
- The keyboard is only as wide as its keys (`--osk-w`, about 60% of a desktop screen, full width under 720 px).
  Beside it nothing covers the desktop: clicks there reach the desktop / windows.
- H23: always **floating** (docked mode removed). Every open starts at bottom centre above the taskbar; the
  position is not saved. Drag the grip bar anywhere. Near the left / right edge it snaps to that edge
  (translucent preview, like window snapping; off with Settings → Windows "Snap windows to screen edges").
- Dragging never takes focus from the app's text field.

## How it works
- `osk.js` puts a fixed panel on the Hub page above the taskbar (below it when the taskbar is at the top).
  z-index 95: over windows and the taskbar (90), under the Hub menu, popovers, dialogs and right-click menus.
- It takes no room from the desk; only the keyboard's own box catches clicks.
- It never becomes the active window and never takes focus (keys: `type=button`, `tabindex=-1`,
  mousedown / touchstart / contextmenu cancelled; kb_common cancels pointerdown). On a key press, if the
  Hub page has focus, focus goes back to the active window (`__hubFocusFrame`) and to the app's last
  text field (Chrome drops it when you click the Hub page).
- Keys go through `window.__hubController.key(msg)`, which is `forwardKey` in `hub/controller/hub-controller.js`
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
| `osk_drag.js` | Grip drag, edge snapping + preview, reset to bottom centre |
| `osk.css` | Panel, keys, light theme, desk space, tray button |
| `osk_board.js` | Shared board: draws the rows, Caps, live labels, no-focus guard (also used by `apps/lab/keyboard/`) |
| `osk_layout.js` | Shared key rows + screen-reader names (data only) |

Also loaded: `hub/controller/kb_common.js` (`CTRL_KB`: pointer handling, modifiers, repeat, `code` values).
All of them are in the service worker shell (`hub/update/hub_sw.js`).

## Limits (R1)
- Desktop mode only (Phone mode has no tray).
- ↑ ↓, Tab and Shift+arrows don't move the caret or select (only the key events are sent). Ctrl+Z / C / V aren't done
  (synthetic events can't use the clipboard).
- No vibrate setting, fixed size (`--osk-h`, `--osk-w`), no number-pad layer yet.
