/* Island Conquest — tunable data only. Other files read IslandConquest.config. */
(function () {
  const IC = window.IslandConquest = window.IslandConquest || {};
  IC.config = {
    app: { name: 'Island Conquest', version: '1.0', author: 'Jor Teron', category: 'Games' },
    owner: { neutral: 0, player: 1, ai: 2 },
    world: 1000,
    growth: { base: 0.32, perRadius: 0.036 },
    ship: { speed: 210, minFleet: 0.75, ratios: [0.25, 0.5, 1] },
    input: { dragPx: 14, reticle: 340 },
    startTroops: 28,
    homeRadius: 52,
    randomJitter: 64,
    randomRadius: [30, 22],
    randomTroops: [8, 14],
    randomSpots: [
      [180, 180], [500, 130], [820, 200],
      [150, 500], [500, 500], [850, 500],
      [190, 820], [500, 870], [820, 800],
    ],
    handicap: {
      easy: { player: 1.3, ai: 0.68 },
      normal: { player: 1, ai: 1 },
    },
    ai: {
      easy: {
        interval: 2.5, send: 0.42, advantage: 1.5, neutralNeed: 1.12,
        neutralBias: 1.45, attackBias: 0.5, maxDist: 480, reserve: 12, launches: 1,
      },
      normal: {
        interval: 1.15, send: 0.58, advantage: 1.06, neutralNeed: 0.95,
        neutralBias: 1, attackBias: 1.3, maxDist: 1400, reserve: 8, launches: 2,
      },
    },
    difficulties: [
      { id: 'easy', label: 'Easy' },
      { id: 'normal', label: 'Normal' },
    ],
    maps: [
      {
        id: 'atoll', name: 'Atoll',
        islands: [
          { x: 170, y: 800, r: 56, owner: 1, troops: 26 },
          { x: 830, y: 190, r: 56, owner: 2, troops: 26 },
          { x: 340, y: 630, r: 40, owner: 0, troops: 15 },
          { x: 520, y: 470, r: 46, owner: 0, troops: 22 },
          { x: 700, y: 340, r: 36, owner: 0, troops: 12 },
          { x: 210, y: 430, r: 34, owner: 0, troops: 10 },
          { x: 790, y: 640, r: 34, owner: 0, troops: 11 },
          { x: 470, y: 170, r: 30, owner: 0, troops: 8 },
          { x: 530, y: 830, r: 30, owner: 0, troops: 9 },
        ],
      },
      {
        id: 'strait', name: 'Strait',
        islands: [
          { x: 150, y: 280, r: 50, owner: 1, troops: 22 },
          { x: 155, y: 730, r: 42, owner: 1, troops: 16 },
          { x: 850, y: 270, r: 50, owner: 2, troops: 22 },
          { x: 845, y: 720, r: 42, owner: 2, troops: 16 },
          { x: 500, y: 160, r: 34, owner: 0, troops: 12 },
          { x: 500, y: 500, r: 48, owner: 0, troops: 24 },
          { x: 500, y: 840, r: 34, owner: 0, troops: 12 },
          { x: 320, y: 500, r: 32, owner: 0, troops: 10 },
          { x: 680, y: 500, r: 32, owner: 0, troops: 10 },
        ],
      },
      { id: 'random', name: 'Random' },
    ],
    colors: {
      seaTop: '#1a7e9c', seaMid: '#0c556f', seaBottom: '#062433',
      wave: 'rgba(214, 244, 236, 0.16)',
      shallow: 'rgba(126, 206, 190, 0.28)',
      sandHi: '#f7e6b8', sand: '#c9964e',
      grass: ['#8e99a6', '#217a58', '#b8433e'],
      grassHi: ['#d5dde4', '#8fd4b0', '#f3b2aa'],
      paper: '#f7f3ea', ink: '#24180c',
      select: '#ffe08a', hull: ['#e7eef2', '#f3fffb', '#fff0ec'],
      sail: ['#7d868f', '#114838', '#7c2430'],
      wake: 'rgba(255,255,255,0.55)',
    },
    text: {
      title: 'Island Conquest',
      tagline: 'Grow your islands. Send fleets. Take the sea.',
      help: 'Tap your islands to select them. Drag to any island to send, including your own. Keys 1 2 3 set fleet size, arrows and Space aim, A selects all, P pauses.',
      hint: 'Select your islands, then tap or drag to a target.',
      paused: 'Paused',
      pausedMsg: 'The tide is holding.',
      victory: 'Victory',
      victoryMsg: 'The AI has no islands and no ships.',
      defeat: 'Defeat',
      defeatMsg: 'You have no islands and no ships left.',
      start: 'Start',
      resume: 'Resume',
      restart: 'Restart',
      menu: 'Menu',
    },
  };
})();
