/* Piano Basics PB2 — the on-screen piano. PB.makePiano({ onDown(m), onUp(m) }) returns { el, build(lo, octaves), light(m, cls), unlight(m, cls), clear(cls), labels(style) }.
   White keys fill the width; black keys sit on top. Pointer events with one entry per pointerId give multi-touch,
   and sliding a finger across keys plays each new key (glissando). touch-action: none stops the page from scrolling. */
window.PB = window.PB || {};
(() => {
  const P = window.PB;
  P.makePiano = opts => {
    const el = document.createElement('div'); el.className = 'pb-piano'; el.setAttribute('role', 'group'); el.setAttribute('aria-label', 'Piano keys');
    const keys = {}, down = {};                        // keys[m] = element; down[pointerId] = m
    let style = 'letters';
    const label = (k, m) => { k.querySelector('.pb-lab').textContent = style === 'off' ? (m % 12 === 0 && !P.isBlack(m) ? 'C' + P.octave(m) : '') : P.name(m, style); };
    function build(lo, octaves) {
      el.replaceChildren(); for (const m in keys) delete keys[m];
      const whites = [];
      for (let m = lo; m < lo + octaves * 12 + 1; m++) if (!P.isBlack(m)) whites.push(m);   // ends on the next C
      const ww = 100 / whites.length;
      whites.forEach((m, i) => add(m, 'pb-w', i * ww, ww));
      whites.forEach((m, i) => { if (m + 1 < lo + octaves * 12 && P.isBlack(m + 1)) add(m + 1, 'pb-b', (i + 1) * ww - ww * 0.3, ww * 0.6); });
    }
    function add(m, cls, left, width) {
      const k = document.createElement('div'); k.className = 'pb-key ' + cls + (m === 60 ? ' pb-mid' : ''); k.dataset.m = m;
      k.style.left = left + '%'; k.style.width = width + '%';
      const lab = document.createElement('span'); lab.className = 'pb-lab'; k.append(lab);
      const kb = P.midiToKey(m); if (kb) { const s = document.createElement('i'); s.className = 'pb-kb'; s.textContent = kb; k.append(s); }
      label(k, m); keys[m] = k; el.append(k);
    }
    const press = m => { const k = keys[m]; if (k) k.classList.add('pb-down'); opts.onDown(m); };
    const release = m => { const k = keys[m]; if (k) k.classList.remove('pb-down'); if (opts.onUp) opts.onUp(m); };
    const keyAt = (x, y) => { const t = document.elementFromPoint(x, y); const k = t && t.closest && t.closest('.pb-key'); return k && el.contains(k) ? +k.dataset.m : null; };
    el.addEventListener('pointerdown', e => {
      const m = keyAt(e.clientX, e.clientY); if (m == null) return;
      e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (er) { /* fine */ }
      down[e.pointerId] = m; press(m);
    });
    el.addEventListener('pointermove', e => {
      if (!(e.pointerId in down)) return;
      const m = keyAt(e.clientX, e.clientY);
      if (m != null && m !== down[e.pointerId]) { release(down[e.pointerId]); down[e.pointerId] = m; press(m); }
    });
    const up = e => { if (e.pointerId in down) { release(down[e.pointerId]); delete down[e.pointerId]; } };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', e => e.preventDefault());
    return {
      el, build, press, release,
      has: m => !!keys[m],
      light(m, cls) { const k = keys[m]; if (k) k.classList.add(cls || 'pb-next'); },
      unlight(m, cls) { const k = keys[m]; if (k) k.classList.remove(cls || 'pb-next'); },
      clear(cls) { el.querySelectorAll('.' + (cls || 'pb-next')).forEach(k => k.classList.remove(cls || 'pb-next')); },
      labels(s) { style = s; for (const m in keys) label(keys[m], +m); }
    };
  };
})();
