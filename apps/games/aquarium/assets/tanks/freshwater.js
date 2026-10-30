// Aquarium AQQ1c: Freshwater tank - the original river tank (sunlit water, sand, rocks, waving weed).
window.AQ.registerTank({ id: 'freshwater', name: 'Freshwater',
  water: ['#46c8da', '#1d8db5', '#0f4d7e', '#0a2f57'], haze: 'rgba(15,77,126,.35)', sand: ['#e9d69c', '#b4955a'], grain: ['rgba(255,248,210,.35)', 'rgba(110,80,40,.3)'],
  rays: 1, rocks: 1, flora: { kind: 'blades', every: 70, h: [.14, .26], w: 5, hue: [105, 45], sat: 55, lit: [26, 14], blades: [2, 3], sway: 16 }, bubbles: 28,
  fish: [['pleco', 1], ['goldfish', 3], ['angelfish', 3], ['guppy', 6], ['neon', 10]] });
