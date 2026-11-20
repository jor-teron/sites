/* Blood Group BG-1 — data and pure rules, no DOM. Attaches window.BG.
   BG.groups: the 8 groups in display order. BG.parse('AB-') -> { abo: 'AB', rh: '-' } (null if not a group).
   BG.antigens(g): markers on the red cell ('A', 'B', 'RhD'). BG.antibodies(g): ABO antibodies in the plasma ('anti-A', 'anti-B').
   BG.india: approximate share of each group in India in percent (varies by region). */
(function (W) {
  const ABO = ['O', 'A', 'B', 'AB'];
  const groups = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];
  const aboInfo = {
    A:  { antigens: ['A'],      antibodies: ['anti-B'],           note: 'A markers on the red cell. The plasma has anti-B.' },
    B:  { antigens: ['B'],      antibodies: ['anti-A'],           note: 'B markers on the red cell. The plasma has anti-A.' },
    AB: { antigens: ['A', 'B'], antibodies: [],                   note: 'Both A and B markers. The plasma has neither antibody.' },
    O:  { antigens: [],         antibodies: ['anti-A', 'anti-B'], note: 'No A or B markers. The plasma has both anti-A and anti-B.' }
  };
  const rhInfo = {
    '+': { name: 'Rh positive', marker: true,  note: 'The red cell has the RhD marker.' },
    '-': { name: 'Rh negative', marker: false, note: 'The red cell has no RhD marker.' }
  };
  // approximate, varies by region (percent of people in India)
  const india = { 'O+': 37, 'B+': 32, 'A+': 22, 'AB+': 7.5, 'O-': 0.7, 'B-': 0.4, 'A-': 0.3, 'AB-': 0.1 };
  const parts = [
    { id: 'red',    name: 'Red cells',   job: 'Carry oxygen from the lungs to every part of the body.',
      tip: 'Red cells are full of haemoglobin, which holds oxygen and makes blood red.' },
    { id: 'white',  name: 'White cells', job: 'Fight germs and help keep you well.',
      tip: 'There are far fewer white cells than red cells, but they hunt germs all over the body.' },
    { id: 'plate',  name: 'Platelets',   job: 'Help stop bleeding by forming a plug.',
      tip: 'Platelets are tiny bits of cells that stick together at a cut and help make a clot.' },
    { id: 'plasma', name: 'Plasma',      job: 'The yellow liquid that carries everything - about 55% of blood.',
      tip: 'Plasma is mostly water. It carries food, salts and the blood cells around the body.' }
  ];
  function parse(s) {
    const m = /^\s*(AB|A|B|O)\s*([+-]|pos|neg)?\s*$/i.exec(String(s == null ? '' : s).replace('\u2212', '-'));
    if (!m) return null;
    const rh = m[2] == null ? null : (m[2] === '+' || /pos/i.test(m[2]) ? '+' : '-');
    return { abo: m[1].toUpperCase(), rh };
  }
  function antigens(g) {
    const p = parse(g); if (!p) return [];
    const out = aboInfo[p.abo].antigens.slice();
    if (p.rh === '+') out.push('RhD');
    return out;
  }
  function antibodies(g) { const p = parse(g); return p ? aboInfo[p.abo].antibodies.slice() : []; }
  function rhPositive(g) { const p = parse(g); return !!(p && p.rh === '+'); }
  function name(g) { const p = parse(g); return p ? p.abo + (p.rh === '-' ? '\u2212' : p.rh || '') : ''; }
  function indiaTotal() { return groups.reduce((s, g) => s + india[g], 0); }
  function byCommon() { return groups.slice().sort((a, b) => india[b] - india[a]); }
  W.BG = { ABO, groups, aboInfo, rhInfo, india, parts, parse, antigens, antibodies, rhPositive, name, indiaTotal, byCommon };
})(window);
