# Code Maker — QR1

Make QR codes, barcodes and other 2D codes on the device. Offline, works from file:// and http. Connectivity → Share.

- **QR types:** Text, Website link, Wi-Fi (`WIFI:T:..;S:..;P:..;H:true;;`, `\ ; , : "` escaped), Contact (vCard 3.0), Phone (`tel:`), SMS (`SMSTO:num:msg`), Email (`mailto:` + subject/body), Location (`geo:lat,lng`, "Use my location"), Calendar event (VEVENT), UPI (`upi://pay?pa=&pn=&am=&cu=INR&tn=`).
- **Barcodes:** EAN-13, EAN-8, UPC-A, ITF-14 (type the number without the check digit and it is added; a wrong check digit shows the right one), Code 128 (ASCII), Code 39 (A-Z 0-9 space - . $ / + %), Codabar (A-D start/stop added if missing; bwip `rationalizedCodabar`).
- **Other 2D:** Data Matrix, PDF417, Aztec.
- **Options:** size, QR error correction L/M/Q/H, colours, margin (modules), label under the code, QR centre logo (forces ECC H; logo ≈5% of the area plus a background pad).
- **Output:** PNG, SVG (bwip vector + label/logo), Copy (PNG via ClipboardItem; falls back to the text), Share (Web Share, only shown when supported), Print (N copies grid, `@media print`).
- **Storage (localStorage):** `code_maker_history` (last 30; Save, open, ✕ delete, Clear), `code_maker_last` (form restored on open), `code_maker_theme` (System/Light/Dark; System follows the Hub's `sites-hub.theme`, else Light).
- **Self-check:** with `BarcodeDetector` (Chrome Android/macOS) a "Scans OK" badge shows when the QR reads back; otherwise skipped silently.
- **Files:** `code-maker.html`, `code-maker.css`, `code-maker_types.js` (one entry per type: fields + build/validate), `code-maker.js` (UI, render, output, history), `vendor/bwip-js-min.js` (bwip-js 4.11.4, MIT, `vendor/bwip-js_LICENSE.txt`). No `?v=` cache strings (NV1).
