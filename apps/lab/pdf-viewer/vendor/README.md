# Vendor: pdf.js

- Package: pdfjs-dist (Mozilla PDF.js)
- Version: 3.11.174
- Build: legacy / classic UMD (`pdf.min.js` + `pdf.worker.min.js`)
- Source: https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/
- License: Apache-2.0 (see `pdfjs/LICENSE`)

CMaps are not vendored here. Most Latin PDFs render fine without them.
CJK / special glyph maps can be added later under `pdfjs/cmaps/` if needed.
