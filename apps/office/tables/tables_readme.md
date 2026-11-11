# Tables (TB1, TB2, TB4, HOT1)

A simple database that looks and works like a spreadsheet. It is an easier alternative to Base. Base is a separate app and was not changed.

Plain HTML, CSS and JavaScript. No build, no libraries, no network. It works offline and from `file://`.

## HOT1 — .hot files

`.hot` (Hub Office Tables) is the default native file. It is one UTF-8 JSON file, readable in a text editor, with no zip and no new library.

| Field | What it holds |
| --- | --- |
| `format` | `"hot"` |
| `version` | `1`. Any other version is refused. A `tables-v1` record is refused. |
| `name`, `created`, `updated` | File name and times |
| `activeId` | Which sheet tab is open |
| `settings` | Options that belong to the file. Version 1 keeps `theme` (`auto`, `light` or `dark`). Unknown keys are dropped. |
| `tables` | Every table, in sheet-tab order (see below) |

Each table holds `id`, `name`, `view` (`grid` or `cards`), `columns` and `rows`. A column holds `id`, `name`, `type` (text, number, date, yesno, choice, link), `width` (px, or `null` for the default; stored widths are 72–480), and for a choice the `options`, and for a link `linkTable` and `multiple`. A row holds a stable `id` and `cells` keyed by column id. A link cell stores the other row’s id (one id, or a list when the column allows several). Backlinks are not a second copy in the file: they are calculated from those ids when the file is opened, so Linked from comes back. Search text, column filters and sort are still for this tab only and are not in the file.

**Save** and **Save As** write `.hot`. **Open .hot**, or dropping a `.hot` on the page, restores that file. **Import CSV** and **Export CSV** are unchanged. CSV import still adds a table to the file that is open. It still does not create a Link column.

**In the Hub**, Save, Save As and autosave write the browser's Local drive, folder **Documents**. That is the same disk the Files app shows. Documents is created the first time a file is saved. Tables reopens the newest `.hot` in Documents when it starts inside the Hub. A double-click on a `.hot` in Files opens Tables on that file (the Hub id is still `tables`). Autosave waits 0.8 s after the last change. A blank new file (Table 1, the four starter columns, no rows, Grid, Auto theme) is not written until it has something in it, or you choose Save As.

**Outside the Hub**, Save uses the browser's save picker when the browser has one, and otherwise downloads the `.hot` file. Autosave outside the Hub continues only into a file you already picked. It does not download on each edit.

Ctrl+S saves. Ctrl+Shift+S is Save As. Name clashes and Save As use the in-app dialogs. There is no `alert`, `confirm` or `prompt`.

Drag the right edge of a column header to set that column’s width. The width is kept in the file. Grid and Cards are kept per table.

### Legacy (before HOT1)

The old native copy was `localStorage` key `tables-v1` (tables, the active tab, and the theme). TB2 and TB4 migrated older rows in place into that same key. Tables does not migrate that record and does not open it. The old load and save calls are still in the source, commented with `(before HOT1)`. `saveTo` and `loadFrom` stay in `tables_model.js`, so `test-tb1.js`, `test-tb2.js` and `test-tb4.js` can still round-trip that shape. The app does not call them. Import CSV and Export CSV still use the same readers.

## 1. What it is

You keep several tables on this device. Each table is a tab. A table is a grid: columns have a type, rows are the records. It is meant for lists (people, stock, jobs), not for formulas.

## 2. Files

- `tables.html` — the app. `index.html` only redirects here (query and hash are kept).
- `tables.css` — layout. Dark by default; Light and Auto sit on the same variables the Office dialogs use. TB4 copies the Spreadsheet grid variables into this file (cell size, header, selection, sheet tabs). Spreadsheet’s own CSS is not edited.
- `tables.js` — the grid, tabs, filters and file buttons.
- `tables_model.js` — types, sort, filter, search, CSV and the old `tables-v1` shape. No DOM, so Node can test it. (before HOT1) the app wrote that key from here.
- `tables_hot.js` (HOT1): `.hot` read/write, Hub Documents autosave, standalone picker or download.
- `../shared/office-native.js` (HOS1, reused): Hub Documents folder and the save picker, the same approach as HOW1 and HOS1.
- `test-tb1.js` — `node test-tb1.js`.
- `test-tb2.js` — `node test-tb2.js`. Cards, links and the TB1 migration. No browser.
- `test-tb4.js` — `node test-tb4.js`. Date parsing and display, the year-0001 case, old saves, date sort and filter, header labels. No browser.
- `test-hot1-format.js` — `node test-hot1-format.js`. Round-trip of a `.hot` file: several tables, column types, links and backlinks, views, widths. No browser.
- `tables_icon.svg` — icon for the Office tiles page.
- `../shared/office-dialog.js` and `office-dialog.css` — in-app dialogs. Those shared files are not modified.

## 3. Behaviour

- **Tables.** Add, rename and delete. Delete asks first in a dialog. The last table can be deleted; you then get an empty hint and can add one.
- **Grid.** Click a cell and type. Enter commits and moves down, Tab moves across (Shift+Tab back), arrows move. Esc cancels the edit. Delete or Backspace clears the cell. On a Yes/No column, click or Space toggles the checkbox. A blank checkbox is “not set”; the first click sets Yes.
- **Rows.** + Row adds a blank row and starts editing it. Tick the row number to select rows (Shift extends the range). − Row deletes the ticked rows, or the active row if none are ticked. A row that has values asks first. An empty row is removed immediately.
- **Columns.** + Column asks for a name and a type. The type belongs to the whole column: Text, Number, Date, Yes/No, Choice or Link (TB2). The header is one line, `Name (Type)`, for example `Due (Date)` or `date (Date)`. The type is smaller and lighter, on the same line. A long header ends in an ellipsis. Click the name to sort. ⋯ opens the column menu (filter, rename, type, choices, link settings, delete). Right-click or a long press on the name opens that same menu. Changing a type clears values that no longer fit, and asks first when any would be cleared. Choice options are edited one per line, so a choice may contain a comma.
- **Invalid input.** A number, date or choice that does not fit gets a small note in the cell (“not saved”). The previous value stays. Empty input clears the cell.
- **Dates** are edited as plain text, the same way a Spreadsheet cell is edited. There is no native date picker. That picker put the year in as `0001` (the cell showed `07/05/0001` and then “not saved”). Typed dates are stored as `YYYY-MM-DD` and shown in that same form, which is Spreadsheet’s Date format. Accepted text: `2026-11-11` (also `2026-1-2`, and a time after the date, which is dropped), `11/11/2026`, `2-1-2026`, `11.11.2026` (day first; if the month is greater than 12 and the day is 12 or less, the two are swapped, as in Spreadsheet), `11 Nov 2026`, `11 November 2026`, `7 May 2026`, `Nov 11, 2026`. A whole number on its own is an Excel serial, the same as Spreadsheet (`46336` is 2026-11-10). `2026` alone is that serial (1905-07-18), not the year 2026. The year must be 1000–9999. `07/05/0001` and `0001-05-07` are not saved, and they are not turned into 1901. An impossible day such as 30 February is rejected, not rolled over. Sort and filter use the real date.
- **Numbers** can include a leading minus and commas (`1,000`). They are stored as numbers.
- **Yes/No** accepts yes / no / true / false (and y / n) when a value is typed or imported. The digits 1 and 0 stay numbers, not checkboxes.
- **Search** (the box at the top, or Ctrl/Cmd+F) matches the current table only, in any column, ignoring case. Yes/No is matched as “Yes” or “No”.
- **Filters.** The ▾ on a column header filters that column. Text and Choice: contains, equals. Number and Date: contains, equals, greater than, less than. Yes/No: is checked, is not checked (No and blank both count as not checked). Filters combine with AND, and with the search. They are not saved; they last until you leave the tab or reload.
- **Sort.** Click the column name. First click is ascending, the next is descending. Blanks stay last either way. Sort is not saved.
- **Row count** sits in the footer: “12 rows”, or “3 of 12 rows” when a search or filter is on. A long table shows 300 rows at a time, with Earlier / Later for the rest. The count still includes every match.
- **Empty state.** A new database starts as “Table 1” with Name, Amount, Date and Done, and no rows, plus a short hint.

## 4. CSV

- **Export** downloads the current table (every row, not only the ones a filter shows). A field that contains a comma, a quote or a line break is wrapped in quotes, and quotes inside it are doubled. The file starts with a UTF-8 BOM so a spreadsheet app reads the letters correctly.
- **Import** creates a new table. The first row is the column names. Types are guessed (Yes/No words, dates, numbers, otherwise a short repeated list becomes Choice, otherwise Text). A dialog lets you rename the table and change any type before the table is created. A value that does not fit the type you picked is left blank and counted in the status line. At most 5,000 data rows are kept, and a file over 2 MB is refused.

## 5. Saving

<!-- (before HOT1): Automatic, on this device only, in `localStorage` under the key `tables-v1`. The saved object is version 1: tables, the active tab, and the theme (auto / light / dark). Auto follows the Hub theme (`sites-hub.theme`) when that is set, otherwise the device. If the saved text is damaged, Tables opens a blank table and leaves the old text in place until you edit. If storage is blocked or full, a banner says so and the tab still works until you close it. To reset, delete the table or clear site data for this origin. -->

**HOT1:** see the HOT1 section. Autosave is 0.8 s after the last change. In the Hub the file is `Documents/<name>.hot` on the Local drive. Outside the Hub, Save downloads or uses the save picker. Theme Auto still follows the Hub theme (`sites-hub.theme`) when that is set, otherwise the device. The theme is stored in the `.hot` file. To start again, delete the `.hot` file.

## 6. Keyboard and touch

- Arrows, Enter, Tab, Shift+Tab, Esc, F2, Delete, Backspace, Space (toggles Yes/No).
- Ctrl/Cmd+F focuses search.
- Buttons are at least 36px, and 44px in the grid. On a phone the toolbar wraps, the search takes a full row, and filter / column menus open as a sheet at the bottom. Inputs use a 16px font so the page does not zoom on focus.

## 7. Legacy notes

- **TB1 is the first release.** There was no older Tables save before TB1. The only storage key is still `tables-v1`. A future change that cannot be read as this shape should use a new key (for example `tables-v2`) and leave `tables-v1` in place.
- **TB2 did not add a new storage key.** TB1 rows already had stable ids. On load, any row that is missing an id is given one, and that id is kept on the next save. Link columns are extra fields on the same object. Opening a TB1 save does not delete it: the next edit writes the migrated rows back to `tables-v1`. There is no `tables-v2` key.
- **TB4 did not add a new storage key.** Dates were already `YYYY-MM-DD` inside `tables-v1`. An old save loads as before. A date that was stored as text in a date column (`11/11/2026`, `11 Nov 2026`) is read as ISO on load; the next edit writes that ISO back to `tables-v1`. Year `0001` was never stored (the native picker rejected it). There is no `tables-v2` key. Replaced code is commented with `(before TB4)` and was not deleted. Spreadsheet, Base, and `apps/office/shared/` were not edited.
- **HOT1 does not load `tables-v1`.** That was the owner’s decision: there is no migration and the old key is not opened. The load and save that used it are commented with `(before HOT1)` and were not deleted. `saveTo` / `loadFrom` stay for the TB1, TB2 and TB4 tests. The native file is `.hot` (see the HOT1 section). Replaced catalog lines are commented with `(before HOT1)` as well. No `?v=` was added. The Hub id stays `tables`.
- **No `?v=` cache buster** on the stylesheet or scripts, and no app build number in the title. Some older Office apps still use `?v=` (Spreadsheet `?v=SH13`, Base `?v=BS9`). Tables does not.
- **Base was not edited.** Tables does not read or write Base’s IndexedDB (`office-base`). Moving data between them is a CSV export from one and import into the other.
<!-- (before HOT1): - **Shared Office files were not edited.** Tables only uses the existing dialog helper. It does not use the ribbon, Quick Access bar or Hub title-bar bridge. -->
- **Shared Office files.** Tables uses the existing dialog helper and, since HOT1, `office-native.js` for the Documents folder and the save picker (a comment there names Tables; the helper’s behaviour is unchanged). It does not use the ribbon, Quick Access bar or Hub title-bar bridge. No new library was added.
- **Hub catalog.** The Office tiles page reads `apps/office/office-apps.csv`. HOT1 updates the Tables description there and in `hub/core/hub_catalog.js` and `hub/core/hub_appindex.js` (display only: the id, path and icon stay). A `.hot` double-click is registered in `shared/fs/filetypes.js`. Files already opens a `file: true` app with `FsRef.openIn`.

## 8. Limits

No formulas, no undo, and no cloud sync. Filters, sort and the search text are forgotten when you reload or open a file. The Grid/Cards choice, column widths and the theme are kept in the `.hot` file. CSV is comma-separated only. Dates typed as `DD/MM/YYYY` are day-first, matching Spreadsheet. A date with a month name needs a 4-digit year (`11 Nov 2026`, not `November 11`). Years before 1000 are refused, so `0001` cannot be stored. The grid and the cards paint 300 rows at a time; import stops at 5,000 data rows and 2 MB. Choice guessing only kicks in when a short value repeats (at least 4 cells, 6 different values or fewer). A picture and a file attachment are just text. A Link column (TB2) points at a record in this file; it is not a web address.

## 9. TB2 — Cards and linked tables

- **Cards.** Grid and Cards switch the current table. A card is one record, with each field’s name beside the value. Click or tap a card, or press Enter or Space, to open it. Arrow keys move between cards. On a phone the cards stack in one column. Search, column filters and sort apply to the cards the same way they apply to the grid (same list, blanks last).
- **Record panel.** This is an in-app panel, not a browser dialog. It edits every field with the same checks as the grid: a bad number, date, choice or link shows a note and the previous value stays. Previous and Next walk the records that the search, filters and sort currently show. Delete record asks with the shared Office dialog. New record opens the panel empty; Save adds the row. Close or Esc leaves the panel (Escape closes a link list first, if one is open).
- **Link columns.** The cell stores the other row’s id and shows that table’s first column. Pick from a searchable in-app list. Link settings can allow more than one record in the cell; several names are shown separated by commas. Search and filters on a Link column use that display text, not the id. In the record panel, Linked from lists records in other tables that point here. Click one to jump to it.
- **Keeping links consistent.** Deleting a record clears links that point at it. The confirm says so when any exist. Deleting a table clears links that point at its records, and the confirm says so too. Renaming a table or a column does not change stored ids, so the links still resolve. The display text follows whatever the first column says now. Changing a Link column’s table drops values that are not in the new table, and asks first when any would be cleared.
- **CSV.** Export writes the display text of a link. Import never creates a Link column: the import dialog does not offer Link, and a type of link is saved as text.

## 10. TB4 — Spreadsheet look and dates

- **Grid.** The sheet uses the same measurements as Spreadsheet: 13px Segoe UI, 30px rows, 1px cell borders, header background, a row-number gutter on the left (with the row tick box), and a 2px selection outline. The toolbar buttons and the sheet tabs along the bottom follow that app. Light and dark use the same colours. Cards are unchanged: Grid / Cards still switches the current table, and a card still opens the record panel.
- **Header.** One line, `Name (Type)`. Click sorts. ⋯, right-click, or a long press opens filter, rename, type and delete.
- **Dates.** Plain text in the grid and in the record panel. See the Dates bullet in section 3 for every accepted form. Display and storage are `YYYY-MM-DD`. `07/05/0001` is the old picker bug and is not saved.
