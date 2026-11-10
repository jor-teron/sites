# Invoice Maker (INV1)

Office app at `apps/office/invoice-maker/`. Make GST tax invoices, quotes, receipts and bills of supply on this device. Nothing is uploaded.

## What it does
- Business profile (name, address, GSTIN, phone, email, logo, signature, bank and UPI), saved locally.
- Client list with name, address, GSTIN and state.
- Auto numbering with a prefix and financial-year reset, for example `INV/2026-27/001` (the year starts on 1 April).
- Line items: description, HSN/SAC, quantity, unit, rate, discount (rupees) and GST % (0 / 5 / 12 / 18 / 28).
- Tax is CGST+SGST when the place of supply is the same state as the business, otherwise IGST. The total is rounded to the nearest rupee (optional) and written in Indian words (lakh / crore).
- Notes, terms and a due date.
- Live A4 preview with Classic, Modern and Minimal templates and an accent colour.
- Print, and Save as PDF (lazy-loads the jsPDF already vendored in Draftly; if that fails, use Print and choose Save as PDF).
- Optional UPI QR when a UPI ID is saved (lazy-loads `shared/vendor/qrcode.js`).
- History with search, Paid/Unpaid, duplicate, edit and delete (in-app confirm).
- JSON backup export/import, and CSV of the history.
- Auto / Light / Dark theme. Auto follows `sites-hub.theme`, else the device.

## Files
- `index.html` — redirect to `invoice-maker.html`
- `invoice-maker.html` / `invoice-maker.css` / `invoice-maker.js`
- `inv_calc.js` — pure helpers (GST, totals, words, FY numbers)
- `test_inv_calc.js` — `node test_inv_calc.js`
- `invoice-maker_icon.svg`

RELEASE, the `<title>` and `?v=` are INV1. No CDN. In-app dialogs only (`../shared/office-dialog.js`).

## Limits
- Plays no part in e-invoicing / IRN / e-way bills. This is a document you print or save, not a filing tool.
- jsPDF standard fonts have no rupee sign, so the PDF uses `Rs.` The on-screen preview and print use ₹.
- Logos are resized and stored as JPEG in localStorage; a very large history plus photos can fill the browser quota (the app warns if a save fails).
- UPI QR is skipped if the local qrcode library cannot be loaded.
- Main Builder still needs to regenerate `hub_catalog.js` / `hub_appindex.js` after this CSV row is pushed, before the app shows in the Hub menu.
