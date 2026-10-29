# Hub Office Slides (Office → Hub Office) — release SL1

A basic slide editor. Static, no build step, no libraries, works from `file://`. Built to stay light on a Celeron / 4 GB
laptop: only the slide being edited is live (two textareas), thumbnails are plain text in the slide design scaled down
(up to 9 bullets each), saving is debounced (400 ms) and one deck is one localStorage record.

## Use
- **Slide list**: on the left (a strip on top on phones, ≤ 760 px). Numbered thumbnails show the title and bullets.
  Click to select; ↑/↓ (←/→ in the strip), Home/End in the focused list; Enter goes to the title.
- **Add**: ＋ Slide (or Ctrl+Enter) adds a blank slide **after** the current one and puts the cursor in its title.
- **Reorder**: ▲ / ▼ in the top bar (or Alt+↑/↓ in the list, or the ⋯ menu), or **drag** a thumbnail
  (mouse: press and move; touch: hold for about ⅓ s, then move; a quick swipe still scrolls the strip).
- **Delete**: only in the ⋯ menu (red **Delete slide…**), and it always asks with an in-app dialog that starts on Cancel.
  There is no Delete-key shortcut on the slide list. A deck keeps at least one slide. ⋯ also has Duplicate slide.
- **Editing**: each slide is a 16:9 canvas (960 × 540 design pixels, scaled to fit). Title on top (Enter / ↓ goes to the
  bullets). Bullets: one per line. Tab indents the line(s) one level, Shift+Tab (or Backspace at the start) outdents,
  Enter keeps the indent and Enter on an empty indented bullet outdents it.
- **Decks**: the deck name (top left) opens the deck menu: New deck, Open deck… (list of decks on this device),
  Rename deck…, Import .hslides…, Export .hslides, Delete deck… (red, in-app confirm). Slides reopens the last deck.
  Dropping a .hslides file on the window imports it too.
- **Auto-save**: every change saves 400 ms later and right away when you switch slide or deck, or the page is hidden or closed.
  The top bar shows Saving… / Saved. If storage is missing, full or blocked, Slides keeps working in memory and shows a
  warning banner (like Base BS3a); then use Export before closing.
- **Settings (⚙)**: Theme System / Light / Dark (dark is the default; System follows the Hub's `sites-hub.theme`, then the
  device), storage state, keyboard list and About. In-app dialogs only.

## The .hslides file (open format, version 1)
Plain UTF-8 JSON, so any editor or script can read and write it:

```json
{
  "format": "hub-slides",
  "version": 1,
  "name": "Team meeting",
  "created": "2026-10-29T05:30:00.000Z",
  "updated": "2026-10-29T06:10:00.000Z",
  "slides": [
    { "title": "Agenda",
      "bullets": [ { "text": "Results", "level": 0 }, { "text": "October numbers", "level": 1 } ] }
  ]
}
```
- `format` must be `"hub-slides"`. `version` is 1; a file with a higher version is refused with a message.
- `slides[].title`: text (line breaks become spaces, 300 characters max).
- `slides[].bullets[]`: `{ "text", "level" }`, level 0 = top bullet, 1 = indented once (SL1 has two levels; higher counts as 1).
  A plain string is accepted as a level-0 bullet. Empty text = an empty line on the slide.
- `name`, `created`, `updated` are optional. Unknown keys are ignored, so later releases (SL3 layouts and pictures) can add
  fields without breaking SL1.
- Import limits: 5 MB, 500 slides (extra slides are dropped with a note), 200 bullets of 1000 characters per slide.
  An imported deck always becomes a new deck ("Name (2)" when the name is taken); it never overwrites one.

## Storage (localStorage, the one save module `slides_save.js`)
- `slides-settings-v1` = `{ theme }`
- `slides-decks-v1` = `{ current, decks: [{ id, name, updated, count }] }` (newest first)
- `slides-deck-v1:<id>` = `{ id, name, created, updated, cur, slides: [{ id, title, body }] }`; `body` is the bullet text,
  one bullet per line, a leading TAB = level 1.

## Files
- `slides.html`, `slides.css`, `index.html` (redirect), `slides_icon.png` (192 px), `slides_readme.md`
- `slides_save.js` (`SLSave`): settings + theme, deck list, decks, debounced auto-save, memory fallback
- `slides_file.js` (`SLFile`): .hslides export / import and checks
- `slides_edit.js` (`SLEdit`): the scaled 16:9 slide, title, bullets (mirror dots), Tab / Shift+Tab
- `slides_list.js` (`SLList`): thumbnails, selection, drag to reorder
- `slides_app.js`: top bar, menus, decks, dialogs, settings, keys; `window.Slides` (read-only helpers for tests / SL2)

## Limits (SL1)
- Text only: no layouts, pictures, colours or fonts yet (SL3). Long text can run past the bottom of the slide; it scrolls
  inside the slide but is not shrunk to fit.
- No slideshow (SL2) and no app-level Undo / Redo (the browser's own undo works inside the title and bullets). The Office
  ribbon, the Undo / Redo / Save / Print bar, the Hub title bar and printing / PDF come with SL4.
- Decks live in this browser's localStorage (about 5 MB for everything); use Export for backups or to move a deck.
- Touch drag was tested with emulated touch only, not yet on a real phone.
