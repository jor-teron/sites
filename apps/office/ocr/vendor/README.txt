Third-party files used by the OCR app (all loaded locally; no CDN).

tesseract.min.js, worker.min.js        tesseract.js 5.1.1          Apache-2.0  (LICENSE-tesseract.js.txt)
tesseract-core-simd-lstm.wasm.js       tesseract.js-core 5.1.1     Apache-2.0  (LICENSE-tesseract.js-core.txt)
tesseract-core-lstm.wasm.js            (non-SIMD fallback for older browsers, e.g. iOS < 16.4)
lang/eng.traineddata.gz                @tesseract.js-data/eng 1.0.0, model 4.0.0_best_int (tessdata_best, integer)  Apache-2.0
pdf.min.js, pdf.worker.min.js          pdfjs-dist 3.11.174, legacy UMD build  Apache-2.0  (LICENSE-pdf.js.txt)
standard_fonts/                        pdfjs-dist 3.11.174 standard fonts (Foxit / Liberation, see their LICENSE files)
jszip.min.js                           JSZip 3.10.1                MIT or GPLv3 (LICENSE-jszip.txt)
peerjs.min.js                          PeerJS 1.5.4 (copy of /vendor/peerjs.min.js)  MIT — phone → computer transfer (QR send)
qrcode.js                              QR Code Generator, Kazuhiko Arase (copy of /vendor/qrcode.js)  MIT (header in file)
