# Notely

## 1. What it is
One page of plain-text notes that saves itself as you type. Open and download `.txt` files. Fixed 16 px text with word wrap; the theme always follows the system / Hub (NL2). Works on phones and desktops, offline.

## 2. Files
- `notely.html` / `notely.css`: toolbar, text area, undo bar, layout
- `notely_config.js`: themes, font sizes, timings, file name, storage keys
- `nl_store.js`: safe localStorage access (never throws)
- `nl_theme.js`: theme follows the system / Hub live via `shared/theme/hub_theme.js`, Hub accent kept
- `nl_editor.js`: text area, autosave, word / character count, text size, one-time import from Notepad
- `nl_files.js`: Open (picker or drag-and-drop) and Download
- `parked/`: NOT loaded, kept for reuse: `nl_clear.js` (Clear + Undo), `nl_theme_cycle.js` (NL1 theme button), `nl_fontsize.js` (A− / A+)
- `nl_keys.js`: keyboard shortcuts
- `nl_handoff.js`: "Open with Notely" from the Files app (sessionStorage `notely-handoff`, asks before replacing notes)
- `nl_main.js`: start-up and buttons
- `notely_icon.png`: hub icon
- `index.html`: opens `notely.html`

## 3. Behaviour rules
- **Autosave:** 0.4 s after typing stops, and when the tab is hidden or closed.
- **Count:** words and characters show on the right of the toolbar.
- **Open:** pick a text file, or drag one onto the page. It replaces the current text (Ctrl+Z can bring the old text back where the browser supports it). Limit 5 MB; line endings become `\n`.
- **Download:** saves the text as `Notely.txt`.
- **Text:** fixed 16 px, word wrap on (no sideways scroll).
- **Theme:** always follows the system / Hub dark / light live; a Hub accent colour replaces the theme accent. No button.
- **Tab** inserts a tab character instead of leaving the text area.
- **From Notepad:** the first time Notely opens with no notes, it copies the old Notepad text once. Notepad's own text is never changed.

## 4. Keyboard
- Ctrl/Cmd+S: download `Notely.txt`
- Ctrl/Cmd+O: open a file
- Tab: insert a tab
- Everything else is normal text editing.

Works inside the hub. Keys from the phone's PC Keys / Phone Keys are typed into the text, and Ctrl+S works because the app handles it. Other hub key presses are synthetic, so browser actions such as undo or moving the caret with D-pad arrows don't happen, and Ctrl+O can't open the file picker from the phone.

## 5. Saved data
localStorage keys (not tied to the folder, so moving the app keeps the notes):
- `notely-text`: the notes
- `notely-theme`, `notely-font`: no longer used since NL2 (ignored, left in storage)
- `notely-imported`: set after the one-time Notepad import
- `notepad-text`: Notepad's notes, only read

To reset, delete those keys or clear site data (that also clears Notepad's text).

## 6. Errors
Shown briefly in the toolbar:
- "File is too big (over 5 MB)."
- "That does not look like a text file."
- "Could not read that file."
- "Opened <name>" when it worked.
- If storage is blocked (private mode), typing still works but nothing is saved.

## 7. Screen sizes
- One toolbar row on desktops.
- Up to 420 px wide: smaller buttons; the count moves to its own line (at most two rows).
- Up to 420 px tall (landscape phones): slimmer toolbar.

## 8. Safe settings (`notely_config.js`)
- `themes` (colours)
- `fontSize` (fixed px, 16)
- `autosaveMs`
- `filename`
- `maxOpenBytes`
- Leave `keys` alone: changing them hides existing notes.

## 9. Browser checklist
1. Type, reload: the text is still there.
2. Long line wraps; no sideways scroll.
3. Theme to Light, reload: still Light.
4. Switch the Hub to Light / Dark: Notely follows at once.
5. Download: `Notely.txt` has the same text.
6. Open a `.txt` file: it replaces the text and says "Opened …".

## 10. Known limits
- One note only.
- Plain text only (no formatting).
- Opening a file replaces the text; only Ctrl+Z (where supported) brings it back.
- Saved per browser and site; not shared between devices.
- Old version after an update: hard-refresh.

## 11. Change log
- 2026-10-27 IST: NL1 System theme mode (default), follows the Hub theme and accent live.
- 2026-11-01 IST: NL2 clean-up: Clear, A− / A+ and the theme button removed (code parked in `parked/`); theme always follows system / Hub; fixed 16 px; word wrap on.
- 2026-10-04 23:24 IST: moved from `apps/tools/notely/` to `apps/office/notely/`, now in the hub's Office menu; notes are kept (commit 3a32f4e).
- 2026-10-04 11:39 IST: new app (commit 5aeb4bf).

## 12. Related apps
- Notepad: the older, simpler notes page (Notely imports its text once).
- Draftly: documents with formatting and pages.
