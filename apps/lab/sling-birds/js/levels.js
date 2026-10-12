import { GROUND_Y } from './config.js';

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
      { x: 780, y: GROUND_Y - 215, r: 20 },
      { x: 890, y: GROUND_Y - 215, r: 20 }
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
      { x: 850, y: GROUND_Y - 250, w: 220, h: 24, material: 'stone' },
      { x: 810, y: GROUND_Y - 310, w: 20, h: 100, material: 'wood' },
      { x: 890, y: GROUND_Y - 310, w: 20, h: 100, material: 'wood' },
      { x: 850, y: GROUND_Y - 370, w: 120, h: 20, material: 'wood' }
    ],
    pigs: [
      { x: 750, y: GROUND_Y - 30, r: 20 },
      { x: 850, y: GROUND_Y - 145, r: 22 },
      { x: 950, y: GROUND_Y - 30, r: 20 },
      { x: 850, y: GROUND_Y - 290, r: 22 }
    ]
  }
];
