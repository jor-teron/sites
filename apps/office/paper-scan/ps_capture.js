/*
 * Paper Scan — ps_capture.js
 * 'Camera' (file input, capture=environment, multiple) and 'Photos' (picker, multiple).
 * PS.capture.init(onFiles) ; PS.capture.retake() → Promise<File|null> (one photo, camera).
 * Only image/* files pass; others are reported and skipped.
 */
(function () {
  'use strict';
  const PS = window.PS = window.PS || {};
  const $ = (id) => document.getElementById(id);
  const images = (list) => Array.from(list || []).filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|gif|bmp)$/i.test(f.name));

  function init(onFiles) {
    const wire = (btn, input) => {
      $(btn).addEventListener('click', () => { input.value = ''; input.click(); });
      input.addEventListener('change', () => {
        const all = Array.from(input.files || []), ok = images(all);
        if (all.length && ok.length < all.length) PS.ui.status('Skipped ' + (all.length - ok.length) + ' file(s) that are not photos');
        if (ok.length) onFiles(ok);
      });
    };
    wire('cam', $('in-cam'));
    wire('pick', $('in-pick'));
  }

  function retake() {
    return new Promise((res) => {
      const input = $('in-retake');
      input.value = '';
      const f = () => { input.removeEventListener('change', f); res(images(input.files)[0] || null); };
      input.addEventListener('change', f);
      input.click();
    });
  }

  PS.capture = { init, retake };
})();
