/*
 * Photo Editor v2 — pe_resize.js (PE5)
 * Resize the photo both ways (smaller and larger) from an in-app dialog: width / height in
 * pixels or percent, lock-aspect toggle, presets, current and new size, and a cap of
 * 4x the cropped photo or 8000 px on the longest side (whichever is smaller; also the
 * device's canvas limit). The resize is stored as an edit (e.k, see pe_transform.js), so it
 * is undone / redone like everything else and only rendered at full size on save.
 * Resampling: shrinking goes down in halving steps, enlarging up in 2x steps, both with
 * imageSmoothingQuality 'high' (smooth, but enlarging cannot add real detail).
 */
(function (PE) {
  'use strict';

  const R = PE.resize = { open: false };
  const S = PE.state, T = PE.transform;
  const cfg = () => PE.config.resize;
  const $ = (id) => document.getElementById(id);
  let unit = 'px', locked = true, nw = 0, nh = 0, cur = null, capNote = '';

  // ---------- resampling ----------
  // Each step changes each side by at most 2x, so the browser's smoothing never skips pixels.
  R.steps = (w, h, tw, th) => {
    const out = [];
    const next = (a, t) => (t < a ? Math.max(t, Math.ceil(a / 2)) : Math.min(t, a * 2));
    while (w !== tw || h !== th) { w = next(w, tw); h = next(h, th); out.push([w, h]); }
    return out;
  };
  R.resample = (src, tw, th) => {
    let c = src;
    const steps = R.steps(src.width, src.height, tw, th);
    steps.forEach((s, i) => {
      const n = document.createElement('canvas');
      n.width = s[0]; n.height = s[1];
      const x = n.getContext('2d', { willReadFrequently: i === steps.length - 1 });
      x.imageSmoothingEnabled = true;
      x.imageSmoothingQuality = 'high';
      x.drawImage(c, 0, 0, s[0], s[1]);
      if (c !== src) { c.width = 0; c.height = 0; }   // free the in-between step
      c = n;
    });
    return c;
  };

  // ---------- limits ----------
  R.limits = () => {
    const B = T.baseSize(), f = cfg().maxFactor, side = cfg().maxSide;
    return {
      maxW: Math.min(Math.round(B.w * f), side),
      maxH: Math.min(Math.round(B.h * f), side),
      maxPx: PE.io.limit().px,
      min: cfg().minSide
    };
  };
  // Clamp a wanted size to the limits; keeps the shape when the lock is on.
  R.clamp = (w, h, lock) => {
    const L = R.limits();
    w = Math.max(1, Math.round(w || 0)); h = Math.max(1, Math.round(h || 0));
    let capped = false;
    if (lock) {
      const f = Math.min(1, L.maxW / w, L.maxH / h, Math.sqrt(L.maxPx / (w * h)));
      if (f < 1) { capped = true; w = Math.max(1, Math.floor(w * f)); h = Math.max(1, Math.floor(h * f)); }
    } else {
      if (w > L.maxW) { w = L.maxW; capped = true; }
      if (h > L.maxH) { h = L.maxH; capped = true; }
      const f = Math.sqrt(L.maxPx / (w * h));
      if (f < 1) { capped = true; w = Math.floor(w * f); h = Math.floor(h * f); }
    }
    const small = w < L.min || h < L.min;
    if (small) { w = Math.max(L.min, w); h = Math.max(L.min, h); }
    return { w: w, h: h, capped: capped, small: small, L: L };
  };

  // Store a new output size (oriented, as shown) as the edit e.k.
  R.setSize = (w, h) => {
    if (!S.photo) return false;
    const e = S.edits, swap = T.swaps(e.m);
    const px = swap ? h : w, py = swap ? w : h;   // back to the photo's own axes
    const k = [px / e.crop.w, py / e.crop.h];
    if (Math.round(e.crop.w * k[0]) === e.crop.w) k[0] = 1;
    if (Math.round(e.crop.h * k[1]) === e.crop.h) k[1] = 1;
    return S.apply((ed) => { ed.k = k; }, 'geom');
  };

  // ---------- dialog ----------
  R.init = () => {
    const onTap = PE.ui.onTap;
    for (const u of ['px', 'pct']) onTap($('rs-u-' + u), () => { unit = u; R.render(); });
    onTap($('rs-lock'), () => {
      locked = !locked;
      if (locked) nh = Math.round(nw * cur.h / cur.w);
      R.render();
    });
    const pr = $('rs-presets');
    const add = (label, fn) => {
      const b = document.createElement('button');
      b.type = 'button'; b.tabIndex = -1; b.className = 'chip'; b.textContent = label;
      onTap(b, () => { fn(); R.render(); });
      pr.appendChild(b);
    };
    add('Original', () => { const B = T.baseSize(); nw = B.w; nh = B.h; locked = true; });
    for (const p of cfg().percents) add(p + '%', () => { nw = Math.round(cur.w * p / 100); nh = Math.round(cur.h * p / 100); locked = true; });
    for (const w of cfg().widths) add(w + ' w', () => { nw = w; nh = Math.round(w * cur.h / cur.w); locked = true; });
    const onInput = (which) => {
      const v = parseFloat($(which === 'w' ? 'rs-w' : 'rs-h').value);
      if (!isFinite(v) || v <= 0) return;
      const px = unit === 'pct' ? (which === 'w' ? cur.w : cur.h) * v / 100 : v;
      if (which === 'w') { nw = Math.round(px); if (locked) nh = Math.round(nw * cur.h / cur.w); }
      else { nh = Math.round(px); if (locked) nw = Math.round(nh * cur.w / cur.h); }
      R.render(which);
    };
    $('rs-w').addEventListener('input', () => onInput('w'));
    $('rs-h').addEventListener('input', () => onInput('h'));
    for (const id of ['rs-w', 'rs-h']) {
      $(id).addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); R.apply(); }
        else if (ev.key === 'Escape') { ev.preventDefault(); R.close(); }
      });
      $(id).addEventListener('blur', () => R.render());    // tidy the numbers after typing
    }
    onTap($('rs-cancel'), () => R.close());
    onTap($('rs-apply'), () => R.apply());
    onTap($('dlg-resize'), (ev) => { if (ev && ev.target === $('dlg-resize')) R.close(); });
  };

  R.show = () => {
    if (!S.photo) return;
    if (PE.crop.active) PE.crop.apply();
    cur = T.outputSize();
    nw = cur.w; nh = cur.h; unit = 'px'; locked = true;
    R.open = true;
    $('dlg-resize').hidden = false;
    R.render();
  };
  R.close = () => {
    if (!R.open) return;
    R.open = false;
    $('dlg-resize').hidden = true;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    PE.ui.sync();
  };

  // skip: the field being typed in is left alone
  R.render = (skip) => {
    if (!R.open) return;
    const c = R.clamp(nw, nh, locked);
    const fmt = (v, base) => (unit === 'pct' ? String(Math.round(v / base * 1000) / 10) : String(v));
    if (skip !== 'w') $('rs-w').value = fmt(nw, cur.w);
    if (skip !== 'h') $('rs-h').value = fmt(nh, cur.h);
    $('rs-unit-w').textContent = $('rs-unit-h').textContent = unit === 'pct' ? '%' : 'px';
    $('rs-u-px').classList.toggle('sel', unit === 'px');
    $('rs-u-pct').classList.toggle('sel', unit === 'pct');
    $('rs-lock').classList.toggle('sel', locked);
    $('rs-lock').setAttribute('aria-pressed', locked ? 'true' : 'false');
    $('rs-lock').title = locked ? 'Aspect locked (tap to unlock)' : 'Aspect unlocked (tap to lock)';
    $('rs-cur').textContent = cur.w + ' × ' + cur.h;
    const pct = Math.round(c.w / cur.w * 100);
    $('rs-new').textContent = c.w + ' × ' + c.h + ' (' + pct + '%' + (c.w > cur.w || c.h > cur.h ? ', larger' : (c.w < cur.w || c.h < cur.h ? ', smaller' : '')) + ')';
    capNote = c.capped ? 'Capped at the largest allowed size (max ' + c.L.maxW + ' × ' + c.L.maxH + ': 4× or 8000 px, whichever is smaller)'
      : (c.small ? 'Smallest allowed side is ' + c.L.min + ' px' : '');
    $('rs-cap').textContent = capNote;
    $('rs-cap').hidden = !capNote;
    R.state = { nw: nw, nh: nh, out: c, unit: unit, locked: locked, cur: cur };
  };

  R.apply = () => {
    if (!R.open) return;
    const c = R.clamp(nw, nh, locked);
    R.close();
    if (c.w === cur.w && c.h === cur.h) return;
    if (R.setSize(c.w, c.h)) PE.ui.toast('Resized to ' + c.w + '×' + c.h + (c.capped ? ' (capped)' : ''), 2200);
  };
})(window.PE);
