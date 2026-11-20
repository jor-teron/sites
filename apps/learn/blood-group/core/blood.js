/* Blood Group BG-6a — data and pure rules, no DOM. Attaches window.BG.
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
   BG.inheritWhy(mum, dad, child): a short yes/no sentence. BG.makeGuess(rand): a puzzle with one valid parent pair and one not.
   BG-3b: BG.aboTable() is a 4x4 ABO reference ({ rows, cols, cells }) with Mum down the side and Dad across the top, both in
   A, B, AB, O order. Each cell lists the possible child ABO groups in that same order. BG.pickerWhy(mum, dad): one plain
   sentence for the family picker (what each parent can pass, the child's possible ABO groups, and a short Rh note).
   BG-5 (myths): BG.personality: A, B, O and AB trait cards, each with myth: true. BG.mythIntro: short history (Furukawa 1927,
   Nomi 1970s), the studies note, and a bura-hara note. BG.mythFacts: myth vs fact pairs (myth and fact are non-empty strings).
   BG-6 (health): BG.views lists the title-bar tabs (Groups, Donation, Family, Myths, Health). BG.health holds part 1, healthy
   blood: nutrient needs (iron, B12, folate and vitamin C) each with foods, iron tips, anaemia (what it is, signs, who is at
   higher risk, and a warning to test before iron tablets), lifestyle tips for circulation, and a not-medical-advice
   disclaimer. BG-6a (know your numbers): BG.health.ranges (haemoglobin, blood pressure and blood sugar; each with a
   See a doctor if… line; figures are approximate because labs vary), BG.health.cbc (compact CBC report cards: Hb, RBC,
   WBC, platelets, hematocrit/PCV and MCV), and BG.hbBand(value, who) for the Hb checker (who is man, woman or
   pregnant; returns 'low', 'normal' or 'high', or null if the value is not a number from 3 to 25 or who is unknown).
   The checker stores nothing. */
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
  // ---- BG-3b: 4x4 ABO table and a plain-English picker reason ----
  const ABO_SHOW = ['A', 'B', 'AB', 'O'];
  function joinOr(items) {
    if (!items.length) return '';
    if (items.length === 1) return items[0];
    return items.slice(0, -1).join(', ') + ' or ' + items[items.length - 1];
  }
  function aboGives(abo) {
    if (abo === 'A') return 'A or O';
    if (abo === 'B') return 'B or O';
    if (abo === 'AB') return 'A or B';
    if (abo === 'O') return 'only O';
    return '';
  }
  function aboTable() {
    const cells = ABO_SHOW.map(mum => ABO_SHOW.map(dad => ABO_SHOW.filter(c => childABO(mum, dad).includes(c))));
    return { rows: ABO_SHOW.slice(), cols: ABO_SHOW.slice(), cells };
  }
  function pickerWhy(mum, dad) {
    const m = parse(mum), d = parse(dad);
    if (!m || !d || !m.rh || !d.rh) return '';
    const abo = ABO_SHOW.filter(c => childABO(m.abo, d.abo).includes(c));
    const rh = childRh(m.rh, d.rh);
    let s = 'Mum ' + m.abo + ' gives ' + aboGives(m.abo) + ', Dad ' + d.abo + ' gives ' + aboGives(d.abo);
    s += ', so the child can be ' + joinOr(abo) + '.';
    if (m.rh === '-' && d.rh === '-') s += ' Rh: both \u2212 give only \u2212.';
    else if (m.rh === '+' && d.rh === '+') s += ' Rh: both + can give + or \u2212.';
    else s += ' Rh: + and \u2212 can give either.';
    return s;
  }
  // ---- BG-5: myths (Japan's blood-type personality, and myth vs fact) ----
  // ---- BG-6 / BG-6a: Health tab (healthy blood, then know your numbers). ----
  const views = [
    { id: 'home',   label: 'Groups',   short: 'Groups', hash: '' },
    { id: 'donate', label: 'Donation', short: 'Donate', hash: '#donate' },
    { id: 'family', label: 'Family',   short: 'Family', hash: '#family' },
    { id: 'myths',  label: 'Myths',    short: 'Myths',  hash: '#myths' },
    { id: 'health', label: 'Health',   short: 'Health', hash: '#health' }
  ];
  const mythIntro = {
    history: 'In Japan, a belief called ketsueki-gata says your ABO group describes your personality. It grew from Takeji Furukawa\'s 1927 paper and became popular through Masahiko Nomi\'s books in the 1970s. It is still pop culture there, in horoscopes, dating, character profiles and even some job interviews.',
    studies: 'Large studies in Japan and the US found no link between blood type and personality.',
    harassment: 'A related problem is called bura-hara (blood-type harassment): people may be teased or left out, even at work, because of their type.'
  };
  const personality = [
    { abo: 'A',  myth: true, text: 'Believed to be calm, careful, organised and polite, but anxious and a perfectionist.' },
    { abo: 'B',  myth: true, text: 'Believed to be creative, passionate and free-spirited, but seen as selfish and moody.' },
    { abo: 'O',  myth: true, text: 'Believed to be confident, a leader, outgoing and generous, but stubborn.' },
    { abo: 'AB', myth: true, text: 'Believed to be a rational, cool, dual-natured "genius type", but seen as distant and hard to read.' }
  ];
  const mythFacts = [
    { id: 'beetroot', myth: 'Eating beetroot makes more blood.',
      fact: 'Beetroot has little iron. Iron-rich foods plus vitamin C help, and beetroot is fine, but it is not magic.' },
    { id: 'weak', myth: 'Donating blood makes you weak.',
      fact: 'A healthy adult\'s body replaces the plasma within a day or two and the red cells within weeks, so you can rest and drink fluids.' },
    { id: 'diet', myth: 'Your blood group can change with diet.',
      fact: 'Your blood group is set by your genes. Rare exceptions are a bone marrow transplant and some diseases.' },
    { id: 'orare', myth: 'O negative is rare everywhere.',
      fact: 'In India, Rh negative is uncommon overall, and how common each group is differs by region.' },
    { id: 'rhmum', myth: 'Rh negative mothers cannot have healthy babies.',
      fact: 'With an anti-D injection and care, Rh negative mothers have healthy babies.' },
    { id: 'tattoo', myth: 'You cannot donate if you have a tattoo.',
      fact: 'You usually wait a period first. Check local rules; in India this is often 12 months.' },
    { id: 'relative', myth: 'Blood from a relative is always safest.',
      fact: 'Relatives must be tested too, and a directed donation can carry some extra risks. Matching and testing matter, not family.' }
  ];

  // ---- BG-6: healthy blood (general info, not medical advice) ----
  const health = {
    needs: [
      { id: 'iron', name: 'Iron',
        job: 'Used to make haemoglobin, which carries oxygen.',
        foods: ['dal and lentils', 'rajma', 'chana', 'green leafy veg such as palak and methi',
          'jaggery in moderation', 'eggs', 'meat and fish', 'dates', 'ragi', 'poha'] },
      { id: 'b12', name: 'Vitamin B12',
        job: 'Helps the body make red cells.',
        foods: ['milk', 'curd', 'paneer', 'eggs', 'fish and meat', 'fortified foods'],
        note: 'Vegetarians may need to watch B12, because it is found mainly in animal foods and in some fortified foods.' },
      { id: 'folate', name: 'Folate',
        job: 'Helps the body make red cells.',
        foods: ['leafy greens', 'beans', 'citrus'] },
      { id: 'vitc', name: 'Vitamin C',
        job: 'Helps the body absorb iron from plant foods.',
        foods: ['amla', 'citrus', 'guava', 'tomato', 'lemon'] }
    ],
    ironTips: [
      'Add a vitamin C food to iron-rich meals, for example lemon on dal, or amla, guava or tomato with palak.',
      'Avoid tea or coffee within about an hour of an iron-rich meal; they can reduce how much iron you absorb.',
      'Cooking in an iron kadhai can add a little extra iron to the food.'
    ],
    anaemia: {
      what: 'Anaemia means the blood has too little haemoglobin, so less oxygen reaches the body.',
      signs: ['Tiredness', 'Pale skin or eyelids', 'Breathlessness', 'Dizziness', 'Cold hands'],
      risk: 'Women and girls, people who are pregnant, children, vegetarians (for B12), and people with heavy periods or other blood loss are at higher risk.',
      warning: 'Get a blood test before taking iron tablets; too much iron can harm.'
    },
    lifestyle: [
      { id: 'water', title: 'Drink water', text: 'Staying hydrated helps blood flow easily.' },
      { id: 'exercise', title: 'Regular exercise', text: 'For example, 30 minutes of walking most days helps circulation.' },
      { id: 'smoke', title: 'No smoking', text: 'Smoking thickens the blood and harms blood vessels.' },
      { id: 'alcohol', title: 'Limit alcohol', text: 'Too much alcohol can affect blood cells and the liver, which helps make blood proteins.' },
      { id: 'weight', title: 'Keep a healthy weight', text: 'A healthy weight is easier on the heart and circulation.' }
    ],
    // ---- BG-6a: know your numbers (typical adult figures; labs vary) ----
    ranges: {
      note: 'Typical adult figures. Labs vary, so these ranges are approximate.',
      items: [
        { id: 'hb', title: 'Haemoglobin', unit: 'g/dL',
          lines: [
            'Men: about 13.5 to 17.5 g/dL.',
            'Women: about 12.0 to 15.5 g/dL.',
            'In pregnancy, below 11 g/dL counts as anaemia.'
          ],
          seeDoctor: 'See a doctor if your haemoglobin is below the usual range for you, or if you feel very tired, pale or short of breath.' },
        { id: 'bp', title: 'Blood pressure', unit: 'mmHg',
          lines: [
            'Normal is below 120/80.',
            '120 to 129 with the lower number (diastolic) below 80 is elevated.',
            '130/80 or above is high, so see a doctor.',
            '180/120 or above is urgent.'
          ],
          seeDoctor: 'See a doctor if your reading is 130/80 or above, or if you have a severe headache, chest pain or sudden vision changes. 180/120 or above is urgent.' },
        { id: 'sugar', title: 'Blood sugar', unit: 'mg/dL',
          lines: [
            'Fasting: normal is below 100 mg/dL, 100 to 125 is prediabetes, and 126 or above may mean diabetes.',
            '2 hours after a meal: normal is below 140 mg/dL, 140 to 199 is prediabetes, and 200 or above may mean diabetes.'
          ],
          seeDoctor: 'See a doctor if your fasting sugar is 100 mg/dL or above, or your reading 2 hours after a meal is 140 mg/dL or above, or if you have unusual thirst, tiredness or weight loss.' }
      ]
    },
    cbc: {
      lead: 'A Complete Blood Count (CBC) is a common blood test. These are typical adult figures; labs vary.',
      items: [
        { id: 'hb', name: 'Hb', text: 'Haemoglobin, the oxygen carrier. See the ranges above.' },
        { id: 'rbc', name: 'RBC', text: 'Red-cell count. About 4.5 to 5.9 million/uL for men and about 4.1 to 5.1 for women.' },
        { id: 'wbc', name: 'WBC', text: 'White cells, the infection fighters. About 4,000 to 11,000/uL.' },
        { id: 'plt', name: 'Platelets', text: 'Help the blood clot. About 150,000 to 450,000/uL.' },
        { id: 'hct', name: 'Hematocrit (PCV)', text: 'The share of blood that is red cells (packed cell volume).' },
        { id: 'mcv', name: 'MCV', text: 'The average size of red cells. Small cells can hint at low iron; large cells can hint at low B12 or folate.' }
      ]
    },
    disclaimer: 'General information, not medical advice. See a doctor for symptoms or tests.'
  };
  // ---- BG-6a: Hb checker (pure; stores nothing) ----
  const HB_CUT = { man: [13.5, 17.5], woman: [12.0, 15.5], pregnant: [11.0, 15.5] };
  function parseHb(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    if (typeof value !== 'string') return NaN;
    const t = value.trim();
    if (!/^\d+(\.\d+)?$/.test(t)) return NaN;
    return Number(t);
  }
  function hbBand(value, who) {
    const n = parseHb(value);
    if (!Number.isFinite(n) || n < 3 || n > 25) return null;
    const cut = HB_CUT[String(who || '').toLowerCase()];
    if (!cut) return null;
    if (n < cut[0]) return 'low';
    if (n > cut[1]) return 'high';
    return 'normal';
  }
  W.BG = { ABO, groups, aboInfo, rhInfo, india, parts, parse, antigens, antibodies, rhPositive, name, indiaTotal, byCommon,
    canGive, givesTo, receivesFrom, compatText, donor,
    aboGenos, rhGenos, aboPheno, rhPheno, punnett, childABO, childRh, childGroups, canHaveChild, childOdds, inheritWhy, makeGuess,
    ABO_SHOW, aboTable, pickerWhy,
    views, mythIntro, personality, mythFacts,
    health, hbBand };
})(window);
