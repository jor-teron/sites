# Notely

## 1. What it is
One page of plain-text notes that saves itself as you type. Open and download `.txt` files, change the text size, dark or light theme. Works on phones and desktops, offline.

## 2. Files
- `notely.html` / `notely.css`: toolbar, text area, undo bar, layout
- `notely_config.js`: themes, font sizes, timings, file name, storage keys
- `nl_store.js`: safe localStorage access (never throws)
- `nl_theme.js`: dark / light colours
- `nl_editor.js`: text area, autosave, word / character count, text size, one-time import from Notepad
- `nl_files.js`: Open (picker or drag-and-drop) and Download
- `nl_clear.js`: Clear with a 5-second Undo
- `nl_keys.js`: keyboard shortcuts
- `nl_main.js`: start-up and buttons
- `notely_icon.png`: hub icon
- `index.html`: opens `notely.html`

## 3. Behaviour rules
- **Autosave:** 0.4 s after typing stops, and when the tab is hidden or closed.
- **Count:** words and characters show on the right of the toolbar.
- **Open:** pick a text file, or drag one onto the page. It replaces the current text (Ctrl+Z can bring the old text back where the browser supports it). Limit 5 MB; line endings become `\n`.
- **Download:** saves the text as `Notely.txt`.
- **Clear:** asks first, then shows "Text cleared. Undo" for 5 s.
- **A− / A+:** text size 12–32 px in steps of 2 (default 17). Remembered.
- **Theme:** dark (default) or light. Remembered.
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
- `notely-theme`, `notely-font`: theme and text size
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
- `defaultTheme`, `themes` (colours)
- `fontSize.min`, `.max`, `.step`, `.default`
- `autosaveMs`
- `undoMs`: how long Undo stays after Clear
- `filename`
- `maxOpenBytes`
- Leave `keys` alone: changing them hides existing notes.

## 9. Browser checklist
1. Type, reload: the text is still there.
2. A+ twice, reload: still bigger.
3. Light, reload: still light.
4. Clear → OK → Undo: the text is back.
5. Download: `Notely.txt` has the same text.
6. Open a `.txt` file: it replaces the text and says "Opened …".

## 10. Known limits
- One note only.
- Plain text only (no formatting).
- Opening or Clear replaces the text; only Ctrl+Z (where supported) or the 5-second Undo bring it back.
- Saved per browser and site; not shared between devices.
- Old version after an update: hard-refresh.

## 11. Change log
- 2026-10-04 23:24 IST: moved from `apps/tools/notely/` to `apps/office/notely/`, now in the hub's Office menu; notes are kept (commit 3a32f4e).
- 2026-10-04 11:39 IST: new app (commit 5aeb4bf).

## 12. Related apps
- Notepad: the older, simpler notes page (Notely imports its text once).
- Draftly: documents with formatting and pages.
