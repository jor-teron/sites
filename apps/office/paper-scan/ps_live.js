/*
 * Paper Scan — ps_live.js  (live camera with an A4 frame)
 * PS.live.ok() → true if getUserMedia exists. PS.live.shoot() → Promise<File[]> (empty if closed).
 * Full-screen <video> (object-fit: contain) with an A4 portrait frame (1:1.414) drawn over it;
 * outside the frame is darkened. 📸 grabs the video pixels under the frame exactly (frame rect
 * mapped from screen px → video px) into a JPEG, so nothing is stretched. Several shots per
 * session; ✓ Done returns them. Each File gets .a4 = true (already cropped → full corners).
 */
(function () {
  'use strict';
  const PS = window.PS = window.PS || {};
  const A4 = 1.414, FILL = 0.92;   // frame height / width ; share of the visible video it uses
  let el = null, stream = null, shots = [], resolveFn = null;

  const ok = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  function build() {
    el = document.createElement('section');
    el.className = 'ps-live'; el.hidden = true;
    el.innerHTML = '<video playsinline muted autoplay></video><div class="ps-frame"></div>' +
      '<div class="ps-live-bar"><button type="button" class="ps-btn ghost" data-a="x">✕ Close</button>' +
      '<button type="button" class="ps-btn primary ps-shut" data-a="s" aria-label="Take photo">📸</button>' +
      '<button type="button" class="ps-btn" data-a="d">✓ Done <b>0</b></button></div>';
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      if (b.dataset.a === 's') snap(); else finish(b.dataset.a === 'd' ? shots : []);
    });
    window.addEventListener('resize', place);
    el.querySelector('video').addEventListener('loadedmetadata', place);
  }

  // Screen rect of the frame and the matching rect in video pixels.
  function rects() {
    const v = el.querySelector('video'), vw = v.videoWidth, vh = v.videoHeight;
    if (!vw || !vh) return null;
    const cw = v.clientWidth, ch = v.clientHeight, k = Math.min(cw / vw, ch / vh);   // contain
    const dw = vw * k, dh = vh * k, dx = (cw - dw) / 2, dy = (ch - dh) / 2;
    let fw = dw * FILL, fh = fw * A4;
    if (fh > dh * FILL) { fh = dh * FILL; fw = fh / A4; }
    const fx = dx + (dw - fw) / 2, fy = dy + (dh - fh) / 2;
    return { screen: { x: v.offsetLeft + fx, y: v.offsetTop + fy, w: fw, h: fh },
      src: { x: (fx - dx) / k, y: (fy - dy) / k, w: fw / k, h: fh / k } };
  }
  function place() {
    const r = el && !el.hidden && rects(); if (!r) return;
    const s = r.screen, f = el.querySelector('.ps-frame');
    f.style.cssText = `left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px`;
  }

  function snap() {
    const r = rects(); if (!r) return;
    const v = el.querySelector('video'), s = r.src, c = document.createElement('canvas');
    c.width = Math.round(s.w); c.height = Math.round(s.w * A4);
    c.getContext('2d').drawImage(v, s.x, s.y, s.w, s.h, 0, 0, c.width, c.height);
    c.toBlob((b) => {
      if (!b) return;
      const f = new File([b], 'scan-' + Date.now() + '.jpg', { type: 'image/jpeg' }); f.a4 = true;
      shots.push(f); el.querySelector('[data-a="d"] b').textContent = shots.length;
      el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 150);
    }, 'image/jpeg', 0.92);
  }

  function finish(files) {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null; el.hidden = true;
    const r = resolveFn; resolveFn = null; if (r) r(files.slice());
  }

  async function shoot() {
    if (!el) build();
    shots = []; el.querySelector('[data-a="d"] b').textContent = '0';
    stream = await navigator.mediaDevices.getUserMedia({ audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } } });
    const v = el.querySelector('video'); v.srcObject = stream; el.hidden = false;
    await v.play().catch(() => {});
    place();
    return new Promise((res) => { resolveFn = res; });
  }

  PS.live = { ok, shoot, close: () => el && !el.hidden && finish([]), isOpen: () => !!(el && !el.hidden) };
})();
