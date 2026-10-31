# Calendar Maker

## 1. What it is
Design and print a one-sheet A4 year calendar: all 12 months on one A4 sheet (4 layouts), title "YYYY", big bold dates and holidays as filled tiles. Releases CM1 (design page + print), CM2 (Download PDF, background, holiday list strip), CM3 (Holidays page), CM4 (grid tables, year-only title, white default background, layouts), CM5 (fold 6th week, fill the sheet), CM6 (month name inside the grid, Sun-Sat weekday row in holiday colour, custom colour, font colour, tight title), CM7 (folded dates drawn as normal dates, all grid lines same weight), CM8 (uniform spreadsheet grid), CM9 (restricted holidays). Release label in the About line: CM9. Works offline and from file://.

## 2. Files
- `calendar-maker.html` / `calendar-maker.css`: pages (Design, Holidays), layout, light / dark, phone layout (options below the preview), print stylesheet
- `calendar-maker_render.js`: draws the A4 sheet on a canvas (`window.CMRender`), 2067 x 2923 px portrait or 2923 x 2067 px landscape = 250 dpi. Preview, Print and PDF all use this drawing
- `calendar-maker.js`: Design page logic and settings (`window.CM`)
- `calendar-maker_pdf.js`: CM2 Download PDF, background, holiday list strip
- `calendar-maker_holidays.js`: CM3 Holidays page (`window.CMHol`)
- `vendor/jspdf.umd.min.js` + `vendor/jspdf_LICENSE.txt`: jsPDF 4.2.1 (MIT), bundled, no CDN
- `calendar-maker_icon.png`, `index.html` (opens `calendar-maker.html`, keeps `?year=`)
- Shared: `../calendar/calendar_holidays.js` (built-in holidays, `window.CalHolidays`, loaded not copied), `../../../shared/dialog/` (in-app dialogs)

## 3. Behaviour rules
- **Design (landing page):** live A4 preview. Options: Year (prev / next / type; default the current year, or `?year=YYYY` from Calendar's "Make printable"), Holiday colour (Green default, Red, Yellow, Blue, Orange), Colour Sundays (On), Saturdays as holiday (None / 2nd & 4th / All; default from Calendar's settings), Week starts (Sunday / Monday; default from Calendar's settings).
- **Grid (CM4):** each month is its own bordered table: month name above, grey weekday header row, thin lines between every day cell (5 week rows with CM5 fold on, 6 when off; empty cells included). Holiday tiles fill their cell.
- **Title (CM4):** just the year, e.g. "2027".
- **Layout (CM4):** Portrait 3 columns x 4 rows (default), Portrait 2 x 6, Landscape 3 x 4, Landscape 4 x 3. Preview, Print (`@page` portrait / landscape) and PDF follow it. Saved as `layout` in `calendar-maker-settings`.
- **Background default (CM4):** White ("None") to save ink.
- **Print:** the sheet is drawn to an image and only that image is printed (`@page A4` portrait or landscape to match the layout, margin 0; the sheet has its own ~4 mm margins and prints at full A4, CM5).
- **Download PDF (CM2):** made on the device with jsPDF: one A4 page (portrait or landscape) holding the 250 dpi sheet as a JPEG. File `calendar-YYYY.pdf`.
- **Background (CM2):** None, Soft colour (6 pale colours) or Picture (your image, downscaled to 1600 px and kept in localStorage `calendar-maker-bg`; Faintness slider 5-60 %). With a picture the months sit on white cards so dates stay readable. Applies to preview, print and PDF.
- **Holiday list (CM2):** optional strip at the bottom with date + name in 3 columns (same date names joined with " / ").
- **Holidays page (CM3):** Every year (fixed date; starts from the Calendar list; add, change date, rename, delete, Restore defaults) and This year only (dated holidays for the Design page's year; add, change date, rename, delete). Saved in `calendar-maker-holidays` right away on every add / rename / date change / delete / restore, loaded before the first draw; built-ins are copied only the first time you edit, so deleted ones stay deleted. A damaged key falls back to the built-in list; if the browser blocks saving, an in-app note says changes last this visit only. Custom holidays stay in Calendar Maker; the Calendar app is unchanged.
- **Dialogs:** UiDialog only (no browser alert / confirm / prompt).
- **Storage:** `calendar-maker-settings`, `calendar-maker-holidays`, `calendar-maker-bg`. Theme follows the Calendar app (Dark default, System uses Hub pref `sites-hub.theme`).

## 4. Limits
- The PDF is one image (not selectable text); about 0.5-1.5 MB.
- Very long holiday names are cut with "…" in the strip; many holidays (40+) make the strip tall and the months smaller.
- A big picture may not fit in localStorage; it is then used for this visit only.
- **Fold 6th week (CM5):** default On. When a month needs 6 rows, its last dates (e.g. 30, 31) move into the empty leading cells of row 1 in the same weekday column, drawn smaller bottom-right under a thin diagonal; holiday/Sunday/Saturday tiles fill that lower-right half. Every month uses 5 rows. Saved as `fold` in `calendar-maker-settings` (missing = On). Off gives the plain 6-row grid.
- **Fill the sheet (CM5):** ~4 mm sheet margin, ~2.5 mm gaps between months, slimmer title band (120 px), months stretch to fill the rest in every layout, holiday strip only as tall as it needs, dates sized ~66% of cell height. Print image is full A4 (210x297 / 297x210 mm, `@page` margin 0); the PDF image is full A4.
- **Headers and colours (CM6):** title band fits the year tightly (110 px digits, ~1 mm gap below; was 130 px band). Each month's first grid row is the month name, merged and centred across all 7 columns, white with no fill, inside the border. Weekday row reads Sun Mon Tue Wed Thu Fri Sat (Mon first when the week starts Monday) on the holiday colour. Holiday colours are light print tints with black text: Green `#92d36e` (default), Red, Yellow, Blue, Orange, plus a Custom picker (`colour: 'custom'`, `custom: '#rrggbb'`). Font colour picker (`font`, default `#000000`) applies to title, month names, weekdays, dates, folded dates and the holiday strip. Both saved in `calendar-maker-settings`.
- **Design fixes (CM7):** folded 6th-week dates have no diagonal split or half tint; they are drawn at normal size and centred, and a holiday/Sunday/Saturday fills the whole cell. All grid lines in a month (outer border, under the month row, under the weekday row, between day cells) are `#333` 3 px, snapped to whole pixels (Excel 'All Borders').
- **Uniform grid (CM8):** the whole sheet is one spreadsheet-like grid. The month name row, weekday row, each date row and the gap between months all have the same row height; the 7 day columns and the gap between months all have the same column width (a month is 7 columns x 7 rows with the fold on, 8 rows with it off, gap = 1 cell). Cell size is the largest that fits inside the 4 mm margins, title band and holiday strip for the chosen layout. Month name, weekday labels and dates use one text size.
- **Restricted holidays (CM9):** every holiday (Every year and This year only) has a type, Gazetted (default) or Restricted, set with the type picker when adding and the chip on each row (tap to switch). Restricted rows are listed under a 'Restricted Holidays' heading below the main ones. Saved as `r: true` in `calendar-maker-holidays`; older saves and built-ins without it are Gazetted. On the sheet restricted dates get the Restricted colour (default light grey `#cfcfcf`, presets + custom, saved as `rcol` in `calendar-maker-settings`) with black text; if a date is both, Gazetted (holiday colour) wins; Sundays/Saturdays stay the holiday colour. The holiday list strip shows gazetted holidays first, then a 'Restricted Holidays' section, each in date order.
