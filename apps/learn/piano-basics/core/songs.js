/* Piano Basics PB2 — play-along tunes (all traditional / public domain), in easy keys around middle C.
   Format: space-separated notes, optional :beats (default 1), e.g. "G4:2"; "R:1" is a rest. Add a song by adding a line here.
   left = optional easy left-hand part (one low bass note per bar, around C3), same format and the same total beats as notes.
   tags: 'indian' (Indian song or sargam practice), shown on the song card. Jana Gana Mana: first 4 lines (Tagore, 1911; public domain). */
window.PB = window.PB || {};
(() => {
  const P = window.PB;
  P.songs = [
    { id: 'sargam', name: 'Sa Re Ga Ma scale', icon: '\u{1F3B6}', bpm: 100, tags: ['indian'], notes: 'C4 D4 E4 F4 G4 A4 B4 C5:2 C5 B4 A4 G4 F4 E4 D4 C4:2' },
    { id: 'alankar1', name: 'Sargam steps: Sa Re Ga, Re Ga Ma', icon: '\u{1FA9C}', bpm: 100, tags: ['indian'],
      notes: 'C4 D4 E4 D4 E4 F4 E4 F4 G4 F4 G4 A4 G4 A4 B4 A4 B4 C5:2 C5 B4 A4 B4 A4 G4 A4 G4 F4 G4 F4 E4 F4 E4 D4 E4 D4 C4:2' },
    { id: 'alankar2', name: 'Sargam steps of four', icon: '\u{1FA9C}', bpm: 100, tags: ['indian'],
      notes: 'C4 D4 E4 F4 D4 E4 F4 G4 E4 F4 G4 A4 F4 G4 A4 B4 G4 A4 B4 C5:2 C5 B4 A4 G4 B4 A4 G4 F4 A4 G4 F4 E4 G4 F4 E4 D4 F4 E4 D4 C4:2' },
    { id: 'jana', name: 'Jana Gana Mana (opening)', icon: '\u{1F1EE}\u{1F1F3}', bpm: 90, tags: ['indian'],
      notes: 'C4 D4 E4 E4 E4 E4 E4 E4 E4:2 E4 E4 D4 E4 F4:2 ' +              // Jana gana mana adhinayaka jaya he
        'E4:2 E4 E4 D4:2 D4 D4 B3 D4 C4:2 ' +                               // Bharata bhagya vidhata
        'C4 G4 G4 G4 G4 G4 G4 G4 G4 G4 F4 A4 G4:2 ' +                       // Punjab Sindhu Gujarata Maratha
        'F4 F4 F4 E4 E4 E4 D4 F4 E4:2' },                                   // Dravida Utkala Banga
    { id: 'twinkle', name: 'Twinkle Twinkle Little Star', icon: '\u2B50', bpm: 110,
      notes: 'C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2 C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2',
      left: 'C3:4 F3:2 C3:2 F3:2 C3:2 G3:2 C3:2 C3:2 F3:2 C3:2 G3:2 C3:2 F3:2 C3:2 G3:2 C3:4 F3:2 C3:2 F3:2 C3:2 G3:2 C3:2' },
    { id: 'mary', name: 'Mary Had a Little Lamb', icon: '\u{1F411}', bpm: 120, notes: 'E4 D4 C4 D4 E4 E4 E4:2 D4 D4 D4:2 E4 G4 G4:2 E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4:4',
      left: 'C3:4 C3:4 G3:4 C3:4 C3:4 C3:4 G3:4 C3:4' },
    { id: 'hotcross', name: 'Hot Cross Buns', icon: '\u{1F35E}', bpm: 100, notes: 'E4 D4 C4:2 E4 D4 C4:2 C4:0.5 C4:0.5 C4:0.5 C4:0.5 D4:0.5 D4:0.5 D4:0.5 D4:0.5 E4 D4 C4:2',
      left: 'C3:4 C3:4 C3:2 G3:2 C3:4' },
    { id: 'ode', name: 'Ode to Joy', icon: '\u{1F3BC}', bpm: 120, notes: 'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:0.5 D4:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:0.5 C4:2',
      left: 'C3:4 G3:4 C3:4 G3:4 C3:4 G3:4 C3:4 G3:2 C3:2' },
    { id: 'jingle', name: 'Jingle Bells', icon: '\u{1F514}', bpm: 140, notes: 'E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4:1.5 D4:0.5 E4:4 F4 F4 F4:1.5 F4:0.5 F4 E4 E4 E4:0.5 E4:0.5 E4 D4 D4 E4 D4:2 G4:2',
      left: 'C3:4 C3:4 C3:4 C3:4 F3:4 C3:4 G3:4 G3:4' },
    { id: 'row', name: 'Row, Row, Row Your Boat', icon: '\u{1F6A3}', bpm: 110, notes: 'C4:1.5 C4:1.5 C4 D4:0.5 E4:1.5 E4 D4:0.5 E4 F4:0.5 G4:3 C5:0.5 C5:0.5 C5:0.5 G4:0.5 G4:0.5 G4:0.5 E4:0.5 E4:0.5 E4:0.5 C4:0.5 C4:0.5 C4:0.5 G4 F4:0.5 E4 D4:0.5 C4:3' },
    { id: 'london', name: 'London Bridge', icon: '\u{1F309}', bpm: 110, notes: 'G4:1.5 A4:0.5 G4 F4 E4 F4 G4:2 D4 E4 F4:2 E4 F4 G4:2 G4:1.5 A4:0.5 G4 F4 E4 F4 G4:2 D4:2 G4:2 E4 C4:3' },
    { id: 'frere', name: 'Brother John (Fr\u00E8re Jacques)', icon: '\u{1F514}', bpm: 110,
      notes: 'G4 A4 B4 G4 G4 A4 B4 G4 B4 C5 D5:2 B4 C5 D5:2 D5:0.5 E5:0.5 D5:0.5 C5:0.5 B4 G4 D5:0.5 E5:0.5 D5:0.5 C5:0.5 B4 G4 G4 D4 G4:2 G4 D4 G4:2' },
    { id: 'oldmac', name: 'Old MacDonald Had a Farm', icon: '\u{1F404}', bpm: 120, notes: 'G4 G4 G4 D4 E4 E4 D4:2 B4 B4 A4 A4 G4:3 D4 G4 G4 G4 D4 E4 E4 D4:2 B4 B4 A4 A4 G4:4' },
    { id: 'birthday', name: 'Happy Birthday', icon: '\u{1F382}', bpm: 100,
      notes: 'G4:0.75 G4:0.25 A4 G4 C5 B4:2 G4:0.75 G4:0.25 A4 G4 D5 C5:2 G4:0.75 G4:0.25 G5 E5 C5 B4 A4:2 F5:0.75 F5:0.25 E5 C5 D5 C5:3' },
    { id: 'saints', name: 'When the Saints Go Marching In', icon: '\u{1F3BA}', bpm: 130,
      notes: 'C4 E4 F4 G4:4 C4 E4 F4 G4:4 C4 E4 F4 G4:2 E4:2 C4:2 E4:2 D4:4 E4 E4 D4 C4:3 C4 E4 G4:2 G4 F4:3 E4 F4 G4:2 E4:2 C4:2 D4:2 C4:4' },
    { id: 'elise', name: 'F\u00FCr Elise (opening)', icon: '\u{1F3B9}', bpm: 120,
      notes: 'E5:0.5 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 A4:1.5 C4:0.5 E4:0.5 A4:0.5 B4:1.5 E4:0.5 G#4:0.5 B4:0.5 C5:1.5 ' +
        'E4:0.5 E5:0.5 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 A4:1.5 C4:0.5 E4:0.5 A4:0.5 B4:1.5 E4:0.5 C5:0.5 B4:0.5 A4:2' }
  ];
  const parse = str => (str || '').trim().split(/\s+/).filter(Boolean).map(t => { const p = t.split(':'); return { m: p[0] === 'R' ? null : P.parse(p[0]), beats: p[1] ? +p[1] : 1 }; });
  P.songNotes = s => parse(s.notes).filter(n => n.m != null);
  // every note with its start time in beats: [{ m, t, beats, hand: 'R' | 'L' }], sorted by time (right hand first at the same time)
  P.songEvents = (s, twoHands) => {
    const out = [];
    [['R', s.notes], ['L', twoHands ? s.left : '']].forEach(([hand, str]) => {
      let t = 0; parse(str).forEach(n => { if (n.m != null) out.push({ m: n.m, t, beats: n.beats, hand }); t += n.beats; });
    });
    return out.sort((a, b) => a.t - b.t || (a.hand === 'R' ? -1 : 1));
  };
  // steps for play-along: notes that start together are one step (both hands)
  P.songSteps = evs => { const st = []; evs.forEach(e => { const l = st[st.length - 1]; if (l && Math.abs(l.t - e.t) < 1e-6) l.notes.push(e); else st.push({ t: e.t, notes: [e] }); }); return st; };
  P.songBeats = s => parse(s.notes).reduce((a, n) => a + n.beats, 0);
})();
