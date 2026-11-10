# Hub Office Slides (Office → Hub Office) — release SL5
<!-- legacy: release SL4 · release SL3 · release SL2 -->

A basic slide editor. Static, no build step, no libraries, works from `file://`. Built to stay light on a Celeron / 4 GB
laptop: only the slide being edited is live (contenteditable title and body, plus any free text boxes), thumbnails are
the same slide design scaled down (up to 9 bullets each), saving is debounced (400 ms) and one deck is one localStorage
record. Pictures (SL3) are kept in IndexedDB, so the deck record stays small. SL5 stores formatted text as structured
runs (not raw HTML).

## Use
- **Slide list**: on the left (a strip on top on phones, ≤ 760 px). Numbered thumbnails show the title and bullets.
  Click to select; ↑/↓ (←/→ in the strip), Home/End in the focused list; Enter goes to the title.
- **Add**: ＋ Slide (or Ctrl+Enter) adds a blank slide **after** the current one and puts the cursor in its title.
- **Reorder**: ▲ / ▼ in the top bar (or Alt+↑/↓ in the list, or the ⋯ menu), or **drag** a thumbnail
  (mouse: press and move; touch: hold for about ⅓ s, then move; a quick swipe still scrolls the strip).
- **Delete**: only in the ⋯ menu (red **Delete slide…**), and it always asks with an in-app dialog that starts on Cancel.
  There is no Delete-key shortcut on the slide list. A deck keeps at least one slide. ⋯ also has Duplicate slide.
- **Editing**: each slide is a 16:9 canvas (960 × 540 design pixels, scaled to fit). Title on top (Enter / ↓ goes to the
  bullets). Body: one paragraph per line. Tab indents the line(s) one level, Shift+Tab (or Backspace at the start) outdents,
  Enter keeps the indent and Enter on an empty indented bullet outdents it.
- **Text styling (SL5)**: bold, italic, underline, strikethrough, font size (presets plus A− / A+, Ctrl+Shift+> / <),
  text colour, highlight, and left / centre / right alignment. Home has a Format group; on a text selection a small
  floating bar also appears. Ctrl+B / I / U while typing. Paste is plain text, or HTML run through a strict sanitiser
  (only b/i/u/s/span colours and sizes, and paragraphs). Formatting is stored as runs, never as unsanitised HTML.
- **Lists (SL5)**: a per-box toggle for bullets, numbers (1. 2. 3.; nested a. b., then i. ii.) or none. Title + Content
  and Two Columns default to bullets; Title / Section Header / Picture + Caption body text defaults to none.
- **Free text boxes (SL5)**: Insert → Text box (or ⋯) adds a box you can put anywhere on any layout. Drag to move, use
  the same 8 handles as pictures to resize (Shift keeps the shape). Double-click or Enter (when selected) to type.
  Delete, optional fill and border, and bring forward / send back (z-order with pictures). A slide holds a `texts`
  array (50 boxes max).
- **Rich text (SL5)**: the title, body / bullets, subtitle / caption and free text boxes are rich text, not plain
  textareas. **Home** has a Format group: **B** / **I** / **U** / **S** (strikethrough), font size (a list, plus A− / A+
  or Ctrl+Shift+< / >), text colour, highlight, align left / centre / right (Ctrl+L / E / R), list type (• bullets, 1. 2. 3.
  with a. b. c. on the next level, or none) and **Tx** Clear formatting. A small floating toolbar appears when you select
  text. Ctrl+B / I / U work while typing. Paste is sanitised (plain text, or a strict allowlist of tags mapped to the
  model); pasting a picture still works as in SL3.
- **Decks**: the deck name (top left) opens the deck menu: New deck, Open deck… (list of decks on this device),
  Rename deck…, Import .hslides…, Export .hslides, Delete deck… (red, in-app confirm). Slides reopens the last deck.
  Dropping a .hslides file on the window imports it too.
- **Auto-save**: every change saves 400 ms later and right away when you switch slide or deck, or the page is hidden or closed.
  The top bar shows Saving… / Saved. If storage is missing, full or blocked, Slides keeps working in memory and shows a
  warning banner (like Base BS3a); then use Export before closing.
- **Present (SL2)**: ▶ Present in the top bar shows the deck full screen from the current slide; the deck menu has
  **Present from start** and **Present from this slide**. Keys: **F5** = from the start, **Shift+F5** or **P** (when not
  typing in the title or bullets) = from this slide. F5 never reloads the page here.
  - Full screen uses the browser's Fullscreen API. Where that is missing or refused (iPhone Safari, some app views) the
    show opens as a black overlay over the whole page instead; everything else works the same.
  - The slide is 16:9, as large as fits, centred on black (letterbox / pillarbox). Long bullets wrap.
  - Next: → ↓ Space Page Down Enter N, a tap or click on the right two-thirds, a swipe to the left.
    Previous: ← ↑ Page Up Backspace P, a tap on the left third, a swipe to the right. Home / End = first / last slide.
    Type a slide number and press Enter to jump there (the counter shows "Go to 5" while you type; the number is dropped
    after 3 s or any other key).
  - After the last slide a black screen says "End of slideshow, tap or press to exit": ← goes back, a tap or any other key exits.
  - **Esc** (or ✕) ends the show and returns to the editor on the slide that was shown last. Leaving full screen with the
    browser's own controls ends the show too.
  - The slide counter (bottom left) and the small ‹ › ✕ buttons (bottom right) show when the slide changes or the mouse /
    finger moves and fade after 2 s; the mouse pointer hides with them.
  - While presenting, the screen is kept awake with the Screen Wake Lock API when the browser has it (asked again when you
    come back to the tab, released when the show ends). Without it, the device's own sleep timer applies.
  - Light on purpose: only the shown slide is in the page (drawn by the same renderer as the thumbnails), no animations,
    no loops; the editor underneath is hidden while the show is open.
- **Layouts (SL3)**: seven layouts: Title, Title + Content (the default, the SL1 / SL2 slide), Two Columns, Section Header,
  Picture + Caption, Title Only, Blank. **▦ Layout** (or ⋯ → Layout…) changes the current slide; **▾** next to ＋ Slide
  (or ⋯ → New slide with layout…) adds a slide with a layout. ＋ Slide / Ctrl+Enter adds one with the current slide's
  layout (after Title or Section Header: Title + Content). The picker is an in-app sheet with live previews (arrows,
  Enter, Esc).
  - Changing the layout keeps the text where it fits: the right column of Two Columns is added under the left one when
    the new layout has one text box; text that the new layout has no box for (e.g. bullets on Title Only) is kept,
    hidden, and comes back when you pick a layout that has the box (a toast says so).
  - Title, Section Header and Picture + Caption have a plain text box (subtitle / caption, no bullet dots).
- **Pictures (SL3)**: **🖼 Picture** (or ⋯ → Insert picture…, or a click on the Picture + Caption placeholder) picks a
  file; you can also **paste** an image (Ctrl+V; while typing in a text box, text on the clipboard wins) or **drop** one on
  the window (it lands where you drop it on the slide). On Picture + Caption the first picture fills the placeholder;
  elsewhere it is centred at up to 60 % of the slide.
  - Click a picture to select it: drag to move, drag one of the 8 handles to resize (hold **Shift** to keep the shape).
    The bar under the slide has **Crop to fill** (fills its frame, the default) / **Fit** (whole picture inside the frame),
    **Original shape** and **🗑 Delete**. Keys with a picture selected (not while typing): **Delete** / Backspace deletes it,
    arrows nudge 1 px (Shift = 10), Esc deselects.
  - Pictures are made smaller on insert: the long side is at most **1920 px**; saved as WebP (JPEG where the browser
    can't), or **PNG when the picture has transparency**. A smaller original that needs no scaling is kept as it is. Files
    over 40 MB are refused with a message.
- **Themes (SL3)**: **🎨 Theme** (or ⋯ → Theme…) picks the deck theme, **Light** (the SL1 / SL2 look, the default) or
  **Dark**: background, title and body fonts and colours, and an accent (title rule, bullet dots). It applies to every
  slide. The same sheet has **This slide's background**: Theme (default), 9 colours or any colour, for the current slide only.
  More themes can be added later (one CSS rule + one entry, see below).
- **Undo / Redo (SL3, SL5)**: Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z) outside the text boxes, or ⋯ → Undo / Redo, for pictures
  (insert, move, resize, crop / fit, delete), **free text boxes** (add, move, resize, delete) and **formatting** (SL5),
  plus layouts, backgrounds and the theme (50 steps, per deck; going to the slide it changed). Inside the title and text
  boxes the browser's own text undo works as before for typing.
- **Free text boxes (SL5)**: **Insert → Text box** (or ⋯) adds a box to any slide, including Blank. Click to select it,
  drag to move, drag a handle to resize (Shift keeps the shape), arrows nudge (Shift = 10), Delete removes it, double-click
  or Enter edits the text, Esc ends editing then deselects. Boxes sit above pictures. Up to 50 per slide.
- **Present** shows layouts, themes, backgrounds, pictures and SL5 styling / text boxes exactly as the editor (the same
  CSS and the same placement; one renderer).
- **Ribbon (SL4, SL5)**: the shared Office ribbon (`../shared/office-ribbon.js`, like Draftly and Spreadsheet). **File** = the
  deck menu (New, Open, Rename, Import, Export .hslides, **Export PDF…**, **Print…**, Settings, Delete deck). Tabs:
  - **Home**: ＋ New slide | ▾ (with a layout), ▦ Layout, **Format** (SL5: bold / italic / underline / strikethrough, size,
    colour, highlight, align, lists, clear), Duplicate, Delete slide (asks), ▲ / ▼, Undo, Redo
  - **Insert**: 🖼 Picture, **Aa Text box** (SL5), New slide with layout…
  - **Design**: deck theme **Light / Dark**, **Slide background…**
  - **Slide Show**: **From beginning**, **From current slide**
  The last tab is remembered. The deck name next to the tabs renames the deck. **⋯** at the end of the ribbon keeps
  every slide action (also Present from start / this slide and Export PDF) — on phones it is the main menu; the ribbon
  scrolls sideways and shows icons only.
- **Quick Access bar (SL4, HO1)**: Undo, Redo, Save, Print left of File (`../shared/office-quick.js`), with **Ctrl+Z**,
  **Ctrl+Y** / Ctrl+Shift+Z, **Ctrl+S** (saves now, shows **✓ Saved**) and **Ctrl+P** (the Slides print, not the
  browser's page print). Undo / Redo are the app undo (SL3); inside a text box Ctrl+Z stays the browser's text undo.
  Inside the Hub the buttons move to the Hub window title bar (H49 `hubTitleBar` protocol, `../shared/office-hubbar.js`);
  the Hub app bar gets the tabs and the deck name (`slides_hub.js`, `hub-app` protocol).
- **Print / Export PDF (SL4)**: one 16:9 page per slide (10 × 5.625 in, no margins), with pictures, the theme and
  backgrounds, drawn by the same renderer as Present. **Print** opens the browser's print window. **Export PDF** shows a
  short in-app hint, then the same print window: choose **Save as PDF** as the printer (the file name is the deck name).
  No PDF library is loaded (light on a Celeron); turn on "Background graphics" if a browser prints white slides.
- **Settings (⚙)**: Theme System / Light / Dark (dark is the default; System follows the Hub's `sites-hub.theme`, then the
  device), storage state, keyboard list (with the Present keys) and About. In-app dialogs only. SL2 adds no new setting.

## The .hslides file (open format, version 3 since SL5)
SL5 writes version 3 and reads versions 1, 2 and 3. A file with a higher version than the app knows is refused with a message.
Version 3 keeps the version-2 shape so a plain (unstyled) deck still has a string `title` and `{ text, level }` bullets, and
adds the rich-text and free-box fields, all optional (a missing field = plain text / no boxes):
- `title` stays a string; if the title is styled, `titleRuns` is `[{ "text", "b", "i", "u", "s", "size", "color", "hl" }]`
  and `titleAlign` is `"left"` | `"center"` | `"right"`. A title written as a document `{ "paragraphs": [...] }` is also accepted.
- `bullets` / `bullets2` stay `[{ "text", "level" }]`. A bullet may add `runs` (same shape as `titleRuns`) and `align`.
- `list` / `list2`: `"bullets"` | `"numbers"` | `"none"` (missing = bullets, or none on Title / Section Header / Picture + Caption).
  Numbered lists show 1. 2. 3. at level 0 and a. b. c. at the next level.
- `align` / `align2`: `"left"` | `"center"` | `"right"` for the whole box when every paragraph shares it.
- `texts`: `[{ "id", "x", "y", "w", "h", "bullets", "list", "align", "fill", "border", "z" }]`, 50 per slide max, in 960 × 540
  design pixels. `textboxes` and `tboxes` are accepted as aliases on import. `fill` / `border` are optional `#rrggbb`.
- Unknown keys are ignored. Export always writes version 3. An SL4 app refuses version-3 files ("newer version").

Version 2 (SL3 / SL4) adds, all optional (a missing field = the SL1 / SL2 default):
- top level `theme`: `"light"` | `"dark"` (missing or unknown = light)
- per slide `layout`: `title` | `tc` | `two` | `sec` | `pic` | `to` | `blank` (missing or unknown = `tc`, Title + Content);
  `bullets2` (right column of Two Columns, same shape as `bullets`); `background`: `"#rrggbb"` (missing = the theme's);
  `pictures`: `[{ "src": "data:image/webp;base64,…", "x", "y", "w", "h", "iw", "ih", "fit": "cover" | "contain" }]`
  with x / y / w / h in 960 × 540 design pixels (pictures may hang off the slide edge), iw / ih = the stored bitmap size.
  `src` must be a PNG / JPEG / WebP / GIF data URL under 16 MB; anything else is dropped. 50 pictures per slide max.
- Import limit is now 40 MB (legacy 5 MB). Note: an SL2 app refuses version-2 files ("newer version"); SL3 files
  without pictures could be saved for SL2 by changing `version` to 1 (layouts / themes are then ignored).

Version 1 (SL1 / SL2):
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
- `format` must be `"hub-slides"`. `version` is 1 (SL3 / SL4 write 2, SL5 writes 3); a file with a higher version than the app knows is refused with a message.
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
- `slides-deck-v1:<id>` = `{ id, name, created, updated, cur, slides: [{ id, title, body }] }`; a legacy `body` is the bullet text,
  one bullet per line, a leading TAB = level 1. SL5 migrates those strings to rich documents on load (plain runs, nothing dropped).
- SL3 adds to the deck record `fmt: 3` and `theme`, and per slide `layout`, `body2`, `bg` and `pics: [{ id, key, x, y, w, h,
  iw, ih, fit, inl }]`. SL1 / SL2 records (no `fmt`) open unchanged: Light, Title + Content, no pictures.
- SL5 uses `fmt: 4`. In memory, `title` / `body` / `body2` are rich documents (`{ paragraphs:[{ runs, level, align, list }] }`);
  a plain string on an older record is migrated on load, nothing is dropped. `texts` (also kept as `tboxes` for the editor)
  holds free text boxes. Pictures may have `z`.
- SL5 writes `fmt: 4`. `title`, `body` and `body2` are documents `{ paragraphs:[{ runs:[{ text, b, i, u, s, size, color, hl }],
  level, align, list }] }`. `texts` (also kept as `tboxes`) is `[{ id, x, y, w, h, doc, fill, border, z }]`. Older fmt 3 / no-fmt
  records open unchanged.
- Pictures: IndexedDB `hub-slides-pics`, store `pics`, key = content hash of the data URL, value `{ src, at }`. The deck
  record keeps only the key. If IndexedDB is missing or fails, the picture stays inside the record (`inl: true`, the
  data URL in `src`) — then localStorage can fill up sooner. On start (after 4 s) pictures that no deck uses any more and
  that are older than a day are removed.
- Adding a theme: one entry in `SLSave.THEMES` (`slides_save.js`) and one `.slide.th-<id>{…}` rule in `slides.css`
  setting the variables `--s-bg --s-tc --s-fg --s-acc --s-mut --s-ph --s-em --s-ft --s-fb --s-tw --s-line`.

## Files
- `slides.html`, `slides.css`, `index.html` (redirect), `slides_icon.png` (192 px), `slides_readme.md`
- `slides_text.js` (`SLText`, SL5): the rich-text model (runs + paragraphs, not raw HTML), paste sanitising, `.hslides` v3 helpers. No DOM (safe to test in Node).
- `slides_save.js` (`SLSave`): settings + theme, deck list, decks, debounced auto-save, memory fallback; SL5 migrates plain text on load
- `slides_file.js` (`SLFile`): .hslides export / import and checks (writes v3, reads v1–v3)
- `slides_edit.js` (`SLEdit`): the scaled 16:9 slide, contenteditable title / body / text boxes, Tab / Shift+Tab, layouts (placeholders),
  picture and text-box select / move / resize / crop, and `SLEdit.html()` + `SLEdit.paint()`, the one static slide renderer used by
  the thumbnails, the pickers, Present and Print
- `slides_pics.js` (`SLPics`, SL3): picture decode, downscale and re-encode, IndexedDB store, blob URLs, clean-up
- `slides_show.js` (`SLShow`, SL2): Present: full screen / overlay, fit, keys, taps, swipes, jump, end screen, idle fade, wake lock
- `slides_list.js` (`SLList`): thumbnails, selection, drag to reorder
- `slides_print.js` (`SLPrint`, SL4): the print view (#print, one page per slide) and print / PDF
- `slides_hub.js` (`SLHub`, SL4): Hub app-bar bridge (tabs, deck name, File, Settings)
- `slides_app.js`: top bar, ribbon, Format group + mini toolbar, Quick Access bar wiring, menus, decks, dialogs, settings, keys, Present buttons, layout / theme pickers, picture and text-box insert
  (file / paste / drop), undo / redo; `window.Slides` (helpers for tests)

## Limits (SL1 – SL5)
- Long text can run past the bottom of the slide; it scrolls
  inside the slide but is not shrunk to fit.
- Present: no transitions, speaker notes, presenter view, second-screen output or timer; text that runs past the bottom
  of a slide is cut off in the show (it is not shrunk). Tested headless with emulated touch and a stubbed wake lock only.
- App Undo / Redo covers pictures, text boxes (add / move / resize / delete), formatting, layouts, backgrounds and the theme;
  typing uses the browser's undo inside each box. Applying a format from the ribbon re-renders the box, so the browser's
  typing undo for that box may start fresh; Ctrl+Z outside the box undoes the format.
- Pictures live in IndexedDB on this device: another device only gets them through Export / Import. Animated GIFs become
  still pictures. Thumbnails draw the full stored picture (fine for normal decks; a deck with very many large pictures
  uses more memory). Pictures cannot be rotated, layered (front / back) or cropped to a custom area.
- Two deck themes in SL3 (Light, Dark); no custom fonts.
<!-- legacy (SL4): Rich text, numbered lists and free text boxes come with SL5. -->
- PDF goes through the browser's print window ("Save as PDF"); there is no one-click PDF download. Ctrl+Z with nothing
  to undo does nothing (the ⋯ / ribbon buttons are greyed out). Printing was tested headless (page.pdf), not on a real printer.
- Rich text is a simple model (bold / italic / underline / strikethrough, size, colour, highlight, align, list). It does not
  carry fonts, tables or links. Web paste is sanitised; some source formatting will be dropped on purpose. Numbered lists
  restart after a non-numbered paragraph. A scanned look (text as a picture) is not OCR'd.
- Decks live in this browser's localStorage (about 5 MB for everything); use Export for backups or to move a deck.
- Touch drag was tested with emulated touch only, not yet on a real phone.
