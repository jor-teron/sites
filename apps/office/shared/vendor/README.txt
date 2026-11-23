Third-party libraries shared by Hub Office apps (loaded locally from this folder; no CDN; works offline and from file://).

jspdf.umd.min.js    jsPDF 2.5.1 (npm dist/jspdf.umd.min.js)        MIT  (LICENSE-jspdf.txt)         — PDF download (Writer, Sketchbook)
jsQR.js             jsQR 1.4.0 (npm dist/jsQR.js)                 Apache-2.0  (jsQR.LICENSE)       — camera QR fallback (Print, Paper Scan)
qrcode.js           QR Code Generator, Kazuhiko Arase             MIT (header in file)             — station / send-from-phone QR (Print, OCR)

Writer still keeps a copy of jspdf.umd.min.js in apps/office/writer/vendor/ for Invoice Maker (apps/tools/invoice-maker). Writer itself loads the copy in this folder (HO16).
