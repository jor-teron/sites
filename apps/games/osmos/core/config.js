/* ============================================================
 * File:        core/config.js
 * Project:     Osmos OSM1a
 * Purpose:     Tunables, save key, colours. Classic script.
 * Depends on:  none
 * ============================================================ */
var OSMOS_CONFIG = {
  title: 'Osmos OSM1a',
  fps: 30,
  world: { w: 960, h: 640 },
  player: {
    startMass: 28,
    minMass: 6,
    ejectMass: 0.55,
    ejectImpulse: 52,
    drag: 0.992,
    bounce: 0.72
  },
  absorb: {
    ratio: 0.92,       /* absorb only if other.mass < player.mass * ratio */
    sameReject: 0.35,  /* soft push when similar size */
    largeLoss: 0.18    /* mass lost bumping a larger cell */
  },
  levels: 20,
  saveKey: 'osmos.osm1a.progress',
  themes: [
    { id: 'teal',   bg: '#071018', accent: '#3ce0c8', soft: '#1a6b7a', food: '#6ff0d8', big: '#2a4a68' },
    { id: 'violet', bg: '#0c0818', accent: '#c48cff', soft: '#5a3a8a', food: '#e0b0ff', big: '#3a2a58' },
    { id: 'amber',  bg: '#120c06', accent: '#ffc14a', soft: '#8a5a18', food: '#ffe08a', big: '#5a3a18' }
  ]
};
