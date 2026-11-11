# Tables (TB1, TB2)

A simple database that looks and works like a spreadsheet. It is an easier alternative to Base. Base is a separate app and was not changed.

Plain HTML, CSS and JavaScript. No build, no libraries, no network. It works offline and from `file://`.

## 1. What it is

You keep several tables on this device. Each table is a tab. A table is a grid: columns have a type, rows are the records. It is meant for lists (people, stock, jobs), not for formulas.

## 2. Files

- `tables.html` — the app. `index.html` only redirects here (query and hash are kept).
- `tables.css` — layout. Dark by default; Light and Auto sit on the same variables the Office dialogs use.
- `tables.js` — the grid, tabs, filters and file buttons.
- `tables_model.js` — types, sort, filter, search, CSV and the save shape. No DOM, so Node can test it.
- `test-tb1.js` — `node test-tb1.js`.
- `test-tb2.js` — `node test-tb2.js`. Cards, links and the TB1 migration. No browser.
- `tables_icon.svg` — icon for the Office tiles page.
- `../shared/office-dialog.js` and `office-dialog.css` — in-app dialogs. Those shared files are not modified.

## 3. Behaviour

- **Tables.** Add, rename and delete. Delete asks first in a dialog. The last table can be deleted; you then get an empty hint and can add one.
- **Grid.** Click a cell and type. Enter commits and moves down, Tab moves across (Shift+Tab back), arrows move. Esc cancels the edit. Delete or Backspace clears the cell. On a Yes/No column, click or Space toggles the checkbox. A blank checkbox is “not set”; the first click sets Yes.
- **Rows.** + Row adds a blank row and starts editing it. Tick the row number to select rows (Shift extends the range). − Row deletes the ticked rows, or the active row if none are ticked. A row that has values asks first. An empty row is removed immediately.
- **Columns.** + Column asks for a name and a type. The type belongs to the whole column: Text, Number, Date, Yes/No, Choice or Link (TB2). The header shows the type. ⋯ renames, changes the type, edits Choice options, sets Link settings, or deletes the column. Changing a type clears values that no longer fit, and asks first when any would be cleared. Choice options are edited one per line, so a choice may contain a comma.
- **Invalid input.** A number, date or choice that does not fit gets a small note in the cell (“not saved”). The previous value stays. Empty input clears the cell.
- **Dates** are stored as `YYYY-MM-DD`. You can also type `DD/MM/YYYY`.
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

Automatic, on this device only, in `localStorage` under the key `tables-v1`. The saved object is version 1: tables, the active tab, and the theme (auto / light / dark). Auto follows the Hub theme (`sites-hub.theme`) when that is set, otherwise the device. If the saved text is damaged, Tables opens a blank table and leaves the old text in place until you edit. If storage is blocked or full, a banner says so and the tab still works until you close it.

To reset, delete the table or clear site data for this origin.

## 6. Keyboard and touch

- Arrows, Enter, Tab, Shift+Tab, Esc, F2, Delete, Backspace, Space (toggles Yes/No).
- Ctrl/Cmd+F focuses search.
- Buttons are at least 36px, and 44px in the grid. On a phone the toolbar wraps, the search takes a full row, and filter / column menus open as a sheet at the bottom. Inputs use a 16px font so the page does not zoom on focus.

## 7. Legacy notes

- **TB1 is the first release.** There was no older Tables save before TB1. The only storage key is still `tables-v1`. A future change that cannot be read as this shape should use a new key (for example `tables-v2`) and leave `tables-v1` in place.
- **TB2 did not add a new storage key.** TB1 rows already had stable ids. On load, any row that is missing an id is given one, and that id is kept on the next save. Link columns are extra fields on the same object. Opening a TB1 save does not delete it: the next edit writes the migrated rows back to `tables-v1`. There is no `tables-v2` key.
- **No `?v=` cache buster** on the stylesheet or scripts, and no app build number in the title. Some older Office apps still use `?v=` (Spreadsheet `?v=SH13`, Base `?v=BS9`). Tables does not.
- **Base was not edited.** Tables does not read or write Base’s IndexedDB (`office-base`). Moving data between them is a CSV export from one and import into the other.
- **Shared Office files were not edited.** Tables only uses the existing dialog helper. It does not use the ribbon, Quick Access bar or Hub title-bar bridge.
- **Hub catalog.** The Office tiles page reads `apps/office/office-apps.csv`, which has a Tables row. The Hub launcher’s generated files (`hub/core/hub_catalog.js`, `hub/core/hub_appindex.js`) are Hub-owned and were not changed in this release. Until Hub Main Bot regenerates them, Tables shows on the Office tiles page but not in the Hub’s own catalog.

## 8. Limits

No formulas, no undo, and no cloud sync. Filters, sort, the search text and the Grid/Cards choice are forgotten on reload. CSV is comma-separated only. Dates typed as `DD/MM/YYYY` are day-first. The grid and the cards paint 300 rows at a time; import stops at 5,000 data rows and 2 MB. Choice guessing only kicks in when a short value repeats (at least 4 cells, 6 different values or fewer). A picture and a file attachment are just text. A Link column (TB2) points at a record in this file; it is not a web address.

## 9. TB2 — Cards and linked tables

- **Cards.** Grid and Cards switch the current table. A card is one record, with each field’s name beside the value. Click or tap a card, or press Enter or Space, to open it. Arrow keys move between cards. On a phone the cards stack in one column. Search, column filters and sort apply to the cards the same way they apply to the grid (same list, blanks last).
- **Record panel.** This is an in-app panel, not a browser dialog. It edits every field with the same checks as the grid: a bad number, date, choice or link shows a note and the previous value stays. Previous and Next walk the records that the search, filters and sort currently show. Delete record asks with the shared Office dialog. New record opens the panel empty; Save adds the row. Close or Esc leaves the panel (Escape closes a link list first, if one is open).
- **Link columns.** The cell stores the other row’s id and shows that table’s first column. Pick from a searchable in-app list. Link settings can allow more than one record in the cell; several names are shown separated by commas. Search and filters on a Link column use that display text, not the id. In the record panel, Linked from lists records in other tables that point here. Click one to jump to it.
- **Keeping links consistent.** Deleting a record clears links that point at it. The confirm says so when any exist. Deleting a table clears links that point at its records, and the confirm says so too. Renaming a table or a column does not change stored ids, so the links still resolve. The display text follows whatever the first column says now. Changing a Link column’s table drops values that are not in the new table, and asks first when any would be cleared.
- **CSV.** Export writes the display text of a link. Import never creates a Link column: the import dialog does not offer Link, and a type of link is saved as text.
