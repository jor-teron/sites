/* Piano Basics PB1 — play-along tunes (all traditional / public domain), in easy keys around middle C.
   Format: space-separated notes, optional :beats (default 1), e.g. "G4:2". Add a song by adding a line here. */
window.PB = window.PB || {};
(() => {
  const P = window.PB;
  P.songs = [
    { id: 'sargam', name: 'Sa Re Ga Ma scale', icon: '\u{1F3B6}', bpm: 100, notes: 'C4 D4 E4 F4 G4 A4 B4 C5:2 C5 B4 A4 G4 F4 E4 D4 C4:2' },
    { id: 'twinkle', name: 'Twinkle Twinkle Little Star', icon: '\u2B50', bpm: 110, notes: 'C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2 C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2' },
    { id: 'mary', name: 'Mary Had a Little Lamb', icon: '\u{1F411}', bpm: 120, notes: 'E4 D4 C4 D4 E4 E4 E4:2 D4 D4 D4:2 E4 G4 G4:2 E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4:4' },
    { id: 'ode', name: 'Ode to Joy', icon: '\u{1F3BC}', bpm: 120, notes: 'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:0.5 D4:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:0.5 C4:2' },
    { id: 'jingle', name: 'Jingle Bells', icon: '\u{1F514}', bpm: 140, notes: 'E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4:1.5 D4:0.5 E4:4 F4 F4 F4:1.5 F4:0.5 F4 E4 E4 E4:0.5 E4:0.5 E4 D4 D4 E4 D4:2 G4:2' },
    { id: 'row', name: 'Row, Row, Row Your Boat', icon: '\u{1F6A3}', bpm: 110, notes: 'C4:1.5 C4:1.5 C4 D4:0.5 E4:1.5 E4 D4:0.5 E4 F4:0.5 G4:3 C5:0.5 C5:0.5 C5:0.5 G4:0.5 G4:0.5 G4:0.5 E4:0.5 E4:0.5 E4:0.5 C4:0.5 C4:0.5 C4:0.5 G4 F4:0.5 E4 D4:0.5 C4:3' }
  ];
  P.songNotes = s => s.notes.trim().split(/\s+/).map(t => { const p = t.split(':'); return { m: P.parse(p[0]), beats: p[1] ? +p[1] : 1 }; });
})();
