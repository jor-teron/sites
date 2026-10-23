/*
  File: core/state.js
  Project: Demolisher
  Purpose: Shared constants and handles: Matter aliases, CONFIG aliases, material and weapon tables, canvas / touch-layer handles, camera / view variables, the Matter engine.
  Plain script (no modules): top-level const / let / function share one global scope with the
  other core/*.js files, loaded in the order listed in demolisher.html.
*/

'use strict';

/* Matter pieces used by the sim. Engine drives contacts. Bodies are player and enemies. */
const { Engine, Composite, Bodies, Body, Events } = Matter;

/* ============================================================
   CONFIG (from core/config.js)
   ============================================================ */
const CFG = DEMOLISHER_CONFIG;
const TX = CFG.text;
const RUMBLE = CFG.rumble || {};
const APP = CFG.APP || { name: 'Demolisher', version: '' };
/* Numbered levels come from core/seed.js / core/levels.js (plain scripts, loaded first). */
const SEED = DemolisherSeed;
const LEVELS = DemolisherLevels;
if (APP.name && !document.title.startsWith(APP.name)) document.title = APP.name;   // keeps the page title label (e.g. "Demolisher DMR1c")
const fmt = (t, o) => String(t).replace(/\{(\w+)\}/g, (m, k) => (o && o[k] !== undefined ? o[k] : m));

const WORLD_W = CFG.world.width;
const WORLD_H = CFG.world.height;
const TILE = CFG.world.tile;
const GRID_W = Math.ceil(WORLD_W / TILE);
const GRID_H = Math.ceil(WORLD_H / TILE);
const GRAVITY = CFG.world.gravity;
const PLAYER_W = CFG.player.w;
const PLAYER_H = CFG.player.h;
const PLAYER_SPEED = CFG.player.speed;
const PLAYER_JUMP = CFG.player.jump;
const MAX_HP = CFG.player.maxHp;
/* Fixed sim step in seconds. Render stays on requestAnimationFrame. */
const FIXED_DT = 1 / 60;
const CHUNK = CFG.world.chunk;
const MAX_CHUNK_REBUILDS = CFG.world.maxChunkRebuilds;
/* Material ids. Zero is empty. */
const MAT = { AIR: 0, DIRT: 1, GRASS: 2, STONE: 3, WATER: 4, CRATE: 5, METAL: 6, LAVA: 7, TARGET: 8 };
const MAT_NAMES = { 1: 'dirt', 2: 'grass', 3: 'stone', 4: 'water', 5: 'crate', 6: 'metal', 7: 'lava', 8: 'target' };
/* Per-material paint and durability. solid false means no chunk body. */
const MAT_INFO = {};
for (const id in MAT_NAMES) MAT_INFO[id] = CFG.materials[MAT_NAMES[id]];
/* Weapon table (name added from the key). */
const WEAPON_ORDER = CFG.weaponOrder;
const WEAPONS = {};
for (const k of WEAPON_ORDER) WEAPONS[k] = Object.assign({ name: k }, CFG.weapons[k]);
function startAmmo() {
  const a = {};
  for (const k of WEAPON_ORDER) a[k] = WEAPONS[k].ammo === undefined ? Infinity : WEAPONS[k].ammo;
  return a;
}

/* ============================================================
   DOM
   ============================================================ */

/* Main view. */
const canvas = document.getElementById('game');
/* 2D context. Device pixel ratio is applied in resize. */
const ctx = canvas.getContext('2d');
/* Stage box used to size the canvas. */
const stage = document.getElementById('stage');
/* Touch control layer. */
const mobileCtrls = document.getElementById('mobile-controls');
/* Move stick. */
const joyMove = document.getElementById('joy-move');
/* Move stick knob. */
const joyMoveKnob = document.getElementById('joy-move-knob');
/* Aim stick. */
const joyAim = document.getElementById('joy-aim');
/* Aim stick knob. */
const joyAimKnob = document.getElementById('joy-aim-knob');
/* Touch fire. */
const btnFire = document.getElementById('btn-fire');
/* Touch jump. */
const btnJump = document.getElementById('btn-jump');
/* Pause button (top-right of the stage). */
const btnPause = document.getElementById('btn-pause');

/* ============================================================
   VIEW
   ============================================================ */

/* CSS pixel width of the canvas. */
let CW = 0;
/* CSS pixel height of the canvas. */
let CH = 0;
/* Visible world width. Matches CW so 1 world pixel is 1 CSS pixel. */
let VIEW_W = 800;
/* Visible world height. */
let VIEW_H = 500;
/* Camera left in world pixels. */
let camX = 0;
/* Camera top in world pixels. */
let camY = 0;

/*
  Size the canvas to the stage and the device pixel ratio.
  View size in world units stays equal to CSS pixels.
*/
function resize() {
  const rect = stage.getBoundingClientRect();
  CW = Math.max(40, Math.floor(rect.width));
  CH = Math.max(40, Math.floor(rect.height));
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(CW * dpr);
  canvas.height = Math.floor(CH * dpr);
  canvas.style.width = CW + 'px';
  canvas.style.height = CH + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  VIEW_W = CW;
  VIEW_H = CH;
}

/* ============================================================
   ENGINE
   ============================================================ */

/* Matter engine. Gravity set once. Reset does not call Engine.clear. */
const engine = Engine.create();
engine.gravity.y = GRAVITY;
