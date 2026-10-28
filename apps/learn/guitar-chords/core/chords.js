/* Guitar Chords GC1 — music data, no drawing. Standard tuning E A D G B E. String 0 = low E (thickest) ... 5 = high e.
   A chord: f = fret per string (-1 = muted X, 0 = open O), n = finger per string (1 index .. 4 little, 0 = none),
   barre = { fret, from, to } (one finger 1 pressing several strings). All chords fit inside frets 1-5. */
window.GC = window.GC || {};
(() => {
  const G = window.GC;
  G.open = [40, 45, 50, 55, 59, 64];                     // MIDI notes of the open strings: E2 A2 D3 G3 B3 E4
  G.stringName = ['E', 'A', 'D', 'G', 'B', 'e'];
  G.FRETS = 5;
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  G.noteName = m => NAMES[m % 12];
  G.freq = m => 440 * Math.pow(2, (m - 69) / 12);
  const fr = s => s.split('').map(c => c === 'x' ? -1 : +c);
  const fi = s => s.split('').map(Number);
  // id, shown name, long name, group, frets (low E to high e), fingers, extra
  const C = (id, name, full, grp, f, n, more) => Object.assign({ id, name, full, grp, f: fr(f), n: fi(n) }, more || {});
  G.groups = [{ id: 'easy', name: 'Easy open chords' }, { id: 'seven', name: 'Seventh chords' }, { id: 'more', name: 'More and barre chords' }];
  G.chords = [
    C('em', 'Em', 'E minor', 'easy', '022000', '023000', { tip: 'The easiest chord: two fingers, strum all six strings.' }),
    C('e', 'E', 'E major', 'easy', '022100', '023100'),
    C('am', 'Am', 'A minor', 'easy', 'x02210', '002310', { tip: 'Same shape as E, moved one string over. Skip the low E.' }),
    C('a', 'A', 'A major', 'easy', 'x02220', '001230', { tip: 'Three fingers squeezed in a row on fret 2.' }),
    C('d', 'D', 'D major', 'easy', 'xx0232', '000132', { tip: 'Strum only the four thin strings.' }),
    C('dm', 'Dm', 'D minor', 'easy', 'xx0231', '000231'),
    C('c', 'C', 'C major', 'easy', 'x32010', '032010', { tip: 'A stretch at first: ring finger on the A string, fret 3.' }),
    C('g', 'G', 'G major', 'easy', '320003', '210003'),
    C('fe', 'F', 'F major (easy)', 'easy', 'xx3211', '003211', { barre: { fret: 1, from: 4, to: 5 }, tip: 'Easy F: one finger flat across the two thinnest strings.' }),
    C('e7', 'E7', 'E seven', 'seven', '020100', '020100'),
    C('a7', 'A7', 'A seven', 'seven', 'x02020', '002030'),
    C('d7', 'D7', 'D seven', 'seven', 'xx0212', '000213'),
    C('g7', 'G7', 'G seven', 'seven', '320001', '320001'),
    C('c7', 'C7', 'C seven', 'seven', 'x32310', '032410'),
    C('b7', 'B7', 'B seven', 'seven', 'x21202', '021304', { tip: 'Uses all four fingers. Great for songs in E.' }),
    C('em7', 'Em7', 'E minor seven', 'more', '020000', '020000'),
    C('am7', 'Am7', 'A minor seven', 'more', 'x02010', '002010'),
    C('fmaj7', 'Fmaj7', 'F major seven', 'more', 'xx3210', '003210'),
    C('fb', 'F', 'F major (barre)', 'more', '133211', '134211', { barre: { fret: 1, from: 0, to: 5 }, tip: 'Full barre: finger 1 presses all six strings at fret 1. It takes practice!' }),
    C('bm', 'Bm', 'B minor (barre)', 'more', 'x24432', '013421', { barre: { fret: 2, from: 1, to: 5 }, tip: 'Barre at fret 2 from the A string, then an Am shape on top.' })
  ];
  G.byId = {}; G.chords.forEach(c => { G.byId[c.id] = c; });
  G.note = (s, f) => G.open[s] + f;                       // MIDI note on string s at fret f
  G.lowFret = c => Math.min(...c.f.filter(x => x > 0));   // lowest pressed fret = the fret position shown
  G.shapeText = c => c.f.map(x => x < 0 ? 'x' : x).join('');
})();
