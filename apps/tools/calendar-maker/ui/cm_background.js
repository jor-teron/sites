/* Calendar Maker CM13 ui: sheet background (CM2): soft colour, picture, faintness, holiday list strip.
   Picture background: downscaled to <= 1600 px JPEG and kept as a data URL in 'calendar-maker-bg'. */
(function () {
  'use strict';
  const CM = window.CM, P = CM.P, S = CM.Settings, SOFTS = CM.Theme.SOFTS;
  const $ = (id) => document.getElementById(id);

  $('softs').innerHTML = SOFTS.map((c) => '<button type="button" data-v="' + c + '" style="background:' + c +
    '" aria-label="' + c + '"></button>').join('');
  $('softs').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return; P.soft = b.dataset.v; CM.save(); CM.render();
  });
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
  const saved = S.loadBg();
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
        if (!S.saveBg(url)) {
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
    const msg = 'The background picture will be removed from this device.';
    if (!(await window.UiDialog.confirm('Remove picture?', msg, 'Remove', true))) return;
    S.clearBg();
    CM.bgImg = null; CM.render();
  };
  /* Download PDF moved to ui/cm_design_page.js + render/cm_pdf.js (CM13) */
  CM.render();
})();
