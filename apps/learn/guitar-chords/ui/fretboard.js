/* Guitar Chords GC1 — the code-drawn neck (one SVG, no images). Strings run across, high e on top, low E at the bottom
   (as you see it looking down at your own guitar). Left: O/X marks and the nut, then frets 1-5, then the strum zone.
   Touch: tap a fret to play that note, tap or slide over strings in the strum zone to play the shown chord string by
   string (a fast swipe = a strum). Several fingers work at once (pointer events). lefty mirrors it left-right.
   GC.makeBoard({ onPlay(s, fret) }) returns { el, show(chord, opts), mark(s, fret), lefty(bool) }. */
window.GC = window.GC || {};
(() => {
  const G = window.GC, NS = 'http://www.w3.org/2000/svg';
  const W = 620, H = 210, NUT = 58, FW = 74, END = NUT + FW * G.FRETS, SY = 178, SS = 29;   // layout in viewBox units
  const el = (tag, a, txt) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); if (txt != null) e.textContent = txt; return e; };
  const sy = s => SY - s * SS;                                    // string y
  const fx = f => NUT + (f - 0.5) * FW;                            // centre of fret f

  G.makeBoard = (opts) => {
    let left = false, chord = null, hideNames = false;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'gc-board', role: 'img', 'aria-label': 'Guitar neck' });
    const X = x => left ? W - x : x;                                // mirror for left-handed players
    function draw() {
      svg.replaceChildren();
      svg.append(el('rect', { x: X(left ? END : NUT), y: 14, width: END - NUT, height: SY - sy(5) + 32, rx: 4, class: 'gc-wood' }));
      const hx = END + 92; svg.append(el('circle', { cx: X(hx), cy: (SY + sy(5)) / 2, r: 62, class: 'gc-hole' }));
      svg.append(el('text', { x: X(hx), y: H - 4, class: 'gc-zl' }, 'strum here'));
      [3, 5].forEach(f => svg.append(el('circle', { cx: X(fx(f)), cy: (SY + sy(5)) / 2, r: 6, class: 'gc-inlay' })));
      for (let f = 0; f <= G.FRETS; f++) svg.append(el('line', { x1: X(NUT + f * FW), x2: X(NUT + f * FW), y1: 14, y2: SY + 18, class: f ? 'gc-fret' : 'gc-nut' }));
      for (let f = 1; f <= G.FRETS; f++) svg.append(el('text', { x: X(fx(f)), y: H - 4, class: 'gc-fn' }, String(f)));
      for (let s = 0; s < 6; s++) {
        svg.append(el('line', { x1: X(NUT - 8), x2: X(W - 4), y1: sy(s), y2: sy(s), class: 'gc-str', 'data-s': s, 'stroke-width': 3.4 - s * 0.45 }));
        svg.append(el('text', { x: X(10), y: sy(s) + 5, class: 'gc-sn' }, G.stringName[s]));
      }
      if (!chord) return;
      if (chord.barre) { const b = chord.barre; svg.append(el('rect', { x: X(fx(b.fret)) - 13, y: sy(b.to) - 13, width: 26, height: sy(b.from) - sy(b.to) + 26, rx: 13, class: 'gc-barre' })); }
      chord.f.forEach((f, s) => {
        if (f <= 0) { svg.append(el('text', { x: X(NUT - 22), y: sy(s) + 6, class: 'gc-ox ' + (f ? 'gc-x' : 'gc-o') }, f ? '\u2715' : 'O')); return; }
        const g = el('g', { class: 'gc-dot', 'data-s': s });
        g.append(el('circle', { cx: X(fx(f)), cy: sy(s), r: 12 }), el('text', { x: X(fx(f)), y: sy(s) + 5 }, hideNames ? '' : String(chord.n[s] || '')));
        svg.append(g);
      });
    }
    function mark(s, f) {                                          // short flash where a note was played
      const x = f === 'z' ? X(END + 30) : f === 0 ? X(NUT - 22) : X(fx(f));
      const c = el('circle', { cx: x, cy: sy(s), r: 9, class: 'gc-hit' }); svg.append(c); setTimeout(() => c.remove(), 260);
      const str = svg.querySelector(`.gc-str[data-s="${s}"]`); if (str) { str.classList.remove('gc-ring'); void str.getBBox(); str.classList.add('gc-ring'); }
    }
    // ---- touch / mouse ----
    const pt = e => { const m = svg.getScreenCTM().inverse(); return { x: m.a * e.clientX + m.c * e.clientY + m.e, y: m.b * e.clientX + m.d * e.clientY + m.f }; };
    const where = e => {
      const p = pt(e), x = left ? W - p.x : p.x, s = Math.round((SY - p.y) / SS);
      if (s < 0 || s > 5 || Math.abs(SY - s * SS - p.y) > SS / 2) return null;
      if (x >= END + 4) return { s, zone: 1 };
      return { s, f: x < NUT ? 0 : Math.min(G.FRETS, Math.ceil((x - NUT) / FW)) };
    };
    const play = w => {
      const f = w.zone ? (chord ? chord.f[w.s] : 0) : w.f;
      if (f < 0) { mark(w.s, 'z'); return; }                         // muted string in this chord: no sound
      mark(w.s, w.zone ? 'z' : f); opts.onPlay(w.s, f, !!w.zone);
    };
    const down = {};                                               // pointerId -> last string
    svg.addEventListener('pointerdown', e => { e.preventDefault(); svg.setPointerCapture && svg.setPointerCapture(e.pointerId); const w = where(e); down[e.pointerId] = w ? w.s + (w.zone ? 'z' : w.f) : '-'; if (w) play(w); });
    svg.addEventListener('pointermove', e => {
      if (!(e.pointerId in down)) return;
      const w = where(e); if (!w) return; const k = w.s + (w.zone ? 'z' : w.f);
      if (k !== down[e.pointerId]) { down[e.pointerId] = k; play(w); }   // slid onto a new string (or fret)
    });
    const up = e => { delete down[e.pointerId]; };
    svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
    draw();
    return {
      el: svg, mark,
      show(c, o) { chord = c; hideNames = !!(o && o.noFingers); draw(); },
      lefty(v) { left = !!v; draw(); }
    };
  };
})();
