/* ============================================================
 * File:        core/config.js
 * Project:     Osmos OSM1d
 * Purpose:     Tunables, save key, colours, level-band notes.
 * Depends on:  none
 *
 * Level index bands (0 .. levels-1 inclusive = 0 .. 39):
 *   00–19  OSM1a calm absorb / eject (unchanged seeds & layout)
 *   20–27  gentle attraction wells (rings; soft core mass tick)
 *   28–33  directional currents (slow fluid drift + wisps)
 *   34–39  soft membrane walls / marked passive hazard cells
 * No AI, chasing, targeting, or brain code anywhere.
 * ============================================================ */
var OSMOS_CONFIG = {
  title: 'Osmos OSM1d',
  fps: 30,
  world: { w: 960, h: 640 },
  player: {
    startMass: 28,
    minMass: 6,
    /* OSM1d: no passive drag. Coast until eject / wall / field. */
    ejectMassFrac: 0.01,   /* ~1% of current mass per shove */
    ejectMassMin: 0.12,
    ejectRelSpeed: 140,    /* relative speed of expelled blob (world units/s) */
    maxSpeed: 160,         /* soft coast cap — no braking drag */
    bounce: 0.72
  },
  absorb: {
    ratio: 0.92,
    sameReject: 0.35,
    largeLoss: 0.18
  },
  /* Total playable levels: indices 0 .. 39 (40 levels). */
  levels: 40,
  classicLevels: 20,
  saveKey: 'osmos.osm1a.progress',
  wells: {
    pull: 38,
    coreMassPerSec: 1.1,
    coreSafeMassFloor: 10
  },
  currents: {
    speed: 28
  },
  membranes: {
    bounce: 0.55,
    thickness: 14
  },
  themes: [
    { id: 'teal',   bg: '#071018', accent: '#3ce0c8', soft: '#1a6b7a', food: '#6ff0d8', big: '#2a4a68' },
    { id: 'violet', bg: '#0c0818', accent: '#c48cff', soft: '#5a3a8a', food: '#e0b0ff', big: '#3a2a58' },
    { id: 'amber',  bg: '#120c06', accent: '#ffc14a', soft: '#8a5a18', food: '#ffe08a', big: '#5a3a18' },
    { id: 'mint',   bg: '#061410', accent: '#7dffb0', soft: '#2a6a48', food: '#b8ffd4', big: '#1e4a38' }
  ]
};
