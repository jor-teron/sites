/* Blood Group BG-2 — data and pure rules, no DOM. Attaches window.BG.
   BG.groups: the 8 groups in display order. BG.parse('AB-') -> { abo: 'AB', rh: '-' } (null if not a group).
   BG.antigens(g): markers on the red cell ('A', 'B', 'RhD'). BG.antibodies(g): ABO antibodies in the plasma ('anti-A', 'anti-B').
   BG.india: approximate share of each group in India in percent (varies by region).
   BG-2 (red cell transfusion): BG.canGive(donor, recipient) is true when every ABO marker of the donor is also on the recipient
   (O -> all, A -> A and AB, B -> B and AB, AB -> AB) and the donor is Rh negative or the recipient is Rh positive.
   BG.givesTo(g) / BG.receivesFrom(g): the groups in display order. BG.compatText(g, 'give' | 'receive'): one plain sentence.
   BG.donor: basic donation data for India (common rules - the blood bank decides): rules, why, steps. */
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
  // ---- BG-2: who can give red cells to whom ----
  function canGive(donor, recipient) {
    const d = parse(donor), r = parse(recipient);
    if (!d || !r || !d.rh || !r.rh) return false;
    const rAg = aboInfo[r.abo].antigens;
    return aboInfo[d.abo].antigens.every(a => rAg.includes(a)) && (d.rh === '-' || r.rh === '+');
  }
  function givesTo(g) { return parse(g) ? groups.filter(r => canGive(g, r)) : []; }
  function receivesFrom(g) { return parse(g) ? groups.filter(d => canGive(d, g)) : []; }
  function listText(list) {
    const n = list.map(name);
    return n.length < 2 ? n.join('') : n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1];
  }
  function compatText(g, mode) {
    const recv = mode === 'receive', list = recv ? receivesFrom(g) : givesTo(g);
    if (!list.length) return '';
    const who = list.length === groups.length ? 'all 8 groups' : (list.length === 1 ? 'only ' + listText(list) : listText(list) + ' (' + list.length + ' groups)');
    return name(g) + (recv ? ' can receive red cells from ' : ' can give red cells to ') + who + '.';
  }
  const donor = {
    rules: [
      { id: 'age',    title: 'Age 18 to 65',            text: 'Adults from 18 to 65 years old can usually give blood.' },
      { id: 'weight', title: 'At least 45 kg',          text: 'You need to weigh at least 45 kg for a 350 ml donation.' },
      { id: 'well',   title: 'Healthy and feeling well', text: 'No fever, cold or illness on the day you give.' },
      { id: 'hb',     title: 'Haemoglobin 12.5 or more', text: 'A quick finger-prick test checks for at least 12.5 g/dL.' },
      { id: 'gap',    title: 'Gap between donations',   text: 'At least 3 months (90 days) for men and 4 months (120 days) for women between whole-blood donations.' }
    ],
    gapDays: { men: 90, women: 120 }, minAge: 18, maxAge: 65, minKg: 45, minHb: 12.5,
    why: [
      { id: 'three',   title: 'Help up to 3 people', text: 'One donation is split into red cells, plasma and platelets, so it can help up to 3 people.' },
      { id: 'factory', title: 'It cannot be made',   text: 'Blood cannot be made in a factory. It only comes from people who give it.' },
      { id: 'refill',  title: 'Your body refills it', text: 'Your body replaces the plasma in about a day and the red cells in a few weeks.' }
    ],
    steps: [
      { title: 'Register and a quick check', text: 'Fill a short form. Staff check your weight, blood pressure and haemoglobin with a finger-prick.' },
      { title: 'Give blood',                 text: 'You lie back and relax. It takes about 8 to 10 minutes and gives about 350 to 450 ml.' },
      { title: 'Rest and a snack',           text: 'Rest for 10 to 15 minutes and have a drink and a snack.' },
      { title: 'Take it easy today',         text: 'Drink extra water and avoid heavy exercise for the rest of the day.' }
    ]
  };
  W.BG = { ABO, groups, aboInfo, rhInfo, india, parts, parse, antigens, antibodies, rhPositive, name, indiaTotal, byCommon,
    canGive, givesTo, receivesFrom, compatText, donor };
})(window);
