# Expense Tracker (EXT1)

Offline spending and income tracker. No libraries, no network. Amounts are in rupees with Indian grouping (1,23,456.00).

- Files: `expense-tracker.html`, `expense-tracker.css`, `expense-tracker.js` (RELEASE = 'EXT1', `?v=EXT1`), `ex_core.js` (pure helpers, node-testable), `index.html` redirect, `expense-tracker_icon.svg`, `test_ex_core.js` (`node test_ex_core.js`).
- Storage: localStorage `expense-tracker-v1`. Writes are guarded; a toast is shown if a save fails. Auto theme follows `sites-hub.theme` (else the device setting).
- Add an expense or income: amount, category, date (default today), note, payment mode (Cash, UPI, Card, Bank).
- Default Indian expense categories: Food, Groceries, Transport, Fuel, Bills, Rent, Shopping, Health, Education, Entertainment, Other. Default income categories: Salary, Business, Interest, Other income. All are editable (name, emoji, colour).
- List grouped by day, with search and filters (month, category, mode). Edit an entry, or delete it after an in-app confirm. Deleting a generated recurring entry does not bring it back.
- Month summary: income, spent and balance. A monthly budget overall and per category, with a progress bar and an over-budget warning.
- Charts drawn on canvas, no libraries: a category donut and daily spending bars for the month.
- Recurring monthly entries (rent, bills, salary) are added automatically on their date once it has arrived. A 31st becomes the last day of shorter months.
- CSV export and import (Date, Type, Amount, Category, Note, Mode). JSON backup and restore (restore replaces what is on this device).
- In-app dialogs only (no `alert` / `confirm` / `prompt`). Everything stays on this device.

Limits: only the formats the CSV importer understands (ISO dates or DD/MM/YYYY); there is no cloud sync; charts and filters show one month at a time; a deleted recurring occurrence is remembered so it is not added again.
