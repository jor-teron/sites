# Keyboard (Lab)

On-screen keyboard (OSK) demo. It will become the Hub's system-wide keyboard (`hub/osk/`, a
Hub component opened from the taskbar tray); this page is the stand-alone test bed.

Open: `apps/lab/keyboard/` (Lab → Tools → Keyboard).

## What it does
- Types into the text box on the page (the phone's own keyboard stays hidden: `inputmode="none"`).
- Inside a frame (a Hub window) every key is also posted to the parent page, same origin only, as the
  Hub controller message `{t:'key', key, code, s:1|0, shift, ctrl, alt, repeat}` (down and up).
- Keys fire on press, keyup on release, slide-off or cancel; hold = auto-repeat (450 ms, then every 60 ms).
- Shift / Ctrl / Alt: tap = one-shot for the next key (tap again = off), hold = held while you press other keys.
- Caps toggles. Letter and symbol labels follow Shift / Caps.
- Keys: Esc, backtick / ~, digits, Backspace, Tab, Caps, Enter, Shift, Delete, Ctrl, Alt, Home, Space, End, arrows.
- The keys never take focus, so the caret stays in the text box.
- Vibrate on / off (saved in localStorage `jtsites-lab-keyboard.vibrate`).
- Any shape: phone portrait / landscape, Hub window, desktop.

## Files
| File | Role |
| --- | --- |
| `index.html` | Redirect to `keyboard.html` |
| `keyboard.html` | Page: status bar, text box, board |
| `keyboard.css` | Layout + key look (size container, `clamp()` text, safe areas) |
| `keyboard_layout.js` | Key rows + screen-reader names (data only) |
| `keyboard_type.js` | Typing into the demo text box (undo-friendly `execCommand`) |
| `keyboard.js` | Start-up: draws the board, wires `CTRL_KB.kit.api`, vibrate, status |

Shared code: `hub/controller/kb_common.js` (`CTRL_KB`: pointer handling, modifiers, repeat,
`KeyboardEvent.code` values). It is the same file the phone Gamepad's keyboard mode uses, so a fix
there helps both. It works without `CONTROLLER_CONFIG` (defaults: repeat on, 450 / 60 ms).
