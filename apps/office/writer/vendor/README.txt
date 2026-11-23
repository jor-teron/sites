Third-party libraries used by Writer (loaded locally; no CDN; works offline and from file://).

html-docx.js        html-docx-js 0.3.1 (npm dist/html-docx.js)     MIT  (LICENSE-html-docx-js.txt)  — DOCX export
html2canvas.min.js  html2canvas 1.4.1 (npm dist/html2canvas.min.js) MIT  (LICENSE-html2canvas.txt)   — page images for the PDF

jspdf.umd.min.js    jsPDF 2.5.1 (npm dist/jspdf.umd.min.js)        MIT  (LICENSE-jspdf.txt)
                    Kept in this folder for Invoice Maker (apps/tools/invoice-maker), which loads
                    ../../office/writer/vendor/jspdf.umd.min.js. Writer itself now loads
                    ../shared/vendor/jspdf.umd.min.js (HO16). The two files are identical.
