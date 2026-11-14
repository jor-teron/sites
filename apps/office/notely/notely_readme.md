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
- `nl_hubbar.js`: Hub window bar (NL5) — word count, then Open, then Download, only after the Hub says hello
- `nl_main.js`: start-up and buttons
- `notely_icon.png`: hub icon
- `index.html`: opens `notely.html`

## 3. Behaviour rules
- **Autosave:** 0.4 s after typing stops, and when the tab is hidden or closed.
- **Count:** words and characters. On its own they show on the right of the toolbar. Inside the Hub they sit in the window bar, in front of Open and Download.
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
Shown briefly in the toolbar (or, inside the Hub, on the word-count spot in the window bar):
- "File is too big (over 5 MB)."
- "That does not look like a text file."
- "Could not read that file."
- "Opened <name>" when it worked.
- If storage is blocked (private mode) or full, typing still works. A card stays up ("Couldn't save — storage full" or "Couldn't save — storage blocked") until a save works. Closing the tab retries a save that had failed.

## 7. Screen sizes
- One toolbar row on desktops (standalone only; inside the Hub that row is hidden and the count lives in the window bar).
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
- 2026-11-14 IST: NL5: the word count moves into the Hub window bar, in front of Open and Download; the whole in-page toolbar hides after the Hub says hello. Standalone is unchanged. No bottom status bar.
- 2026-11-10 IST: NL4: Open and Download move into the Hub window bar; the copies on the page hide after the Hub says hello. Standalone is unchanged.
- 2026-10-27 IST: NL1 System theme mode (default), follows the Hub theme and accent live.
- 2026-11-01 IST: NL2 clean-up: Clear, A− / A+ and the theme button removed (code parked in `parked/`); theme always follows system / Hub; fixed 16 px; word wrap on.
- 2026-10-04 23:24 IST: moved from `apps/tools/notely/` to `apps/office/notely/`, now in the hub's Office menu; notes are kept (commit 3a32f4e).
- 2026-10-04 11:39 IST: new app (commit 5aeb4bf).

## 12. Related apps
- Notepad: the older, simpler notes page (Notely imports its text once).
- Draftly: documents with formatting and pages.

## HO2

- A failed autosave is no longer silent. The card in section 6 stays until the notes are stored.
- "Open with Notely" asks with an in-app dialog (Enter confirms, Esc cancels) instead of the browser's confirm box. The parked Clear button does the same, if it is ever wired back in.
- An empty or blocked store does not wipe text the browser had already put back in the box.

## NL4

Open and Download are the only document buttons on the page. Inside the Hub, once the Hub has said hello, those two move up into the window bar (the strip with the app name). A small icon sits with each short label. The copies on the page then hide, so the notes get that strip of space back. The word and character count stays on the page.

They are the actions you actually use: open a text file, and download the notes as `Notely.txt`. New, Find, and Share are not buttons here, so they are not in the window bar. Clear used to empty the page and was removed. Notes already save themselves as you type, so there is no separate Save button, and neither Open nor Download turns off when nothing has changed. Download always writes the current text. If a button on the page is ever turned off, the matching one in the window bar turns off too.

On its own — not in a Hub window, or the Hub never says hello — Notely looks and works as before. The buttons stay on the page. Ctrl/Cmd+O and Ctrl/Cmd+S do the same thing.

The shared Undo / Redo / Save / Print bar belongs to the other Office apps. Notely does not have those, so it uses the same window-bar helper they do, with its own two buttons.

## NL5

Inside the Hub, the word and character count now sits in the window bar as well, in this order: the count, then Open, then Download. The Hub title-bar helper only knows buttons and tabs, not a plain text label, so the count is sent as a disabled button with no icon — the Hub then draws the words. The full "N words · M characters" text is kept when it fits in 24 characters; otherwise it shortens to "chars" or "w · ch", and the full text stays on the tooltip. Open and file errors that used to flash on the toolbar use the same spot in the window bar, then the count comes back.

The whole in-page toolbar hides after the Hub says hello, so the notes get that row back. There is no bar at the bottom. On its own — not in a Hub window, or the Hub never says hello — Notely still has the toolbar and the count on the right, as before.

## Legacy
IC8: icon redrawn plain without tile; old icon kept as *_icon_before_IC8.png
