/* Blood Group BG-3 — data and pure rules, no DOM. Attaches window.BG.
   BG.groups: the 8 groups in display order. BG.parse('AB-') -> { abo: 'AB', rh: '-' } (null if not a group).
   BG.antigens(g): markers on the red cell ('A', 'B', 'RhD'). BG.antibodies(g): ABO antibodies in the plasma ('anti-A', 'anti-B').
   BG.india: approximate share of each group in India in percent (varies by region).
   BG-2 (red cell transfusion): BG.canGive(donor, recipient) is true when every ABO marker of the donor is also on the recipient
   (O -> all, A -> A and AB, B -> B and AB, AB -> AB) and the donor is Rh negative or the recipient is Rh positive.
   BG.givesTo(g) / BG.receivesFrom(g): the groups in display order. BG.compatText(g, 'give' | 'receive'): one plain sentence.
   BG.donor: basic donation data for India (common rules - the blood bank decides): rules, why, steps.
   BG-3 (inheritance): A=AA/AO, B=BB/BO, O=OO, AB=AB; Rh+=DD/Dd, Rh-=dd. A and B are co-dominant, O is recessive, Rh+ is dominant.
   BG.aboGenos(abo) / BG.rhGenos(rh): possible genotypes for a group. BG.aboPheno(geno) / BG.rhPheno(geno): group from a genotype.
   BG.punnett(g1, g2): a 2x2 Punnett square ({ rows, cols, cells }). BG.childABO(a, b) / BG.childRh(r1, r2): possible types
   when the parents' genotypes are unknown (union of every genotype pair). BG.childGroups(mum, dad): the 8-group list.
   BG.canHaveChild(mum, dad, child). BG.childOdds(mumAbo, dadAbo, mumRh, dadRh): counts out of 16 when genotypes are known.
   BG.inheritWhy(mum, dad, child): a short yes/no sentence. BG.makeGuess(rand): a puzzle with one valid parent pair and one not. */
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
  // ---- BG-3: how groups pass from parents to a child ----
  const ABO_GENOS = { O: ['OO'], A: ['AA', 'AO'], B: ['BB', 'BO'], AB: ['AB'] };
  const RH_GENOS  = { '+': ['DD', 'Dd'], '-': ['dd'] };
  const ALLELE_ORDER = { A: 0, B: 1, O: 2, D: 0, d: 1 };
  function aboGenos(abo) { return (ABO_GENOS[abo] || []).slice(); }
  function rhGenos(rh) { return (RH_GENOS[rh] || []).slice(); }
  function normGeno(a, b) { return (ALLELE_ORDER[a] <= ALLELE_ORDER[b] ? a + b : b + a); }
  function aboPheno(geno) {
    const g = String(geno || '');
    if (g === 'AA' || g === 'AO' || g === 'OA') return 'A';
    if (g === 'BB' || g === 'BO' || g === 'OB') return 'B';
    if (g === 'AB' || g === 'BA') return 'AB';
    if (g === 'OO') return 'O';
    return null;
  }
  function rhPheno(geno) {
    const g = String(geno || '');
    if (g === 'DD' || g === 'Dd' || g === 'dD') return '+';
    if (g === 'dd') return '-';
    return null;
  }
  function punnett(g1, g2) {
    const a = String(g1 || ''), b = String(g2 || '');
    if (a.length !== 2 || b.length !== 2) return null;
    const rows = [a[0], a[1]], cols = [b[0], b[1]];
    const cells = [
      [normGeno(a[0], b[0]), normGeno(a[0], b[1])],
      [normGeno(a[1], b[0]), normGeno(a[1], b[1])]
    ];
    return { rows, cols, cells };
  }
  function childABO(a, b) {
    const set = new Set();
    for (const g1 of aboGenos(a)) for (const g2 of aboGenos(b)) {
      const p = punnett(g1, g2); if (!p) continue;
      p.cells.flat().forEach(c => set.add(aboPheno(c)));
    }
    return ABO.filter(x => set.has(x));
  }
  function childRh(r1, r2) {
    const set = new Set();
    for (const g1 of rhGenos(r1)) for (const g2 of rhGenos(r2)) {
      const p = punnett(g1, g2); if (!p) continue;
      p.cells.flat().forEach(c => set.add(rhPheno(c)));
    }
    return ['+', '-'].filter(x => set.has(x));
  }
  function childGroups(mum, dad) {
    const m = parse(mum), d = parse(dad);
    if (!m || !d || !m.rh || !d.rh) return [];
    const abo = childABO(m.abo, d.abo), rh = childRh(m.rh, d.rh);
    return groups.filter(g => { const p = parse(g); return abo.includes(p.abo) && rh.includes(p.rh); });
  }
  function canHaveChild(mum, dad, child) {
    const c = parse(child);
    if (!c || !c.rh) return false;
    return childGroups(mum, dad).includes(c.abo + c.rh);
  }
  function childOdds(mumAbo, dadAbo, mumRh, dadRh) {
    const pa = punnett(mumAbo, dadAbo), pr = punnett(mumRh, dadRh);
    if (!pa || !pr || !aboPheno(mumAbo) || !aboPheno(dadAbo) || !rhPheno(mumRh) || !rhPheno(dadRh)) return null;
    const counts = {}, aboCells = pa.cells.flat(), rhCells = pr.cells.flat();
    let total = 0;
    aboCells.forEach(ag => {
      const abo = aboPheno(ag);
      rhCells.forEach(rg => { const g = abo + rhPheno(rg); counts[g] = (counts[g] || 0) + 1; total++; });
    });
    return { total, rows: groups.map(g => ({ group: g, n: counts[g] || 0, pct: (counts[g] || 0) * 100 / total })) };
  }
  function inheritWhy(mum, dad, child) {
    const m = parse(mum), d = parse(dad), c = parse(child);
    if (!m || !d || !c || !m.rh || !d.rh || !c.rh) return '';
    const ok = canHaveChild(mum, dad, child);
    const mn = name(mum), dn = name(dad), cn = name(child);
    const aboOk = childABO(m.abo, d.abo).includes(c.abo);
    const rhOk = childRh(m.rh, d.rh).includes(c.rh);
    if (ok) {
      let s = 'Yes. ' + mn + ' and ' + dn + ' can have a ' + cn + ' child.';
      if (c.abo === 'O' && m.abo !== 'O' && d.abo !== 'O') s += ' Both parents can pass a hidden O.';
      else if (c.abo === 'AB' && ((m.abo === 'A' && d.abo === 'B') || (m.abo === 'B' && d.abo === 'A'))) s += ' The child gets A from one parent and B from the other.';
      else if (c.rh === '-' && (m.rh === '+' || d.rh === '+')) s += ' A Rh positive parent can hide a d and pass it.';
      return s;
    }
    const reasons = [];
    if (!aboOk) {
      if (c.abo === 'AB' && (m.abo === 'O' || d.abo === 'O'))
        reasons.push('An AB child gets A from one parent and B from the other. An O parent can only pass O.');
      else if (m.abo === 'O' && d.abo === 'O')
        reasons.push('Two O parents can only pass O, so their child can only be group O.');
      else if (c.abo === 'O' && (m.abo === 'AB' || d.abo === 'AB'))
        reasons.push('An O child must get O from both parents. An AB parent has no O to pass.');
      else if (m.abo === 'A' && d.abo === 'A' && (c.abo === 'B' || c.abo === 'AB'))
        reasons.push('Two A parents have no B to pass, so their child cannot be B or AB.');
      else if (m.abo === 'B' && d.abo === 'B' && (c.abo === 'A' || c.abo === 'AB'))
        reasons.push('Two B parents have no A to pass, so their child cannot be A or AB.');
      else if (((m.abo === 'A' && d.abo === 'O') || (m.abo === 'O' && d.abo === 'A')) && (c.abo === 'B' || c.abo === 'AB'))
        reasons.push('These parents have no B to pass, so their child cannot be B or AB.');
      else if (((m.abo === 'B' && d.abo === 'O') || (m.abo === 'O' && d.abo === 'B')) && (c.abo === 'A' || c.abo === 'AB'))
        reasons.push('These parents have no A to pass, so their child cannot be A or AB.');
      else
        reasons.push(mn + ' and ' + dn + ' cannot have a child with group ' + c.abo + '.');
    }
    if (!rhOk) reasons.push('Two Rh negative parents have no D allele to pass, so their child is always Rh negative.');
    return 'No. ' + reasons.join(' ');
  }
  function interestingYes(p, child) {
    const m = parse(p.mum), d = parse(p.dad), c = parse(child);
    if (c.abo === 'AB' && ((m.abo === 'A' && d.abo === 'B') || (m.abo === 'B' && d.abo === 'A'))) return true;
    if (c.abo === 'O' && m.abo !== 'O' && d.abo !== 'O') return true;
    if (c.rh === '-' && (m.rh === '+' || d.rh === '+')) return true;
    if (((m.abo === 'AB' && d.abo === 'O') || (m.abo === 'O' && d.abo === 'AB')) && (c.abo === 'A' || c.abo === 'B')) return true;
    return false;
  }
  function interestingNo(p, child) {
    const m = parse(p.mum), d = parse(p.dad), c = parse(child);
    if (c.abo === 'AB' && (m.abo === 'O' || d.abo === 'O')) return true;
    if (m.abo === 'O' && d.abo === 'O' && c.abo !== 'O') return true;
    if (m.rh === '-' && d.rh === '-' && c.rh === '+') return true;
    if (m.abo === 'A' && d.abo === 'A' && (c.abo === 'B' || c.abo === 'AB')) return true;
    if (m.abo === 'B' && d.abo === 'B' && (c.abo === 'A' || c.abo === 'AB')) return true;
    if ((m.abo === 'AB' || d.abo === 'AB') && c.abo === 'O') return true;
    return false;
  }
  function makeGuess(rand) {
    const rnd = typeof rand === 'function' ? rand : Math.random;
    const pick = arr => arr[Math.floor(rnd() * arr.length)];
    const child = pick(groups);
    const yes = [], no = [];
    for (const mum of groups) for (const dad of groups) {
      (canHaveChild(mum, dad, child) ? yes : no).push({ mum, dad });
    }
    if (!yes.length || !no.length) return null;
    const yPick = yes.filter(p => interestingYes(p, child));
    const nPick = no.filter(p => interestingNo(p, child));
    const y = pick(yPick.length && rnd() < 0.8 ? yPick : yes);
    const n = pick(nPick.length && rnd() < 0.8 ? nPick : no);
    const answer = rnd() < 0.5 ? 0 : 1;
    return { child, pairs: answer === 0 ? [y, n] : [n, y], answer };
  }
  W.BG = { ABO, groups, aboInfo, rhInfo, india, parts, parse, antigens, antibodies, rhPositive, name, indiaTotal, byCommon,
    canGive, givesTo, receivesFrom, compatText, donor,
    aboGenos, rhGenos, aboPheno, rhPheno, punnett, childABO, childRh, childGroups, canHaveChild, childOdds, inheritWhy, makeGuess };
})(window);
