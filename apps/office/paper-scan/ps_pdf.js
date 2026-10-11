/*
 * Paper Scan — ps_pdf.js  (own tiny PDF writer, no library)
 * PS.pdf.build(pages) → Blob 'application/pdf'. pages: [{jpeg: Uint8Array, w, h}].
 * One JPEG per page (/DCTDecode, DeviceRGB, 8 bit). A4 595×842 pt, portrait, or landscape
 * (842×595) when the image is wider than tall; image fitted and centred with a 0 pt margin.
 * Works in browsers and in Node (Blob + TextEncoder) for the synthetic test.
 */
(function (root) {
  'use strict';
  const PS = root.PS = root.PS || {};
  const enc = new TextEncoder();

  function build(pages) {
    const parts = [], offs = [];
    let len = 0;
    const put = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
    const obj = (n, body) => { offs[n] = len; put(n + ' 0 obj\n'); body(); put('\nendobj\n'); };

    const n = pages.length;
    // 1 catalog, 2 pages, then per page i: page 3+3i, image 4+3i, content 5+3i
    const total = 2 + 3 * n;
    put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'.replace(/[\u0080-\u00ff]/g, '~'));
    obj(1, () => put('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => put('<< /Type /Pages /Count ' + n + ' /Kids [' + pages.map((_, i) => (3 + 3 * i) + ' 0 R').join(' ') + '] >>'));
    pages.forEach((p, i) => {
      const land = p.w > p.h, PW = land ? 842 : 595, PH = land ? 595 : 842;
      const k = Math.min(PW / p.w, PH / p.h), dw = +(p.w * k).toFixed(2), dh = +(p.h * k).toFixed(2);
      const dx = +((PW - dw) / 2).toFixed(2), dy = +((PH - dh) / 2).toFixed(2);
      const pn = 3 + 3 * i;
      obj(pn, () => put('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW + ' ' + PH + '] /Resources << /XObject << /Im' + i + ' ' + (pn + 1) + ' 0 R >> /ProcSet [/PDF /ImageC] >> /Contents ' + (pn + 2) + ' 0 R >>'));
      obj(pn + 1, () => {
        put('<< /Type /XObject /Subtype /Image /Width ' + p.w + ' /Height ' + p.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + p.jpeg.length + ' >>\nstream\n');
        put(p.jpeg); put('\nendstream');
      });
      const cs = 'q ' + dw + ' 0 0 ' + dh + ' ' + dx + ' ' + dy + ' cm /Im' + i + ' Do Q';
      obj(pn + 2, () => put('<< /Length ' + cs.length + ' >>\nstream\n' + cs + '\nendstream'));
    });
    const xref = len;
    let x = 'xref\n0 ' + (total + 1) + '\n0000000000 65535 f \n';
    for (let i = 1; i <= total; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
    put(x + 'trailer\n<< /Size ' + (total + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    return new Blob(parts, { type: 'application/pdf' });
  }

  function fileName(d) {
    d = d || new Date();
    const z = (v) => String(v).padStart(2, '0');
    return 'paper-scan-' + d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes()) + '.pdf';
  }

  PS.pdf = { build, fileName };
  if (typeof module !== 'undefined') module.exports = PS.pdf;
})(typeof window !== 'undefined' ? window : globalThis);
