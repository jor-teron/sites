/* Human Body Explorer HBE3 — External view data: 38 outside parts on a neutral figure (front and back), plus the
   tab-aware helpers. Kid-friendly and neutral: no private or reproductive parts are drawn or listed.
   Part: id 'e-...', sys (external group), side 'front' | 'back' | 'both', shapes (front) and bshapes (back), fill = natural colour
   for visible features (hair, eyes, lips...) or none = a tap zone that only tints and glows when picked. all: 1 = also in Whole body.
   H.tab = 'external' (default on open) | 'inside'. H.side = 'front' | 'back' (External only). */
window.HB = window.HB || {};
(() => {
  const H = window.HB;
  const E = (cx, cy, rx, ry, more) => ['ellipse', Object.assign({ cx, cy, rx, ry }, more || {})];
  const D = (d, more) => ['path', Object.assign({ d }, more || {})];
  const deco = (d, fill, stroke, w) => ['path', { d, class: 'hb-deco', fill: fill || 'none', stroke: stroke || 'none', 'stroke-width': w || 0 }];
  const mx = (x, s) => s === 1 ? x : 200 - x;
  const MOUTH = { transform: 'translate(100 65) scale(.84) translate(-100 -65)' };      // lips, mouth, teeth, tongue: drawn at 84% so the smile fits the face
  const both = f => [f(1), f(-1)];
  const bothD = f => [D(f(1)), D(f(-1))];            // f(s) returns path data for one side
  // P(id, sys, name, color, job, info, facts, front shapes, back shapes, more)
  const P = (id, sys, name, color, job, info, facts, shapes, bshapes, more) => Object.assign({ id: 'e-' + id, ext: 1, sys, name, color, job, info, facts,
    shapes: shapes || [], bshapes: bshapes || [], side: shapes && bshapes ? 'both' : bshapes ? 'back' : 'front' }, more || {});

  H.extGroups = [
    { id: 'e-face', name: 'Head and face', icon: '\u{1F642}', vb: '62 6 76 76' },
    { id: 'e-trunk', name: 'Neck and body', icon: '\u{1F455}', vb: '34 62 132 196' },
    { id: 'e-arms', name: 'Arms', icon: '\u{1F4AA}', vb: '12 88 176 160' },
    { id: 'e-hands', name: 'Hands', icon: '\u270B', vb: '21 224 32 42' },
    { id: 'e-legs', name: 'Legs', icon: '\u{1F9B5}', vb: '48 244 104 160' },
    { id: 'e-feet', name: 'Feet', icon: '\u{1F9B6}', vb: '58 384 46 32' },
    { id: 'e-whole', name: 'Whole body', icon: '\u{1F9CD}', x: 1 }       // x: only used as the skin's group in List
  ];

  // finger: rounded strip from (x, y0) down to y1, width w (front view, hand hanging down)
  const finger = (x, y0, y1, w) => `M${x - w / 2} ${y0} L${x - w / 2} ${y1 - w / 2} A${w / 2} ${w / 2} 0 0 0 ${x + w / 2} ${y1 - w / 2} L${x + w / 2} ${y0} Z`;
  const fingersOf = s => [[34.4, 260], [37.4, 262], [40.4, 261], [43.2, 258]].map(([x, y1]) => D(finger(mx(x, s), 248, s === 1 ? y1 : y1, 2.6)));
  const thumbOf = s => D(`M${mx(32.4, s)} 238 Q${mx(28.6, s)} 243 ${mx(28.8, s)} 250 Q${mx(29.6, s)} 252.6 ${mx(31.4, s)} 251 Q${mx(32, s)} 246 ${mx(34.6, s)} 243 Z`);

  H.ext = [
    // ---- head and face ----
    P('hair', 'e-face', 'Hair', '#a0703f', 'Keeps your head warm and safe from sun',
      'Hair grows out of tiny pockets in your skin called follicles. The hair on your head keeps you warm and shades your scalp from the sun.',
      ['You have about 100,000 hairs on your head.', 'Hair grows about 1 cm every month.', 'You lose 50 to 100 hairs a day, and new ones grow back.'],
      [D('M75 38 C73 20 86 10 100 10 C114 10 127 20 125 38 C121 27 112 21 100 22 C88 21 79 27 75 38 Z')],
      [D('M74 44 C72 22 86 10 100 10 C114 10 128 22 126 44 C126 58 118 67 100 68 C82 67 74 58 74 44 Z')], { fill: '#5b3a24', all: 1 }),
    P('forehead', 'e-face', 'Forehead', '#ffcf7a', 'The top of your face, above the eyes',
      'Your forehead is the part of your face between your eyebrows and your hair. Underneath it is the strong front bone of your skull.',
      ['Your forehead moves when you frown or look surprised.', 'Sweat on the forehead helps cool your head.', 'Doctors sometimes check your temperature here.'],
      [E(100, 30, 15, 5.5)]),
    P('eyebrows', 'e-face', 'Eyebrows', '#d08b52', 'Keep sweat and rain out of your eyes',
      'Eyebrows are the curved lines of hair above your eyes. They stop sweat and rain running into your eyes and help show how you feel.',
      ['Raised eyebrows can show surprise.', 'Each eyebrow has about 250 hairs.', 'People can often recognise faces just from the eyebrows.'],
      [D('M83.5 38.5 Q89 34.6 95.5 37.4 L95.2 39 Q89 36.8 83.8 40 Z'), D('M116.5 38.5 Q111 34.6 104.5 37.4 L104.8 39 Q111 36.8 116.2 40 Z')], null, { fill: '#4a2f1d', pl: 1 }),
    P('eyes', 'e-face', 'Eyes', '#7cc6ff', 'Let you see colours, shapes and movement',
      'Your eyes let in light through the dark circle in the middle, the pupil. The coloured ring around it, the iris, makes the pupil bigger or smaller.',
      ['You blink about 15 to 20 times a minute.', 'Eyelashes catch dust before it gets in.', 'No two people have exactly the same iris pattern.'],
      [D('M83 44 Q89 39.2 95 44 Q89 48.4 83 44 Z'), D('M105 44 Q111 39.2 117 44 Q111 48.4 105 44 Z'),
        deco('M86.8 44 a2.2 2.2 0 1 0 4.4 0 a2.2 2.2 0 1 0 -4.4 0 M108.8 44 a2.2 2.2 0 1 0 4.4 0 a2.2 2.2 0 1 0 -4.4 0', '#6b4a2b'),
        deco('M88.1 44 a0.9 0.9 0 1 0 1.8 0 a0.9 0.9 0 1 0 -1.8 0 M110.1 44 a0.9 0.9 0 1 0 1.8 0 a0.9 0.9 0 1 0 -1.8 0', '#15110e'),
        deco('M88.6 42.9 a0.45 0.45 0 1 0 0.9 0 a0.45 0.45 0 1 0 -0.9 0 M110.6 42.9 a0.45 0.45 0 1 0 0.9 0 a0.45 0.45 0 1 0 -0.9 0', '#fff'),
        deco('M83 44 Q89 39.2 95 44 M105 44 Q111 39.2 117 44', 'none', '#3b2618', 0.8)], null, { fill: '#fbfaf5', pl: 1 }),
    P('ears', 'e-face', 'Ears', '#f0a35e', 'Catch sounds and help you balance',
      'The outside part of your ear is shaped like a funnel to catch sound and send it inside your head. Deep inside, your ears also help you keep your balance.',
      ['The outer ear is made of bendy cartilage, not bone.', 'Your ears keep growing slowly all your life.', 'Earwax traps dust and germs.'],
      both(s => E(mx(74.6, s), 46, 4, 7.5)), both(s => E(mx(74, s), 46, 4, 7.5)), { pl: 1, fill: '#d99c7a', under: 1 }),
    P('nose', 'e-face', 'Nose', '#e8a07a', 'Smells things and cleans the air you breathe',
      'Air goes in and out through the two holes in your nose, called nostrils. Tiny hairs and sticky mucus inside catch dust, and the top of your nose smells things.',
      ['You can smell thousands of different smells.', 'Your nose makes about a cup of mucus a day.', 'The tip of your nose is cartilage, so it can bend.'],
      [D('M100 43 C99 48.5 96 52.5 95.2 55.4 Q100 58.6 104.8 55.4 C104 52.5 101 48.5 100 43 Z'),
        deco('M97.2 55.6 a1 0.6 0 1 0 2 0 a1 0.6 0 1 0 -2 0 M100.8 55.6 a1 0.6 0 1 0 2 0 a1 0.6 0 1 0 -2 0', 'rgba(90,40,30,.55)')], null, { fill: 'rgba(170,100,70,.3)' }),
    P('cheeks', 'e-face', 'Cheeks', '#ff9eb0', 'The soft sides of your face',
      'Your cheeks are the soft parts of your face under your eyes. Muscles in them help you smile, chew and blow.',
      ['Cheeks go pink when you are hot, cold or shy, because more blood flows there.', 'Dimples are small dips in some people\u2019s cheeks.', 'Babies have chubby cheeks that help them suck milk.'],
      both(s => E(mx(84.5, s), 54, 6, 4.4)), null, { pl: 1 }),
    P('lips', 'e-face', 'Lips', '#e5707e', 'Help you talk, eat and smile',
      'Your lips are the soft edges of your mouth. They help you make sounds when you talk, keep food in your mouth and show a smile.',
      ['Lips are red or pink because the skin is thin, so blood shows through.', 'Lips have no sweat glands, so they dry out easily.', 'They are one of the most touch-sensitive parts of you.'],
      [D('M88 62.8 Q95 58.6 100 60.4 Q105 58.6 112 62.8 Q106 72 100 72 Q94 72 88 62.8 Z M91 63 Q100 65.6 109 63 Q100 74 91 63 Z', Object.assign({ 'fill-rule': 'evenodd' }, MOUTH))], null, { fill: '#cc6f74', pl: 1 }),
    P('mouth', 'e-face', 'Mouth', '#ff7b8a', 'Where eating, talking and tasting start',
      'Your mouth is where food goes in. You chew it with your teeth, wet it with spit and push it around with your tongue before you swallow.',
      ['Your mouth makes about 1 litre of spit every day.', 'Spit starts breaking down food straight away.', 'You use your mouth to make most of the sounds in words.'],
      [D('M91 63 Q100 65.6 109 63 Q100 74 91 63 Z', MOUTH)], null, { fill: '#5a1f2a' }),
    P('teeth', 'e-face', 'Teeth', '#e9eef2', 'Bite and chew your food',
      'Teeth cut, tear and grind food into small pieces. Children have 20 baby teeth, and later about 32 adult teeth grow in their place.',
      ['Tooth enamel is the hardest thing in your body.', 'Brush twice a day to keep germs away.', 'Your first teeth come in when you are a baby.'],
      [D('M92.8 63.6 Q100 66 107.2 63.6 L106.4 65.2 Q100 67.2 93.6 65.2 Z', MOUTH), ['path', Object.assign({ d: 'M97.6 64.8 v1.4 M100 65.2 v1.5 M102.4 64.8 v1.4', class: 'hb-deco', fill: 'none', stroke: 'rgba(0,0,0,.18)', 'stroke-width': 0.3 }, MOUTH)]], null, { fill: '#f7f7f2', pl: 1 }),
    P('tongue', 'e-face', 'Tongue', '#ff8fa3', 'Tastes food and helps you speak',
      'Your tongue is a strong, bendy muscle covered in taste buds. It tastes sweet, salty, sour and bitter, and moves food around as you chew.',
      ['You have thousands of taste buds.', 'Your tongue helps you say words like \u201Cla\u201D and \u201Cthe\u201D.', 'Everyone\u2019s tongue print is different.'],
      [E(100, 67.6, 3.6, 0.9, MOUTH)], null, { fill: '#ef8a96' }),
    P('chin', 'e-face', 'Chin', '#ffb37a', 'The bottom of your face',
      'Your chin is the front of your lower jaw. The jaw moves up and down so you can talk and chew.',
      ['Humans are the only animals with a real chin.', 'The jaw is the only bone in your head that moves.', 'Your chin helps protect your mouth and teeth.'],
      [E(100, 73.6, 7, 1.3)]),
    // ---- neck and body ----
    P('neck', 'e-trunk', 'Neck', '#9bd0ff', 'Holds up your head and lets it turn',
      'Your neck joins your head to your body. Inside it are your windpipe, food pipe, big blood vessels and the top of your spine.',
      ['Your neck has 7 small bones, the same as a giraffe.', 'It lets you nod, shake and turn your head.', 'Your head weighs about as much as a bowling ball.'],
      [D('M90 74 L110 74 L111.5 87 Q100 91 88.5 87 Z')], [D('M90 70 L110 70 L111.5 87 Q100 91 88.5 87 Z')], { all: 1 }),
    P('shoulders', 'e-trunk', 'Shoulders', '#8fd6b4', 'Let your arms swing and reach all around',
      'Your shoulders are where your arms join your body. The shoulder joint is a ball in a cup, so your arm can move in big circles.',
      ['The shoulder moves in more ways than any other joint.', 'Shrugging uses muscles on top of your shoulders.', 'Carrying a heavy bag on one shoulder can make your back ache.'],
      both(s => E(mx(56, s), 101, 11, 7, { transform: `rotate(${s * -20} ${mx(56, s)} 101)` })), both(s => E(mx(56, s), 101, 11, 7, { transform: `rotate(${s * -20} ${mx(56, s)} 101)` })), { pl: 1, all: 1 }),
    P('chest', 'e-trunk', 'Chest', '#ff9f8a', 'Covers your heart and lungs',
      'Your chest is the front of your upper body. Under the skin and muscles, your ribs make a strong cage around your heart and lungs.',
      ['Your chest gets bigger when you breathe in.', 'You can feel your heartbeat on the left side of your chest.', 'The flat bone in the middle is the breastbone.'],
      [D('M68 106 Q100 99 132 106 L131 138 Q100 145 69 138 Z')], null, { all: 1 }),
    P('belly', 'e-trunk', 'Belly', '#ffd27a', 'The soft front of your middle, over your tummy',
      'Your belly, or tummy, is the front of your body between your chest and your hips. Strong muscles here protect the stomach and intestines inside.',
      ['Your belly rises and falls a little as you breathe.', 'Tummy rumbles come from food and air moving inside.', 'Belly muscles help you sit up and bend.'],
      [D('M70 150 Q100 145 130 150 L130 192 Q100 199 70 192 Z')], null, { all: 1 }),
    P('navel', 'e-trunk', 'Belly button', '#ffb85c', 'Where you were joined to your mother before birth',
      'Your belly button, or navel, is a small scar. Before you were born, a tube there brought you food and oxygen. After birth it dried up and left the belly button.',
      ['Everyone has a belly button.', 'Some belly buttons go in and some stick out.', 'It is a scar, so it does not do a job any more.'],
      [E(100, 182, 2.4, 3)], null, { fill: '#b57d5e' }),
    P('back', 'e-trunk', 'Back', '#b39ddb', 'The strong back of your body, along your spine',
      'Your back runs from your neck to your hips. Your spine goes down the middle, and strong back muscles keep you standing up straight.',
      ['You cannot see your own back without a mirror.', 'Lifting with bent knees protects your back.', 'Sitting up straight is good for your back.'],
      null, [D('M64 104 Q100 97 136 104 L135 198 Q100 205 65 198 Z')], { all: 1 }),
    P('waist', 'e-trunk', 'Waist', '#80cbc4', 'The narrow middle of your body',
      'Your waist is the narrow part of your body between your ribs and your hips. It lets you bend and twist.',
      ['A belt or waistband sits around your waist.', 'Twisting at the waist uses side muscles.', 'Your waist has no bones at the front, only the spine at the back.'],
      [D('M63 200 Q100 207 137 200 L138 216 Q100 223 62 216 Z')], [D('M64 204 Q100 211 136 204 L138 220 Q100 227 62 220 Z')], { all: 1 }),
    P('hips', 'e-trunk', 'Hips', '#90a4ff', 'Join your legs to your body',
      'Your hips are the wide parts at the sides, below your waist. The hip joint is a ball in a cup that lets your leg swing when you walk.',
      ['The hip joint carries your weight with every step.', 'Your hip bones form a bowl called the pelvis.', 'Hips help you climb, kick and sit.'],
      both(s => E(mx(67, s), 238, 8.5, 13)), both(s => E(mx(67, s), 238, 8.5, 13)), { pl: 1, all: 1 }),
    // ---- arms ----
    P('upperarm', 'e-arms', 'Upper arm', '#ff9d6e', 'From your shoulder to your elbow',
      'The upper arm goes from your shoulder to your elbow. Inside is one long bone, the humerus, and muscles like the biceps and triceps.',
      ['The biceps on the front bends your elbow.', 'The triceps at the back straightens it.', 'The funny bone is not a bone: it is a nerve near the elbow.'],
      bothD(s => `M${mx(46, s)} 113 L${mx(57.5, s)} 125 L${mx(49.5, s)} 165 L${mx(38.5, s)} 165 Z`), bothD(s => `M${mx(46, s)} 113 L${mx(57.5, s)} 125 L${mx(49.5, s)} 165 L${mx(38.5, s)} 165 Z`), { all: 1 }),
    P('elbow', 'e-arms', 'Elbow', '#ffcc80', 'The joint that bends your arm in the middle',
      'Your elbow is a hinge joint, like a door hinge. It lets your arm bend and straighten, so you can bring food to your mouth.',
      ['The bony tip at the back of the elbow is called the olecranon.', 'Hitting your funny bone tingles because a nerve is close to the skin.', 'You cannot lick your own elbow!'],
      both(s => E(mx(43.4, s), 171.5, 6, 5.5)), both(s => E(mx(43.4, s), 171.5, 6, 5.5)), { all: 1 }),
    P('forearm', 'e-arms', 'Forearm', '#ffab91', 'From your elbow to your wrist',
      'Your forearm runs from your elbow to your wrist. It has two bones, the radius and ulna, that can twist to turn your hand over.',
      ['Muscles that move your fingers are mostly in the forearm.', 'Turn your palm up and down: the two bones cross over.', 'Your forearm is about as long as your foot.'],
      bothD(s => `M${mx(37.6, s)} 178 L${mx(48.6, s)} 178 L${mx(45, s)} 225 L${mx(34, s)} 225 Z`), bothD(s => `M${mx(37.6, s)} 178 L${mx(48.6, s)} 178 L${mx(45, s)} 225 L${mx(34, s)} 225 Z`), { all: 1 }),
    P('wrist', 'e-arms', 'Wrist', '#ffe082', 'Lets your hand bend and turn',
      'Your wrist joins your hand to your arm. Eight tiny bones in it let your hand bend up, down and side to side.',
      ['You can feel your pulse on the inside of your wrist.', 'A watch is worn on the wrist.', 'The wrist has 8 small bones called carpals.'],
      both(s => E(mx(39.5, s), 230, 5.6, 3)), both(s => E(mx(39.5, s), 230, 5.6, 3))),
    // ---- hands ----
    P('palm', 'e-hands', 'Palm', '#ffcf9e', 'The inside of your hand, for gripping',
      'Your palm is the inside of your hand. Its skin is thick and has lines and ridges that help you grip things without slipping.',
      ['Palms have no hair.', 'Palm lines are creases where your hand folds.', 'Palms sweat a little to help you grip.'],
      both(s => D(`M${mx(33.4, s)} 234 Q${mx(39.5, s)} 232.4 ${mx(45.2, s)} 235.4 L${mx(45, s)} 248.6 Q${mx(39.5, s)} 250.6 ${mx(33, s)} 248.4 Z`)), null),
    P('fingers', 'e-hands', 'Fingers', '#ffd54f', 'Hold, feel and pick up things',
      'You have four fingers on each hand plus a thumb. Each finger has three small bones, and the fingertips are very good at feeling.',
      ['Fingers have no muscles inside: tendons pull them from the forearm.', 'Your fingerprints are unique to you.', 'The middle finger is the longest.'],
      [].concat(fingersOf(1), fingersOf(-1)), [].concat(fingersOf(1), fingersOf(-1)), { pl: 1, fill: '#efc3a2' }),
    P('thumb', 'e-hands', 'Thumb', '#ffb74d', 'Works with your fingers to pinch and grip',
      'Your thumb can touch each of your fingers. This lets you pinch, hold a pencil and pick up tiny things.',
      ['The thumb has only two bones, the fingers have three.', 'Your thumb does about half the work of your hand.', 'Thumbs help you text and play games.'],
      both(thumbOf), both(thumbOf), { fill: '#efc3a2' }),
    P('nails', 'e-hands', 'Nails', '#f8bbd0', 'Protect your fingertips and help you scratch',
      'Nails are hard plates on the backs of your fingertips, made of keratin, the same stuff as hair. They protect your fingertips and help you pick up small things.',
      ['Fingernails grow about 3 mm a month.', 'Cutting nails does not hurt because they have no nerves.', 'Nails on your hands grow faster than on your toes.'],
      null, [].concat(...[1, -1].map(s => [[34.4, 260], [37.4, 262], [40.4, 261], [43.2, 258]].map(([x, y1]) => D(finger(mx(x, s), y1 - 3.6, y1 - 0.3, 2)))),
        both(s => E(mx(29.7, s), 249.6, 1.1, 1.5))), { fill: '#f6d7d2', pl: 1 }),
    P('knuckles', 'e-hands', 'Knuckles', '#ce93d8', 'The finger joints that let your fingers bend',
      'Knuckles are the joints in your fingers. Make a fist and the bumps on the back of your hand are your big knuckles.',
      ['Each finger has three knuckles, each thumb has two.', 'Cracking knuckles is just gas bubbles popping in the joint.', 'Knuckles help you grip and make a fist.'],
      null, [].concat(...[1, -1].map(s => [34.4, 37.4, 40.4, 43.2].map(x => E(mx(x, s), 250.4, 1.5, 1.1)))), { pl: 1 }),
    // ---- legs ----
    P('thigh', 'e-legs', 'Thigh', '#a5d6a7', 'The top part of your leg, very strong',
      'Your thigh goes from your hip to your knee. Inside is the femur, the longest and strongest bone in your body, with big muscles around it.',
      ['The femur is about a quarter of your height.', 'Thigh muscles help you jump and climb stairs.', 'Your thighs carry you when you run.'],
      bothD(s => `M${mx(62.5, s)} 258 L${mx(97, s)} 260 L${mx(93.5, s)} 330 L${mx(68, s)} 330 Z`), bothD(s => `M${mx(62.5, s)} 258 L${mx(97, s)} 260 L${mx(93.5, s)} 330 L${mx(68, s)} 330 Z`), { all: 1 }),
    P('knee', 'e-legs', 'Knee', '#fff59d', 'The joint that bends your leg',
      'Your knee is the biggest joint in your body. It works like a hinge so you can bend your leg to walk, sit and kick. A small bone, the kneecap, protects the front.',
      ['Babies are born without a hard kneecap; it forms later.', 'Knee pads protect knees when you skate.', 'Your knee takes a lot of weight when you jump.'],
      both(s => E(mx(80.6, s), 340, 9, 7.5)), null, { pl: 0, all: 1 }),
    P('shin', 'e-legs', 'Shin', '#81d4fa', 'The front of your lower leg',
      'Your shin is the front of your leg below the knee. The shinbone, or tibia, is just under the skin, which is why bumping it hurts so much.',
      ['The tibia is the second-longest bone in your body.', 'Footballers wear shin pads.', 'You can feel the hard bone right under the skin.'],
      bothD(s => `M${mx(71.5, s)} 350 L${mx(91, s)} 350 L${mx(89, s)} 391 L${mx(75, s)} 391 Z`), null, { all: 1 }),
    P('calf', 'e-legs', 'Calf', '#f48fb1', 'The soft back of your lower leg',
      'Your calf is the round, muscly back of your lower leg. Calf muscles lift your heel so you can walk, run and stand on tiptoe.',
      ['Calf muscles join the heel by the Achilles tendon.', 'They help push blood back up to your heart.', 'You use them every time you take a step.'],
      null, both(s => E(mx(79.5, s), 366, 10, 17)), { all: 1 }),
    // ---- feet ----
    P('ankle', 'e-feet', 'Ankle', '#b0bec5', 'Lets your foot point and turn',
      'Your ankle joins your leg to your foot. It lets your foot point up and down and tilt, so you can walk on bumpy ground.',
      ['Twisting your ankle is a very common injury.', 'The bumps on each side are ends of leg bones.', 'Ankles carry your whole weight.'],
      both(s => E(mx(82, s), 396, 7, 3.6)), both(s => E(mx(82, s), 396, 7, 3.6)), { pl: 0 }),
    P('foot', 'e-feet', 'Foot', '#a1887f', 'Holds you up and pushes you forward',
      'Your feet carry your weight and push you forward when you walk. Each foot has 26 bones and an arch that works like a spring.',
      ['A quarter of all your bones are in your feet.', 'Your feet have about 250,000 sweat glands.', 'The arch helps soak up bumps.'],
      bothD(s => `M${mx(70, s)} 401 Q${mx(82, s)} 397.6 ${mx(93.5, s)} 401.5 L${mx(94.6, s)} 408.4 Q${mx(82, s)} 410.4 ${mx(67.6, s)} 408.4 Z`), null, { all: 1 }),
    P('toes', 'e-feet', 'Toes', '#ffccbc', 'Help you balance and push off',
      'You have five toes on each foot. They grip the ground, help you balance and push off when you walk or run.',
      ['The big toe carries the most weight.', 'Toes have 14 bones in each foot.', 'Wiggling your toes keeps your feet strong.'],
      [].concat(...[1, -1].map(s => [[92.4, 3.2], [87.8, 2.4], [83.6, 2.2], [79.8, 2], [76.2, 1.8]].map(([x, r]) => E(mx(x, s), 410.6, r, 2)))), null, { pl: 1, fill: '#eebd9c' }),
    P('heel', 'e-feet', 'Heel', '#bcaaa4', 'The round back of your foot that lands first',
      'Your heel is the round back part of your foot. When you walk, your heel usually touches the ground first. The heel bone is the biggest bone in your foot.',
      ['A thick pad of fat cushions your heel.', 'The Achilles tendon pulls on your heel.', 'Running on tiptoe takes weight off the heel.'],
      null, both(s => E(mx(81.6, s), 407, 7.4, 5)), { all: 0 }),
    // ---- whole body ----
    P('skin', 'e-whole', 'Skin', '#d9a982', 'Covers and protects your whole body',
      'Skin is the biggest organ of your body. It keeps germs out and water in, helps you stay the right temperature and lets you feel touch, heat and cold.',
      ['Your skin replaces itself about every month.', 'Sweat cools you down as it dries.', 'Skin colour comes from melanin, which protects against the sun.'],
      [], [], { skin: 1, side: 'both', all: 1 })
  ];
  // whole-body skin taps: the outline itself (filled in by art.js once the smooth outline exists)

  // ---- tab-aware helpers (wrap the Inside ones from parts.js) ----
  H.tab = 'external'; H.side = 'front';
  const IN = { levelParts: H.levelParts, viewsNow: H.viewsNow, partsOf: H.partsOf, groupOf: H.groupOf, groupsNow: H.groupsNow, reindex: H.reindex };
  const EXT = () => H.tab === 'external';
  H.isExtView = id => String(id).startsWith('e-');
  H.reindex = () => { IN.reindex(); H.ext.forEach(p => { H.byId[p.id] = p; }); };
  H.levelParts = () => EXT() ? H.ext : IN.levelParts();
  H.groupsNow = () => EXT() ? H.extGroups : IN.groupsNow();
  H.viewsNow = () => EXT() ? [{ id: 'e-all', name: 'Whole body', icon: '\u{1F9CD}', groups: H.extGroups.map(g => g.id), vb: '0 0 200 420' }]
    .concat(H.extGroups.filter(g => !g.x).map(g => ({ id: g.id, name: g.name, icon: g.icon, groups: [g.id], vb: g.vb }))) : IN.viewsNow();
  H.onSide = (p, side) => p.side === 'both' || p.side === (side || H.side);
  H.partsOf = (viewId, side) => {
    if (!H.isExtView(viewId)) return IN.partsOf(viewId);
    const v = H.viewsNow().find(x => x.id === viewId) || H.viewsNow()[0];
    return H.ext.filter(p => (v.id === 'e-all' ? p.all : v.groups.indexOf(p.sys) >= 0) && (side === 'any' || H.onSide(p, side)))
      .sort((a, b) => (b.skin ? 1 : 0) - (a.skin ? 1 : 0));         // skin first, so every other part sits on top of it
  };
  H.groupOf = p => p.ext ? H.extGroups.find(g => g.id === p.sys) : IN.groupOf(p);
  H.reindex();
})();
