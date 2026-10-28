/* Human Body Explorer HBE2 — the data for Simple mode: groups (systems) and the 15 main parts. Expert parts are in parts-expert.js.
   lv: 's' = Simple only (replaced by finer parts in Expert), 'x' = Expert only, none = both. xsys = group in Expert if different.
   back: 1 = sits behind other parts (drawn dashed, the card says so). noall: 1 = not shown in the busy 'All organs' view.
   Part: id, sys (group id), name, pl (1 = plural name), job (one short line, used as a quiz answer), info (what it does), facts (2-3 fun facts),
   color, shapes: [tag, attrs] SVG shapes drawn on the 200 x 420 body (viewBox), viewer's left = the body's right side. */
window.HB = window.HB || {};
(() => {
  const H = window.HB;

  // body outline (one neutral silhouette, drawn under every group)
  H.body = [
    ['circle', { cx: 100, cy: 44, r: 30 }],
    ['rect', { x: 89, y: 68, width: 22, height: 24, rx: 6 }],
    ['path', { d: 'M56 92 Q100 82 144 92 Q152 96 150 112 L140 218 Q142 236 140 252 L60 252 Q58 236 60 218 L50 112 Q48 96 56 92 Z' }],
    ['path', { d: 'M54 96 Q40 100 38 118 L30 238 Q30 250 40 250 Q46 248 46 238 L58 128 Z' }],
    ['path', { d: 'M146 96 Q160 100 162 118 L170 238 Q170 250 160 250 Q154 248 154 238 L142 128 Z' }],
    ['path', { d: 'M62 246 L98 246 L96 400 Q96 410 84 410 L72 410 Q64 410 66 398 Z' }],
    ['path', { d: 'M102 246 L138 246 L134 398 Q136 410 128 410 L116 410 Q104 410 104 400 Z' }]
  ];

  H.groups = [                                         // x: 1 = Expert only; xname = name in Expert
    { id: 'brain', name: 'Brain and senses', icon: '\u{1F9E0}' },
    { id: 'chest', name: 'Heart and lungs', xname: 'Lungs and breathing', icon: '\u{1FAC1}' },
    { id: 'blood', x: 1, name: 'Heart and blood', icon: '\u2764\uFE0F' },
    { id: 'digest', name: 'Digestion', icon: '\u{1F34E}' },
    { id: 'clean', name: 'Kidneys and bladder', icon: '\u{1F4A7}' },
    { id: 'bones', name: 'Skeleton', icon: '\u{1F9B4}' },
    { id: 'muscles', name: 'Muscles', icon: '\u{1F4AA}' },
    { id: 'skin', x: 1, name: 'Skin', icon: '\u270B' }
  ];

  H.parts = [
    { id: 'brain', sys: 'brain', lv: 's', name: 'Brain', color: '#f4a6c0', job: 'Controls thinking, feeling and moving',
      info: 'Your brain is the boss of your body. It thinks, remembers, feels and sends messages along your nerves to tell every part what to do.',
      facts: ['Your brain has about 86 billion nerve cells.', 'It uses about one fifth of your body\u2019s energy, even when you sleep.', 'An adult brain weighs about 1.4 kg, like a small bag of sugar.'],
      shapes: [['ellipse', { cx: 100, cy: 34, rx: 23, ry: 16 }], ['path', { d: 'M100 19 L100 49 M84 30 Q92 26 96 34 M104 34 Q108 26 116 30', fill: 'none', 'stroke-width': 1.5, class: 'hb-line' }]] },
    { id: 'eyes', sys: 'brain', name: 'Eyes', pl: 1, color: '#7cc6ff', job: 'Let you see the world',
      info: 'Your eyes take in light. A lens inside each eye focuses the light into a picture at the back, and your brain turns it into what you see.',
      facts: ['You blink about 15 to 20 times every minute.', 'The picture at the back of your eye is upside down. Your brain flips it the right way up.', 'Tears wash your eyes and keep them clean.'],
      shapes: [['circle', { cx: 89, cy: 54, r: 5 }], ['circle', { cx: 111, cy: 54, r: 5 }]] },
    { id: 'lungs', sys: 'chest', name: 'Lungs', pl: 1, color: '#f7a1a1', job: 'Breathe in oxygen and breathe out carbon dioxide',
      info: 'When you breathe in, your lungs fill with air. Oxygen from the air goes into your blood, and the used gas, carbon dioxide, goes out when you breathe out.',
      facts: ['Your left lung is a little smaller, to make room for your heart.', 'Lungs have hundreds of millions of tiny air bags called alveoli.', 'You breathe around 20,000 times a day.'],
      shapes: [['path', { d: 'M96 102 Q72 100 66 130 Q62 160 70 166 Q84 168 96 160 Z' }], ['path', { d: 'M104 102 Q128 100 134 130 Q138 160 130 166 Q116 168 104 160 Z' }]] },
    { id: 'heart', sys: 'chest', xsys: 'blood', name: 'Heart', color: '#e5484d', job: 'Pumps blood all around the body',
      info: 'Your heart is a strong muscle that pumps blood through tubes called blood vessels. The blood carries oxygen and food to every part of you.',
      facts: ['Your heart is about the size of your fist.', 'It beats around 100,000 times every day.', 'It has four rooms inside called chambers.'],
      shapes: [['path', { d: 'M108 128 Q100 118 94 126 Q88 136 108 154 Q126 136 120 126 Q114 118 108 128 Z' }]] },
    { id: 'liver', sys: 'digest', name: 'Liver', color: '#b5653a', job: 'Cleans the blood and helps digest fat',
      info: 'Your liver cleans your blood, stores energy for later, and makes bile, a juice that helps break down fatty food.',
      facts: ['It is the biggest organ inside your body.', 'The liver can grow back if part of it is damaged.', 'It does more than 500 different jobs.'],
      shapes: [['path', { d: 'M62 172 Q66 162 84 164 Q102 166 106 174 Q100 186 80 190 Q64 190 62 172 Z' }]] },
    { id: 'stomach', sys: 'digest', name: 'Stomach', color: '#f0b96b', job: 'Mixes food with juices to break it down',
      info: 'Your stomach is a stretchy bag. It squeezes and mixes the food you swallow with strong juices until it turns into a thick soup.',
      facts: ['It can stretch to hold more than a litre of food and drink.', 'Stomach juice is very strong, so a slimy lining protects the stomach.', 'A growling tummy is just gas and liquid moving around.'],
      shapes: [['path', { d: 'M112 166 Q126 162 132 172 Q136 186 124 192 Q112 196 108 186 Q114 180 110 172 Z' }]] },
    { id: 'intestines', sys: 'digest', lv: 's', name: 'Intestines', pl: 1, color: '#f2c48d', job: 'Take in goodness and water from food',
      info: 'After the stomach, food moves through a long tube. The small intestine soaks up the goodness from food, and the large intestine soaks up water.',
      facts: ['Your small intestine is about 6 metres long, all folded up.', 'The large intestine is wider but much shorter.', 'Food can take a day or more to go all the way through.'],
      shapes: [['rect', { x: 78, y: 198, width: 44, height: 36, rx: 10 }], ['path', { d: 'M84 206 Q92 200 100 206 T116 206 M84 216 Q92 210 100 216 T116 216 M84 226 Q92 220 100 226 T116 226', fill: 'none', 'stroke-width': 1.5, class: 'hb-line' }]] },
    { id: 'kidneys', sys: 'clean', back: 1, name: 'Kidneys', pl: 1, color: '#a0446a', job: 'Filter the blood and make urine (pee)',
      info: 'You have two kidneys near your back. They filter your blood, keep the water and goodness you need, and turn waste into urine.',
      facts: ['Each kidney is about the size of a computer mouse.', 'They clean all your blood around 40 times a day.', 'A person can live a healthy life with just one kidney.'],
      shapes: [['path', { d: 'M70 196 Q62 200 64 214 Q66 226 74 224 Q72 212 76 206 Q76 196 70 196 Z' }], ['path', { d: 'M130 196 Q138 200 136 214 Q134 226 126 224 Q128 212 124 206 Q124 196 130 196 Z' }]] },
    { id: 'bladder', sys: 'clean', name: 'Bladder', color: '#f5d76e', job: 'Stores urine until you go to the toilet',
      info: 'Your bladder is a stretchy bag low in your tummy. It holds urine from the kidneys until you are ready to go to the toilet.',
      facts: ['It stretches like a balloon as it fills.', 'Nerves send a message to your brain when it is getting full.', 'An adult bladder holds about two cups of urine.'],
      shapes: [['ellipse', { cx: 100, cy: 243, rx: 11, ry: 8 }]] },
    { id: 'skull', sys: 'bones', name: 'Skull', color: '#e8e0c8', job: 'Protects the brain like a helmet',
      info: 'Your skull is the hard bony case around your brain. It also shapes your face and holds your teeth.',
      facts: ['It is made of 22 bones joined together.', 'Your lower jaw is the only part of the skull that moves.', 'Babies have soft spots in the skull that close up as they grow.'],
      shapes: [['path', { d: 'M100 16 Q128 16 128 44 Q128 60 118 66 L118 74 L82 74 L82 66 Q72 60 72 44 Q72 16 100 16 Z' }], ['path', { d: 'M86 46 a5 5 0 1 0 0.1 0 M114 46 a5 5 0 1 0 0.1 0 M92 66 L108 66', fill: 'none', 'stroke-width': 2, class: 'hb-line' }]] },
    { id: 'spine', sys: 'bones', name: 'Spine', color: '#d9cfa8', job: 'Holds you up and protects the spinal cord',
      info: 'Your spine, or backbone, is a stack of small bones called vertebrae. It holds you upright and protects the spinal cord, the nerve cable from your brain. Behind the chest it is hidden by the ribcage.',
      facts: ['It is made of 33 small bones when you are born.', 'You are a tiny bit taller in the morning than at night.', 'Soft discs between the bones work like cushions.'],
      shapes: [['rect', { x: 95, y: 76, width: 10, height: 168, rx: 4 }], ['path', { d: 'M95 90 H105 M95 104 H105 M95 118 H105 M95 132 H105 M95 146 H105 M95 160 H105 M95 174 H105 M95 188 H105 M95 202 H105 M95 216 H105 M95 230 H105', fill: 'none', 'stroke-width': 2, class: 'hb-line' }]] },
    { id: 'ribcage', sys: 'bones', name: 'Ribcage', color: '#e8e0c8', job: 'Protects the heart and lungs',
      info: 'Your ribs curve around your chest like a cage. The flat breastbone in the middle joins them at the front. They guard your heart and lungs, and move up and out when you breathe in.',
      facts: ['Most people have 12 pairs of ribs.', 'Bendy cartilage joins the ribs to the breastbone, so they can move.', 'Your ribcage moves about 20,000 times a day as you breathe.'],
      shapes: [['rect', { x: 95, y: 98, width: 10, height: 54, rx: 3 }], ['path', { d: 'M96 100 Q66 104 64 166 L74 168 Q76 120 96 112 Z M104 100 Q134 104 136 166 L126 168 Q124 120 104 112 Z' }], ['path', { d: 'M70 124 Q84 118 96 124 M68 138 Q84 132 96 138 M68 152 Q84 146 96 152 M104 124 Q116 118 130 124 M104 138 Q116 132 132 138 M104 152 Q116 146 132 152', fill: 'none', 'stroke-width': 3, class: 'hb-bone' }]] },
    { id: 'biceps', sys: 'muscles', name: 'Biceps', color: '#d9534f', job: 'Bends your arm at the elbow',
      info: 'The biceps is the muscle at the front of your upper arm. When it gets shorter it pulls your lower arm up and bends your elbow.',
      facts: ['Muscles can only pull, never push.', 'The triceps at the back of your arm pulls it straight again.', 'Muscles get stronger when you use them.'],
      shapes: [['ellipse', { cx: 47, cy: 140, rx: 7, ry: 22, transform: 'rotate(4 47 140)' }], ['ellipse', { cx: 153, cy: 140, rx: 7, ry: 22, transform: 'rotate(-4 153 140)' }]] },
    { id: 'abs', sys: 'muscles', name: 'Tummy muscles', pl: 1, color: '#e07a6a', job: 'Hold you up and help you bend and twist',
      info: 'Your tummy muscles, or abs, wrap around your middle. They help you sit up, bend, twist and keep your balance, and they protect the organs inside.',
      facts: ['Everyone has these muscles, even if you can\u2019t see them.', 'They help you cough, laugh and breathe out hard.', 'Strong tummy muscles help protect your back.'],
      shapes: [['rect', { x: 80, y: 170, width: 40, height: 66, rx: 10 }], ['path', { d: 'M100 172 V234 M82 192 H118 M82 213 H118', fill: 'none', 'stroke-width': 2, class: 'hb-line' }]] },
    { id: 'thigh', sys: 'muscles', name: 'Thigh muscles', pl: 1, color: '#c9453e', job: 'Straighten your knee so you can walk and jump',
      info: 'The big muscles at the front of your thigh are called the quadriceps. They straighten your knee when you walk, run, kick and jump.',
      facts: ['Quadriceps means four heads: it is four muscles working together.', 'They are some of the strongest muscles in your body.', 'Inside the thigh is the femur, your longest bone.'],
      shapes: [['ellipse', { cx: 81, cy: 290, rx: 13, ry: 38 }], ['ellipse', { cx: 119, cy: 290, rx: 13, ry: 38 }]] }
  ];

  // level-aware helpers (Simple / Expert). H.level is set by the app; parts-expert.js adds more parts and calls H.reindex().
  H.level = 'simple';
  const X = () => H.level === 'expert';
  H.reindex = () => { H.byId = {}; H.parts.forEach(p => { H.byId[p.id] = p; }); };
  H.inLevel = p => X() ? p.lv !== 's' : p.lv !== 'x';
  H.sysOf = p => X() && p.xsys ? p.xsys : p.sys;
  H.gname = g => X() && g.xname ? g.xname : g.name;
  H.groupsNow = () => H.groups.filter(g => X() || !g.x);
  H.viewsNow = () => [{ id: 'organs', name: 'All organs', icon: '\u{1FAC0}', groups: ['brain', 'chest', 'blood', 'digest', 'clean'] }]
    .concat(H.groupsNow().map(g => ({ id: g.id, name: H.gname(g), icon: g.icon, groups: [g.id] })));
  H.levelParts = () => H.parts.filter(H.inLevel);
  H.partsOf = viewId => {                               // parts drawn in a view: back parts first, so front parts sit on top
    const v = H.viewsNow().find(x => x.id === viewId) || H.viewsNow()[0];
    const list = H.levelParts().filter(p => v.groups.indexOf(H.sysOf(p)) >= 0 && !(v.id === 'organs' && p.noall));
    return list.filter(p => p.back).concat(list.filter(p => !p.back));
  };
  H.groupOf = p => H.groups.find(g => g.id === H.sysOf(p));
  H.reindex();
})();
