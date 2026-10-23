import { GROUND_Y } from './config.js?v=sb1a';

// Helpers: place by bottom edge / surface so stacks rest exactly (1px gap)
const G = GROUND_Y;
const box = (x, bottom, w, h, material) => ({ x, y: bottom - h / 2 - 0.5, w, h, material });
const ball = (x, bottom, r, material) => ({ x, y: bottom - r - 0.5, r, material });
const pig = (x, surface, r = 20) => ({ x, y: surface - r - 1, r });

export const LEVELS = [
  {
    name: 'Simple Tower',
    birds: 3,
    blocks: [
      { x: 780, y: GROUND_Y - 60, w: 20, h: 120, material: 'wood' },
      { x: 900, y: GROUND_Y - 60, w: 20, h: 120, material: 'wood' },
      { x: 840, y: GROUND_Y - 130, w: 160, h: 20, material: 'wood' },
      { x: 800, y: GROUND_Y - 200, w: 20, h: 120, material: 'wood' },
      { x: 880, y: GROUND_Y - 200, w: 20, h: 120, material: 'wood' },
      { x: 840, y: GROUND_Y - 270, w: 120, h: 20, material: 'wood' }
    ],
    pigs: [
      { x: 840, y: GROUND_Y - 30, r: 22 },
      { x: 840, y: GROUND_Y - 170, r: 22 }
    ]
  },
  {
    name: 'Stone Fortress',
    birds: 4,
    blocks: [
      { x: 720, y: GROUND_Y - 80, w: 30, h: 160, material: 'stone' },
      { x: 950, y: GROUND_Y - 80, w: 30, h: 160, material: 'stone' },
      { x: 835, y: GROUND_Y - 175, w: 260, h: 30, material: 'stone' },
      { x: 780, y: GROUND_Y - 250, w: 20, h: 120, material: 'wood' },
      { x: 890, y: GROUND_Y - 250, w: 20, h: 120, material: 'wood' },
      { x: 835, y: GROUND_Y - 320, w: 140, h: 20, material: 'wood' }
    ],
    pigs: [
      { x: 835, y: GROUND_Y - 30, r: 24 },
      // between the wooden posts (x 790..880), resting on the stone slab
      { x: 812, y: GROUND_Y - 213, r: 20 },
      { x: 858, y: GROUND_Y - 213, r: 20 }
    ]
  },
  {
    name: 'Pig Pyramid',
    birds: 5,
    blocks: [
      { x: 700, y: GROUND_Y - 40, w: 30, h: 80, material: 'wood' },
      { x: 800, y: GROUND_Y - 40, w: 30, h: 80, material: 'stone' },
      { x: 900, y: GROUND_Y - 40, w: 30, h: 80, material: 'stone' },
      { x: 1000, y: GROUND_Y - 40, w: 30, h: 80, material: 'wood' },
      { x: 850, y: GROUND_Y - 95, w: 360, h: 30, material: 'wood' },
      { x: 760, y: GROUND_Y - 175, w: 24, h: 130, material: 'wood' },
      { x: 940, y: GROUND_Y - 175, w: 24, h: 130, material: 'wood' },
      { x: 850, y: GROUND_Y - 250, w: 220, h: 24, material: 'wood' },
      { x: 810, y: GROUND_Y - 310, w: 20, h: 100, material: 'wood' },
      { x: 890, y: GROUND_Y - 310, w: 20, h: 100, material: 'wood' },
      { x: 850, y: GROUND_Y - 370, w: 120, h: 20, material: 'wood' }
    ],
    pigs: [
      { x: 750, y: GROUND_Y - 30, r: 20 },
      { x: 850, y: GROUND_Y - 145, r: 22 },
      { x: 950, y: GROUND_Y - 30, r: 20 },
      // former top pig: now on the lower slab, outside the left post, so it can be hit directly
      { x: 705, y: GROUND_Y - 133, r: 22 }
    ]
  },
  {
    name: 'Twin Towers',
    birds: 4,
    blocks: [
      // left tower
      box(680, G, 16, 100, 'wood'), box(740, G, 16, 100, 'wood'),
      box(710, G - 100, 90, 16, 'wood'),
      box(690, G - 116, 14, 70, 'wood'), box(730, G - 116, 14, 70, 'wood'),
      box(710, G - 186, 70, 14, 'wood'),
      // right tower
      box(940, G, 16, 100, 'wood'), box(1000, G, 16, 100, 'wood'),
      box(970, G - 100, 90, 16, 'wood'),
      box(950, G - 116, 14, 70, 'wood'), box(990, G - 116, 14, 70, 'wood'),
      box(970, G - 186, 70, 14, 'wood')
    ],
    pigs: [pig(710, G - 116, 18), pig(840, G, 22), pig(970, G, 20)]
  },
  {
    name: 'Glass House',
    birds: 4,
    blocks: [
      box(740, G, 16, 100, 'glass'), box(900, G, 16, 100, 'glass'),
      box(820, G - 100, 190, 14, 'glass'),
      box(770, G - 114, 14, 70, 'glass'), box(870, G - 114, 14, 70, 'glass'),
      box(820, G - 184, 130, 14, 'glass'),
      box(1000, G, 14, 60, 'glass'), box(1060, G, 14, 60, 'glass'),
      box(1030, G - 60, 90, 12, 'glass')
    ],
    pigs: [pig(820, G, 22), pig(820, G - 114, 18), pig(1030, G, 18)]
  },
  {
    name: 'Long Bridge',
    birds: 4,
    blocks: [
      box(700, G, 30, 120, 'stone'), box(960, G, 30, 120, 'stone'),
      box(830, G - 120, 300, 16, 'wood'),
      box(700, G - 136, 14, 40, 'wood'), box(960, G - 136, 14, 40, 'wood')
    ],
    pigs: [pig(770, G - 136, 18), pig(830, G - 136, 18), pig(890, G - 136, 18)]
  },
  {
    name: 'Rolling Stones',
    birds: 5,
    blocks: [
      box(760, G, 24, 110, 'stone'), box(940, G, 24, 110, 'stone'),
      box(850, G - 110, 230, 20, 'wood'),
      box(745, G - 130, 12, 30, 'wood'), box(955, G - 130, 12, 30, 'wood'),
      ball(800, G - 130, 18, 'stone'), ball(850, G - 130, 18, 'stone'), ball(900, G - 130, 18, 'stone')
    ],
    pigs: [pig(820, G, 20), pig(880, G, 20), pig(1020, G, 20)]
  },
  {
    name: 'Bunker',
    birds: 5,
    blocks: [
      box(660, G, 20, 110, 'wood'),
      // bunker 1
      box(735, G, 20, 50, 'stone'), box(805, G, 20, 50, 'stone'),
      box(770, G - 50, 110, 18, 'stone'),
      // bunker 2
      box(925, G, 20, 50, 'stone'), box(995, G, 20, 50, 'stone'),
      box(960, G - 50, 110, 18, 'stone'),
      box(960, G - 68, 60, 14, 'wood')
    ],
    pigs: [pig(770, G, 18), pig(960, G, 18), pig(960, G - 82, 16)]
  },
  {
    name: 'Sky Tower',
    birds: 5,
    blocks: [
      box(850, G, 16, 80, 'wood'), box(910, G, 16, 80, 'wood'), box(880, G - 80, 90, 14, 'wood'),
      box(850, G - 94, 16, 80, 'wood'), box(910, G - 94, 16, 80, 'wood'), box(880, G - 174, 90, 14, 'wood'),
      box(850, G - 188, 16, 80, 'wood'), box(910, G - 188, 16, 80, 'wood'), box(880, G - 268, 90, 14, 'wood'),
      box(850, G - 282, 16, 80, 'glass'), box(910, G - 282, 16, 80, 'glass'), box(880, G - 362, 90, 14, 'glass')
    ],
    pigs: [pig(880, G, 18), pig(880, G - 94, 18), pig(880, G - 188, 18), pig(880, G - 376, 16)]
  },
  {
    name: 'Stone Castle',
    birds: 6,
    blocks: [
      box(690, G, 30, 140, 'stone'),
      box(1060, G, 30, 140, 'stone'),
      box(690, G - 140, 44, 16, 'stone'), box(1060, G - 140, 44, 16, 'stone'),
      // keep
      box(830, G, 24, 120, 'stone'), box(920, G, 24, 120, 'stone'),
      box(875, G - 120, 140, 20, 'stone'),
      box(840, G - 140, 14, 60, 'wood'), box(910, G - 140, 14, 60, 'wood'),
      box(875, G - 200, 100, 14, 'wood')
    ],
    pigs: [pig(760, G, 20), pig(875, G, 20), pig(990, G, 20), pig(875, G - 140, 18), pig(875, G - 214, 16)]
  }
];
