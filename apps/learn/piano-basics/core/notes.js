/* Piano Basics PB1 — notes as MIDI numbers (C4 = 60 = middle C). Names in letters (C, C#...) or Indian sargam
   (Sa Re Ga Ma Pa Dha Ni; lower case = komal, Ma' = tivra). Sa is movable: P.sa = 0..11 (0 = Sa on C, 2 = Sa on D...), and the computer keyboard map (by e.code, so any layout works):
   A S D F G H J K L ; ' = white keys from middle C, W E T Y U O P = the black keys between them. */
window.PB = window.PB || {};
(() => {
  const P = window.PB;
  const LET = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const SAR = ['Sa', 're', 'Re', 'ga', 'Ga', 'Ma', "Ma'", 'Pa', 'dha', 'Dha', 'ni', 'Ni'];
  P.isBlack = m => [1, 3, 6, 8, 10].indexOf(m % 12) >= 0;
  P.octave = m => Math.floor(m / 12) - 1;
  P.letter = m => LET[m % 12];
  P.sa = 0;
  P.sargam = m => SAR[(m - P.sa + 120) % 12];
  P.name = (m, style) => style === 'sargam' ? P.sargam(m) : P.letter(m);       // label shown on a key / in songs
  P.full = m => P.letter(m) + P.octave(m);                                     // e.g. C4
  P.freq = m => 440 * Math.pow(2, (m - 69) / 12);
  P.parse = s => { const r = /^([A-G]#?)(-?\d)$/.exec(s); return r ? LET.indexOf(r[1]) + (+r[2] + 1) * 12 : null; };
  P.letters = LET;
  P.whites = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

  const codes = { KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11,
    KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17 };
  P.keyToMidi = code => codes[code] == null ? null : 60 + codes[code];
  P.midiToKey = m => { for (const c in codes) if (60 + codes[c] === m) return c.replace('Key', '').replace('Semicolon', ';').replace('Quote', "'"); return ''; };
})();
