/* Periodic Table PT1 — data for all 118 elements: symbol, name, standard atomic weight (IUPAC, shown rounded; [n] = mass
   number of the longest-lived isotope when there is no standard weight) and year of discovery (0 = known since ancient
   times). Group, period, grid place, category and state at room temperature (20 °C) are worked out below.
   Layout: 18 columns, periods 1-7; La-Lu and Ac-Lr sit in two rows below (rows 9 and 10), shown as 57-71 / 89-103 in group 3.
   PT.els = [{ z, sym, name, mass, massTxt, year, group (null for the f rows), period, row, col, cat, state, facts }]. */
window.PT = window.PT || {};
(() => {
  const P = window.PT;
  const D = `H Hydrogen 1.008 1766|He Helium 4.0026 1868|Li Lithium 6.94 1817|Be Beryllium 9.0122 1798|B Boron 10.81 1808|C Carbon 12.011 0|N Nitrogen 14.007 1772|O Oxygen 15.999 1774|F Fluorine 18.998 1886|Ne Neon 20.180 1898|
Na Sodium 22.990 1807|Mg Magnesium 24.305 1755|Al Aluminium 26.982 1825|Si Silicon 28.085 1824|P Phosphorus 30.974 1669|S Sulfur 32.06 0|Cl Chlorine 35.45 1774|Ar Argon 39.95 1894|
K Potassium 39.098 1807|Ca Calcium 40.078 1808|Sc Scandium 44.956 1879|Ti Titanium 47.867 1791|V Vanadium 50.942 1801|Cr Chromium 51.996 1797|Mn Manganese 54.938 1774|Fe Iron 55.845 0|Co Cobalt 58.933 1735|Ni Nickel 58.693 1751|Cu Copper 63.546 0|Zn Zinc 65.38 1746|Ga Gallium 69.723 1875|Ge Germanium 72.630 1886|As Arsenic 74.922 1250|Se Selenium 78.971 1817|Br Bromine 79.904 1826|Kr Krypton 83.798 1898|
Rb Rubidium 85.468 1861|Sr Strontium 87.62 1790|Y Yttrium 88.906 1794|Zr Zirconium 91.224 1789|Nb Niobium 92.906 1801|Mo Molybdenum 95.95 1778|Tc Technetium 97 1937|Ru Ruthenium 101.07 1844|Rh Rhodium 102.91 1804|Pd Palladium 106.42 1802|Ag Silver 107.87 0|Cd Cadmium 112.41 1817|In Indium 114.82 1863|Sn Tin 118.71 0|Sb Antimony 121.76 0|Te Tellurium 127.60 1782|I Iodine 126.90 1811|Xe Xenon 131.29 1898|
Cs Caesium 132.91 1860|Ba Barium 137.33 1772|La Lanthanum 138.91 1839|Ce Cerium 140.12 1803|Pr Praseodymium 140.91 1885|Nd Neodymium 144.24 1885|Pm Promethium 145 1945|Sm Samarium 150.36 1879|Eu Europium 151.96 1901|Gd Gadolinium 157.25 1880|Tb Terbium 158.93 1843|Dy Dysprosium 162.50 1886|Ho Holmium 164.93 1878|Er Erbium 167.26 1843|Tm Thulium 168.93 1879|Yb Ytterbium 173.05 1878|Lu Lutetium 174.97 1907|
Hf Hafnium 178.49 1923|Ta Tantalum 180.95 1802|W Tungsten 183.84 1783|Re Rhenium 186.21 1925|Os Osmium 190.23 1803|Ir Iridium 192.22 1803|Pt Platinum 195.08 1735|Au Gold 196.97 0|Hg Mercury 200.59 0|Tl Thallium 204.38 1861|Pb Lead 207.2 0|Bi Bismuth 208.98 1753|Po Polonium 209 1898|At Astatine 210 1940|Rn Radon 222 1899|
Fr Francium 223 1939|Ra Radium 226 1898|Ac Actinium 227 1899|Th Thorium 232.04 1829|Pa Protactinium 231.04 1913|U Uranium 238.03 1789|Np Neptunium 237 1940|Pu Plutonium 244 1940|Am Americium 243 1944|Cm Curium 247 1944|Bk Berkelium 247 1949|Cf Californium 251 1950|Es Einsteinium 252 1952|Fm Fermium 257 1952|Md Mendelevium 258 1955|No Nobelium 259 1958|Lr Lawrencium 266 1961|
Rf Rutherfordium 267 1964|Db Dubnium 268 1967|Sg Seaborgium 269 1974|Bh Bohrium 270 1981|Hs Hassium 269 1984|Mt Meitnerium 278 1982|Ds Darmstadtium 281 1994|Rg Roentgenium 282 1994|Cn Copernicium 285 1996|Nh Nihonium 286 2004|Fl Flerovium 289 1999|Mc Moscovium 290 2003|Lv Livermorium 293 2000|Ts Tennessine 294 2010|Og Oganesson 294 2002`;
  P.cats = {
    alkali: 'Alkali metal', alkaline: 'Alkaline earth metal', transition: 'Transition metal', post: 'Post-transition metal', metalloid: 'Metalloid',
    nonmetal: 'Nonmetal', halogen: 'Halogen', noble: 'Noble gas', lanthanide: 'Lanthanide', actinide: 'Actinide'
  };
  P.states = { solid: 'Solid', liquid: 'Liquid', gas: 'Gas', unknown: 'Not known (too few atoms ever made)' };
  const set = s => new Set(s.split(' '));
  const NONMETAL = set('H C N O P S Se'), HALOGEN = set('F Cl Br I At Ts'), METALLOID = set('B Si Ge As Sb Te'), NOBLE = set('He Ne Ar Kr Xe Rn Og');
  const GAS = set('H N O F Cl He Ne Ar Kr Xe Rn'), LIQUID = set('Br Hg');
  const START = [1, 3, 11, 19, 37, 55, 87, 119];
  P.els = D.replace(/\n/g, '').split('|').map((row, i) => {
    const [sym, name, m, yr] = row.trim().split(' '), z = i + 1, period = START.findIndex(s => s > z), o = z - START[period - 1];
    let group = null, rowN = period, col;
    if (period === 1) group = z === 1 ? 1 : 18;
    else if (period <= 3) group = o < 2 ? o + 1 : o + 11;
    else if (period <= 5) group = o + 1;
    else if (o < 2) group = o + 1; else if (o <= 16) { rowN = period + 3; col = 3 + o - 2; } else group = o - 13;
    if (group) col = group;
    const fRow = rowN > 7, bracket = (z === 43 || z === 61 || z >= 84) && !(z >= 90 && z <= 92), mass = +m;
    const cat = fRow ? (period === 6 ? 'lanthanide' : 'actinide') : NOBLE.has(sym) ? 'noble' : HALOGEN.has(sym) ? 'halogen' : NONMETAL.has(sym) ? 'nonmetal'
      : METALLOID.has(sym) ? 'metalloid' : group === 1 ? 'alkali' : group === 2 ? 'alkaline' : group >= 3 && group <= 12 ? 'transition' : 'post';
    const state = GAS.has(sym) ? 'gas' : LIQUID.has(sym) ? 'liquid' : z >= 100 ? 'unknown' : 'solid';
    return { z, sym, name, mass, massTxt: bracket ? '[' + mass + ']' : mass.toFixed(1), year: +yr, group, period, row: rowN, col, cat, state, facts: null };
  });
  P.bySym = {}; P.els.forEach(e => P.bySym[e.sym] = e);
  // kid-friendly facts: elements 1-36 and some famous heavier ones; the others get a line made from their category
  const F = {
    H: 'The lightest element and the most common one in the universe. Stars like the Sun shine by fusing hydrogen into helium.',
    He: 'Lighter than air, so it makes party balloons float. It is the second most common element in the universe.',
    Li: 'The lightest metal, so soft you can cut it with a knife. Used in rechargeable batteries for phones and electric cars.',
    Be: 'A light, stiff metal used for the mirrors of the James Webb Space Telescope. Emeralds contain beryllium.',
    B: 'Used in heat-proof glass for ovens and labs, and in borax for cleaning and making slime.',
    C: 'Diamonds and pencil "lead" (graphite) are both pure carbon. Every living thing is built from carbon.',
    N: 'About 78% of the air you breathe is nitrogen. Plants need it to grow, so it is in most fertilisers.',
    O: 'About 21% of air is oxygen, and we need it to breathe. Water is made of hydrogen and oxygen.',
    F: 'The most reactive element. Fluoride in toothpaste helps protect your teeth.',
    Ne: 'Glows a bright red-orange in neon signs when electricity flows through it.',
    Na: 'A soft metal that fizzes and zooms around on water. Table salt is sodium chloride.',
    Mg: 'Burns with a dazzling white light, so it is used in fireworks and flares. Also makes light alloys for bikes and laptops.',
    Al: 'Light and does not rust, so it is used for drink cans, kitchen foil and aeroplanes. The most common metal in Earth\u2019s crust.',
    Si: 'Computer chips are made from silicon. Sand and glass are mostly silicon and oxygen.',
    P: 'Used on the striking strip of matchboxes. Your bones and teeth contain phosphorus.',
    S: 'A yellow solid found near volcanoes. Some sulfur compounds smell like rotten eggs.',
    Cl: 'Used to keep swimming pools and drinking water clean. Table salt is half chlorine.',
    Ar: 'Almost 1% of the air is argon. It hardly reacts, so it is used inside light bulbs and for welding.',
    K: 'Bananas are rich in potassium. Your nerves and muscles need it to work.',
    Ca: 'Makes your bones and teeth strong. Milk, chalk, shells and limestone all contain calcium.',
    Sc: 'A light metal added to aluminium to make strong sports gear like bike frames and baseball bats.',
    Ti: 'Strong, light and does not rust: used in aircraft, artificial hips and bright white paint.',
    V: 'Added to steel to make very strong tools such as spanners.',
    Cr: 'Gives taps and bikes a shiny "chrome" finish and helps make stainless steel rust-proof.',
    Mn: 'Added to steel to make it tougher, for things like railway tracks. Also used in batteries.',
    Fe: 'Most steel is iron. Your blood uses iron to carry oxygen, and Earth\u2019s core is mostly iron.',
    Co: 'Gives glass and pottery a deep "cobalt blue" colour. Used in batteries and strong magnets.',
    Ni: 'Used in coins and stainless steel. Nickel is magnetic, like iron and cobalt.',
    Cu: 'Carries electricity in almost all wires. The Statue of Liberty is made of copper that has turned green.',
    Zn: 'A coat of zinc stops steel from rusting. Mixed with copper it makes brass for trumpets.',
    Ga: 'A metal that melts in your hand (at about 30 \u00B0C). Used to make LEDs.',
    Ge: 'Used in fibre-optic cables and in the first transistors.',
    As: 'A famous poison in old mystery stories. Tiny amounts are used in electronics.',
    Se: 'Used in solar cells and photocopiers. Your body needs a tiny bit; Brazil nuts are full of it.',
    Br: 'One of only two elements that are liquid at room temperature: a heavy red-brown liquid.',
    Kr: 'Used in some bright lamps and camera flashes. Superman\u2019s "kryptonite" is named after it, but is not real!',
    Ag: 'The best metal of all at carrying electricity. Used in jewellery, coins and mirrors.',
    Sn: 'Coats steel "tin cans" so they do not rust, and is used in solder to join electronic parts.',
    I: 'Your thyroid gland needs iodine, so it is added to salt. Also used to clean cuts.',
    Xe: 'Glows blue in some car headlights and pushes spacecraft in ion engines.',
    W: 'Has the highest melting point of any metal (3422 \u00B0C), so it was used for light bulb filaments.',
    Pt: 'A precious metal used in jewellery and in car catalytic converters that clean exhaust gases.',
    Au: 'Gold never rusts or tarnishes, so it stays shiny for thousands of years. Used in jewellery, coins and electronics.',
    Hg: 'The only metal that is liquid at room temperature. It used to be in thermometers, but it is poisonous.',
    Pb: 'A very heavy, soft metal that blocks X-rays. It is poisonous, so it is no longer used in paint or petrol.',
    U: 'Radioactive, and used as fuel in nuclear power stations. The heaviest element found in large amounts in nature.'
  };
  const CAT = {
    alkali: 'Alkali metals are soft and react strongly with water.', alkaline: 'Alkaline earth metals are shiny and react with water, but less than alkali metals.',
    transition: 'Transition metals are usually hard, shiny and good at carrying heat and electricity.', post: 'Post-transition metals are fairly soft metals that melt quite easily.',
    metalloid: 'Metalloids are partly like metals and partly like nonmetals.', nonmetal: 'Nonmetals are not shiny and do not carry electricity well.',
    halogen: 'Halogens react easily and form salts with metals.', noble: 'Noble gases hardly ever react with anything.',
    lanthanide: 'Lanthanides are "rare earth" metals used in magnets, screens and lasers.', actinide: 'All actinides are radioactive.'
  };
  P.els.forEach(e => {
    let extra = e.z >= 99 ? ' Only tiny amounts have ever been made, by scientists in a lab.' : e.z >= 93 ? ' It is made in nuclear reactors.' : e.z >= 84 || e.z === 43 || e.z === 61 ? ' It is radioactive.' : '';
    e.facts = F[e.sym] || (e.name + ' is a ' + P.cats[e.cat].toLowerCase() + '. ' + CAT[e.cat] + extra);
  });
})();
