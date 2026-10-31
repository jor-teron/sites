/* Calendar Maker CM2: Download PDF (jsPDF, bundled in vendor/, no network) + background + holiday list strip.
   The PDF holds the same 250 dpi sheet image as the preview / print, placed on one A4 portrait page.
   Picture background: downscaled to <= 1600 px JPEG and kept as a data URL in localStorage 'calendar-maker-bg'. */
(function () {
  'use strict';
  const CM = window.CM, P = CM.P, BKEY = 'calendar-maker-bg';
  const $ = (id) => document.getElementById(id);
  const SOFTS = ['#fef9e7', '#ecfdf5', '#eff6ff', '#fdf2f8', '#f5f3ff', '#f3f4f6'];

  $('softs').innerHTML = SOFTS.map((c) => '<button type="button" data-v="' + c + '" style="background:' + c + '" aria-label="' + c + '"></button>').join('');
  $('softs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; P.soft = b.dataset.v; CM.save(); CM.render(); });
  $('faint').oninput = () => { P.faint = +$('faint').value; CM.save(); CM.render(); };
  $('strip').onchange = () => { P.strip = $('strip').checked; CM.save(); CM.render(); };
  CM.onSync = () => {
    $('soft-row').hidden = P.bg !== 'soft';
    $('pic-row').hidden = P.bg !== 'pic';
    $('faint').value = P.faint;
    $('strip').checked = !!P.strip;
    $('pic-clear').disabled = !CM.bgImg;
    $('pic-pick').textContent = CM.bgImg ? 'Change picture…' : 'Choose picture…';
    document.querySelectorAll('#softs button').forEach((b) => b.classList.toggle('on', b.dataset.v === P.soft));
  };

  function useData(url) {
    const img = new Image();
    img.onload = () => { CM.bgImg = img; CM.render(); };
    img.src = url;
  }
  let saved = null;
  try { saved = localStorage.getItem(BKEY); } catch (_) { saved = null; }
  if (saved) useData(saved);

  $('pic-pick').onclick = () => $('pic-file').click();
  $('pic-file').onchange = () => {
    const f = $('pic-file').files[0]; $('pic-file').value = '';
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const url = c.toDataURL('image/jpeg', 0.82);
        try { localStorage.setItem(BKEY, url); } catch (_) {
          window.UiDialog.info('Picture not saved', [['Note', 'The picture is used now but is too big to keep for next time.']]);
        }
        useData(url);
      };
      img.onerror = () => window.UiDialog.info('Could not open picture', [['File', f.name]]);
      img.src = r.result;
    };
    r.readAsDataURL(f);
  };
  $('pic-clear').onclick = async () => {
    if (!CM.bgImg) return;
    if (!(await window.UiDialog.confirm('Remove picture?', 'The background picture will be removed from this device.', 'Remove', true))) return;
    try { localStorage.removeItem(BKEY); } catch (_) { /* */ }
    CM.bgImg = null; CM.render();
  };

  $('pdf').onclick = () => {
    const J = window.jspdf && window.jspdf.jsPDF;
    if (!J) { window.UiDialog.info('PDF not available', [['Reason', 'The PDF library did not load.']]); return; }
    const b = $('pdf'); b.disabled = true; b.textContent = 'Making PDF…';
    setTimeout(() => {
      try {
        const doc = new J({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
        doc.setProperties({ title: 'YEAR ' + P.year, creator: 'Calendar Maker' });
        doc.addImage(CM.sheetCanvas().toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
        doc.save('calendar-' + P.year + '.pdf');
      } catch (e) {
        window.UiDialog.info('PDF failed', [['Error', String(e && e.message || e)]]);
      }
      b.disabled = false; b.textContent = 'Download PDF';
    }, 30);
  };
  CM.render();
})();
