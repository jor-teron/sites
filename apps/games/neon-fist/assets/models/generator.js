// Procedural fighters 00-99: NF.generate(n) rolls a whole fighter from its number (same number, same fighter).
// Odd = male (built from Kai), even = female (built from Nova). About 1 in 10 is a "wild" blend of both bodies.
(function () {
  const CH = NF.characters, K = CH.kai, N = CH.nova;
  const rngFor = seed => () => {   // mulberry32
    seed = (seed + 0x6D2B79F5) | 0; let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const shuffle = (arr, r) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const clone = o => JSON.parse(JSON.stringify(o));
  const hex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const tone = (h, f) => hex(rgb(h).map(v => f <= 1 ? v * f : v + (255 - v) * (f - 1)));   // darken (<1) or lighten (>1)
  const mix = (a, b, t) => hex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));

  const MALE = ['RIO', 'JIN', 'DAX', 'ZEKE', 'BRUNO', 'TAJ', 'REX', 'KODA', 'NICO', 'VIC', 'ARLO', 'BOOM', 'CASH', 'DRAKE', 'ENZO', 'FINN', 'GUS', 'HUGO',
    'IKE', 'JAX', 'KANE', 'LEO', 'MAX', 'NASH', 'OTTO', 'PIKE', 'QUINN', 'RAFE', 'SOL', 'TANK', 'UMAR', 'VEGA', 'WADE', 'XAN', 'YURI', 'ZANE', 'ACE',
    'BLAZE', 'COLT', 'DUKE', 'FOX', 'GRIT', 'HAWK', 'IVAN', 'JOJO', 'KENJI', 'LUCA', 'MACE', 'ORION', 'RYU'];
  const FEMALE = ['ZARA', 'MIKA', 'LUNA', 'RIKA', 'SKYE', 'JADE', 'IVY', 'NIA', 'ROXY', 'KIRA', 'AYA', 'BEA', 'CLEO', 'DIVA', 'ELLA', 'FAYE', 'GIGI',
    'HANA', 'INDY', 'JUNO', 'KAYA', 'LOLA', 'MAYA', 'NORA', 'OPAL', 'PIXIE', 'QUEENIE', 'RAVEN', 'SASHA', 'TESS', 'UMA', 'VIX', 'WREN', 'XENA',
    'YUKI', 'ZOE', 'ASH', 'BLAIR', 'CORA', 'DEMI', 'EVE', 'FLO', 'GEM', 'HEX', 'IRIS', 'JINX', 'LEXI', 'MOXIE', 'PIA', 'SUKI'];
  const SKIN = [   // [skin, skinDeep, lips]
    ['#f1d0b5', '#c08f72', '#c47a74'], ['#e8bc98', '#ac7a59', '#b86a66'], ['#e2b08c', '#a8704f', '#b0645c'], ['#d9a27a', '#9c6444', '#a65a50'],
    ['#c98a62', '#8a5236', '#9a5a48'], ['#b97a52', '#7a4428', '#8e4e40'], ['#a0653e', '#663620', '#7e4236'], ['#8a5532', '#552c18', '#6e3a30'],
    ['#6f4127', '#432212', '#5c2e26'], ['#5a3420', '#36190c', '#4e2620']];
  const HAIR = [['#16110f', '#e9e3d4'], ['#2a1a10', '#d8b48a'], ['#4a2c18', '#f0c890'], ['#7a4a22', '#ffd9a0'], ['#c9a060', '#fff2c8'], ['#8a2a1a', '#ffb070'],
    ['#2b2b33', '#cfd6ff'], ['#d8d4cc', '#ffffff'], ['#7a3dd8', '#efe8ff'], ['#1e7a9a', '#bff6ff'], ['#c02a6a', '#ffd0ea'], ['#2a7a3a', '#d8ffd0']];
  const IRIS = ['#3a2416', '#2b5f6a', '#4a6a2a', '#1f3a6a', '#5a3a1a', '#6a5a4a', '#2a2a2a', '#7a2a5a'];
  const GLOW = [   // accent, rim, word
    ['#ff3346', '#ff4fd8', 'Blazing'], ['#2ee6ff', '#9a6bff', 'Electric'], ['#4dff7a', '#2ee6c0', 'Toxic'], ['#ffb02e', '#ff5a3a', 'Solar'],
    ['#b46bff', '#ff4fd8', 'Phantom'], ['#ffe14a', '#ffb02e', 'Golden'], ['#ff4fb0', '#7f6bff', 'Neon'], ['#8fd8ff', '#c8f0ff', 'Frost'],
    ['#c6ff3a', '#4dff7a', 'Venom'], ['#ff2a2a', '#ff8a2a', 'Crimson']];
  const CLOTH = ['#1b1820', '#f1efe8', '#1d2a4a', '#3a1d1d', '#2a3320', '#4a4a52', '#5a1a40', '#20383a', '#c9b48a', '#101418'];
  const ROLE = { heavy: ['Brawler', 'Crusher', 'Bruiser', 'Titan'], average: ['Fighter', 'Kickboxer', 'Duelist', 'Brawler'], lean: ['Striker', 'Dancer', 'Blade', 'Viper'] };
  const BUILD_ADJ = { heavy: ['Iron', 'Stone', 'Thunder'], average: ['Street', 'Steel', 'Wild'], lean: ['Swift', 'Silent', 'Shadow'] };
  const STYLE = { heavy: 'crushing grapples and heavy hooks', average: 'tight boxing and snapping kicks', lean: 'fast footwork and quick counters' };

  const OUTFIT_WORD = { gi: 'a gi', suit: 'a combat suit', tee: 'a T-shirt', tank: 'a tank top', crop: 'a crop top' };
  const LEG_WORD = { long: 'long pants', capri: 'capris', knee: 'knee-length pants', shorts: 'shorts', tights: 'armoured tights' };
  const nameDeck = { m: shuffle(MALE, rngFor(4242)), f: shuffle(FEMALE, rngFor(2424)) };
  const wildSet = new Set(shuffle([...Array(99).keys()], rngFor(777)).slice(0, 9).concat([99]));

  const scaleProf = (p, kf, kb) => p.map(r => r.length === 3 ? [r[0], +(r[1] * kf).toFixed(2), +(r[2] * (kb ?? kf)).toFixed(2)] : [r[0], +(r[1] * kf).toFixed(2)]);
  const scaleTorso = (p, sh, hip, m) => p.map(r => { const u = r[0], s = u > 0.55 ? sh : u < 0.35 ? hip : hip + (sh - hip) * (u - 0.35) / 0.2; return [u, +(r[1] * s * m).toFixed(2)]; });

  function generate(n) {
    n = ((Math.floor(+n) || 0) % 100 + 100) % 100;
    const r = rngFor(n * 7919 + 1013), rr = (a, b) => a + (b - a) * r(), pick = a => a[Math.floor(r() * a.length)];
    const male = n % 2 === 1, base = male ? K : N, other = male ? N : K, wild = wildSet.has(n);
    const ch = clone(base);
    // wild blend: each body part may come from the other base
    const from = { torso: base, arms: base, legs: base, face: base };
    if (wild) { for (const k of Object.keys(from)) if (r() < 0.6) from[k] = other; if (Object.values(from).every(v => v === base)) from[male ? 'face' : 'arms'] = other; }
    ch.torsoFront = clone(from.torso.torsoFront); ch.torsoBack = clone(from.torso.torsoBack); ch.neck = clone(from.torso.neck);
    ch.uarm = clone(from.arms.uarm); ch.farm = clone(from.arms.farm);
    ch.thigh = clone(from.legs.thigh); ch.shin = clone(from.legs.shin);
    ch.pantsShin = clone(K.pantsShin); ch.boot = clone(N.boot);
    // build
    const mRoll = r(), build = mRoll < 0.3 ? 'lean' : mRoll < 0.72 ? 'average' : 'heavy';
    const m = { lean: rr(0.86, 0.93), average: rr(0.96, 1.04), heavy: rr(1.08, 1.17) }[build];
    const h = rr(0.95, 1.05), legL = rr(0.96, 1.05), armL = rr(0.95, 1.06);
    let sh = rr(0.9, 1.1) * (build === 'heavy' ? 1.05 : 1), hip = rr(0.92, 1.08);
    if (wild && !male && from.torso === other) sh *= 1.08;           // huge shoulders on a wild woman
    if (wild && male && from.torso === other) hip *= 1.06;
    const B = ch.bones;
    for (const k of ['low', 'up', 'neck']) B[k] = +(B[k] * h).toFixed(1);
    for (const k of ['thigh', 'shin']) B[k] = +(B[k] * h * legL).toFixed(1);
    for (const k of ['uarm', 'farm']) B[k] = +(B[k] * h * armL).toFixed(1);
    B.shSpread = +(B.shSpread * sh).toFixed(1); B.hipSpread = +(B.hipSpread * hip).toFixed(1);
    ch.headScale = +(base.headScale * rr(0.97, 1.03)).toFixed(3);
    ch.torsoFront = scaleTorso(ch.torsoFront, sh, hip, m); ch.torsoBack = scaleTorso(ch.torsoBack, sh, hip, m);
    const lm = m * (build === 'heavy' ? 1.04 : 1);
    ch.uarm = scaleProf(ch.uarm, lm); ch.farm = scaleProf(ch.farm, lm); ch.neck = scaleProf(ch.neck, 0.5 + m / 2);
    ch.thigh = scaleProf(ch.thigh, m); ch.shin = scaleProf(ch.shin, m); ch.pantsShin = scaleProf(ch.pantsShin, m); ch.boot = scaleProf(ch.boot, m);
    ch.handScale = +((male ? 1.0 : 0.86) * (0.95 + m * 0.05)).toFixed(3);
    // face
    const f = from.face.face;
    ch.face = { nose: +(f.nose * rr(0.88, 1.12)).toFixed(2), jaw: +(f.jaw * rr(0.9, 1.1)).toFixed(2), lips: +(f.lips * rr(0.85, 1.15)).toFixed(2), lashes: f.lashes, masc: male ? 1 : 0 };
    if (wild && !male && from.face === other) ch.face.jaw = +(ch.face.jaw * 1.12).toFixed(2);        // heavy jaw
    if (wild && male && from.face === other) ch.face.lips = +(ch.face.lips * 1.2).toFixed(2);          // full lips + lashes
    // colours
    const sk = pick(SKIN), hr = male && r() < 0.6 ? HAIR[Math.floor(r() * 4)] : pick(HAIR);
    ch.skin = sk[0]; ch.skinDeep = sk[1]; ch.lips = from.face === N ? mix(sk[2], '#c8505a', 0.35) : sk[2];
    ch.iris = pick(IRIS); ch.hair = hr[0]; ch.hairTip = hr[1]; ch.brow = tone(hr[0], hr[0] > '#9' ? 0.55 : 0.8);
    ch.hairBack = tone(hr[0], 0.55); ch.hairFront = tone(hr[0], 1.12); ch.hairHi = tone(hr[0], 1.22); ch.hairDeep = tone(hr[0], 0.3);
    ch.sideburn = tone(hr[0], 0.75);
    ch.hairStyle = male ? (r() < 0.82 ? 'spiky' : 'tail') : (r() < 0.85 ? 'tail' : 'spiky');
    const gl = pick(GLOW);
    ch.accent = gl[0]; ch.rim = gl[1]; ch.glow = tone(gl[0], 1.25);
    ch.outfit = r() < (male ? 0.62 : 0.38) ? 'gi' : 'suit';
    const cloth = pick(CLOTH);
    ch.gi = cloth; ch.giTrim = tone(gl[0], 0.8); ch.pants = r() < 0.5 ? tone(gl[0], 0.72) : tone(cloth, cloth > '#8' ? 0.8 : 1.4);
    ch.belt = pick(['#0b0a0d', '#f1efe8', '#8a5a20', '#c3182a']); ch.band = pick(['#f1efe8', '#16161a', tone(gl[0], 1.1)]); ch.wrap = pick(['#e9e3d4', '#2a2a30', tone(gl[0], 1.4)]);
    ch.suit = tone(gl[0], rr(0.45, 0.7)); ch.armour = pick(['#1d2233', '#2a2a30', '#3a2a22', '#22302a', '#e0e0e8']); ch.armourHi = tone(ch.armour, 1.35);
    ch.bootCol = tone(ch.armour, 0.85);
    // R2c2 clothing slots: own seeded stream so the R2a rolls above stay exactly the same
    const ro = rngFor(n * 104729 + 57), op = a => a[Math.floor(ro() * a.length)];
    ch.slots = NF.outfits.roll(ro, male, wild, ch.outfit === 'suit');
    ch.skinThigh = from.legs === K ? 0.84 : 1;           // Kai's thigh profile is drawn with gi pants on
    ch.trim = ch.glow;
    const cl1 = op(CLOTH), cl2 = op(CLOTH.filter(c => c !== cl1)), acc = tone(gl[0], op([0.5, 0.65, 0.8]));
    const scheme = op([[cl1, cl2], [cl1, acc], [acc, cl1], [cl2, tone(cl1, 0.7)]]);   // [top, legwear]
    ch.top = scheme[0]; ch.topTrim = op([tone(gl[0], 0.85), tone(scheme[0], scheme[0] > '#8' ? 0.6 : 1.6), '#f1efe8']); ch.topStripe = ro() < 0.35;
    if (ch.slots.legs !== 'tights' && ch.slots.top !== 'gi') ch.pants = scheme[1];
    ch.pantsTrim = op([tone(gl[0], 1.1), tone(ch.pants, ch.pants > '#8' ? 0.6 : 1.7)]);
    ch.padCol = op(['#1a1a20', '#e8e4dc', ch.armour, tone(gl[0], 0.6), '#3a2a22']); ch.padHi = tone(ch.padCol, ch.padCol > '#8' ? 0.6 : 1.6);
    ch.gloveCol = op(['#16161a', '#c3182a', '#1d2a4a', ch.armour, tone(gl[0], 0.7), '#e8e4dc']); ch.gloveHi = tone(ch.gloveCol, 1.35);
    ch.sash = op(['#c3182a', '#f1efe8', tone(gl[0], 0.85), '#d8a020', '#1d2a4a']);
    ch.beltTails = [tone(ch.belt, 0.75), tone(ch.belt, 0.55), tone(ch.belt, 0.95), tone(ch.belt, 0.65)]; ch.beltKnot = tone(ch.belt, 0.85);
    // identity, stats, title
    ch.id = 'f' + String(n).padStart(2, '0'); ch.num = n; ch.male = male; ch.wild = wild; ch.build = build; ch.poseSet = male ? 'kai' : 'nova';
    ch.name = male ? nameDeck.m[(n - 1) / 2] : nameDeck.f[n / 2];
    const reach = h * (legL + armL) / 2, cl = v => Math.max(1, Math.min(5, Math.round(v)));
    ch.stats = { Speed: cl(3.6 - (m - 1) * 9 - (h - 1) * 6 + rr(-0.4, 0.4)), Power: cl(3 + (m - 1) * 9 + (sh - 1) * 4 + rr(-0.4, 0.4)),
      Reach: cl(3 + (reach - 1) * 22 + rr(-0.3, 0.3)), Defense: cl(3 + (m - 1) * 7 + (h - 1) * 6 + rr(-0.5, 0.5)) };
    let role = pick(ROLE[build]); if (build !== 'heavy' && ch.stats.Reach >= 5) role = 'Lancer';
    ch.title = (wild ? 'Wildcard ' : '') + (r() < 0.55 ? gl[2] : pick(BUILD_ADJ[build])) + ' ' + role;
    ch.desc = `Fighter ${String(n).padStart(2, '0')}. ${build === 'average' ? 'An' : 'A'} ${build} ${male ? 'man' : 'woman'} in ${OUTFIT_WORD[ch.slots.top]} and ${LEG_WORD[ch.slots.legs]} who fights with ${STYLE[build]}.` +
      (wild ? ' Built from a wild mix of body parts, so expect surprises.' : '');
    return ch;
  }
  NF.generate = generate;
  NF.generator = { MALE, FEMALE, wildSet };
})();
