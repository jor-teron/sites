/*
  File: core/assets.js
  Project: Demolisher
  Purpose: Art manifest and loader. Every SVG in assets/ is fetched once at game start into an
  Image, then baked into an offscreen canvas ("sprite") at a resolution that matches the screen,
  so drawing a sprite per frame is a plain drawImage. render.js asks Art.get(key) / Art.has([...])
  and falls back to the old shape drawing for anything not loaded (yet, or at all).
  Plain script (no modules): the global Art object shares one scope with the other core/*.js files.
  Loads before render.js. Needs nothing else; works offline (same-folder SVG files only).
*/

'use strict';

/* Cache-bust tag, same as the ?v= on the scripts in demolisher.html. */
const ART_VERSION = 'DMQ1a';
const ART_DIR = 'assets/';

/* Every sprite key = path under assets/ without ".svg". */
const ART_KEYS = [
  // hero
  'hero/arm',
  'hero/body',
  'hero/head',
  'hero/legs',

  // villain
  'villain/arm',
  'villain/body',
  'villain/cape',
  'villain/head',
  'villain/legs',
  'villain/weapon',

  // enemies
  'enemies/grunt_arm',
  'enemies/grunt_body',
  'enemies/grunt_gun',
  'enemies/grunt_head',
  'enemies/grunt_legs',
  'enemies/scout_arm',
  'enemies/scout_body',
  'enemies/scout_gun',
  'enemies/scout_head',
  'enemies/scout_legs',
  'enemies/trooper_arm',
  'enemies/trooper_body',
  'enemies/trooper_gun',
  'enemies/trooper_head',
  'enemies/trooper_legs',

  // weapons
  'weapons/gun_grenade',
  'weapons/gun_laser',
  'weapons/gun_pistol',
  'weapons/gun_rocket',
  'weapons/proj_bullet',
  'weapons/proj_enemy',
  'weapons/proj_grenade',
  'weapons/proj_laser',
  'weapons/proj_rocket',

  // fx
  'fx/crack_1',
  'fx/crack_2',
  'fx/debris',
  'fx/ember',
  'fx/explosion_fireball',
  'fx/explosion_ring',
  'fx/glow',
  'fx/muzzle_flash',
  'fx/shadow',
  'fx/smoke_puff',
  'fx/spark',

  // env
  'env/gate_bar',
  'env/gate_beam_locked',
  'env/gate_beam_open',
  'env/gate_post_locked',
  'env/gate_post_open',
  'env/target',
  'env/tile_crate',
  'env/tile_dirt_0',
  'env/tile_dirt_1',
  'env/tile_dirt_2',
  'env/tile_grass_side',
  'env/tile_grass_top',
  'env/tile_lava_0',
  'env/tile_lava_1',
  'env/tile_metal_0',
  'env/tile_metal_1',
  'env/tile_stone_0',
  'env/tile_stone_1',
  'env/tile_stone_2',
  'env/tile_target',
  'env/tile_water',
];

/*
  Pivots and anchors in the sprite's own pixels (1 px = 1 world px), for drawing and for
  DMQ1b animation. Parts of a character face right; the renderer mirrors them for left.
    arm   : shoulder joint (rotate the arm about this point; the hand is `hand` px along +x)
    gun   : grip point that sits on the hand
    proj  : point that sits on the projectile position
*/
const ART_PIVOTS = {
  'hero/arm':       { x: 3, y: 3, hand: 13 },
  'enemies/grunt_arm':   { x: 3, y: 3, hand: 10.5 },
  'enemies/trooper_arm': { x: 3, y: 3, hand: 10.5 },
  'enemies/scout_arm':   { x: 3, y: 3, hand: 10.5 },
  'villain/arm':    { x: 5, y: 5, hand: 18 },
  'weapons/gun_pistol':  { x: 4, y: 4 },
  'weapons/gun_rocket':  { x: 9, y: 6 },
  'weapons/gun_grenade': { x: 6, y: 5 },
  'weapons/gun_laser':   { x: 6, y: 5 },
  'enemies/grunt_gun':   { x: 4, y: 4 },
  'enemies/trooper_gun': { x: 4, y: 4 },
  'enemies/scout_gun':   { x: 4, y: 4 },
  'villain/weapon': { x: 6, y: 8 },
  'weapons/proj_bullet':  { x: 5, y: 2 },
  'weapons/proj_rocket':  { x: 11, y: 4.5 },
  'weapons/proj_grenade': { x: 4.6, y: 4.6 },
  'weapons/proj_laser':   { x: 8, y: 3 },
  'weapons/proj_enemy':   { x: 6.4, y: 3.4 },
  'fx/muzzle_flash':      { x: 2, y: 8 }
};

/* Sprite size on screen is the SVG's own width/height in world px. */
const Art = {
  /* key -> { c: canvas, w, h } once baked */
  sprites: {},
  /* key -> Image (kept so a sprite can be re-baked, e.g. after a DPR change) */
  images: {},
  tints: {},
  started: false,
  pending: 0,
  ready: false,       /* true once every file has loaded or failed */
  failed: [],
  /* Bake scale: characters / fx are crisp on retina; tiles are one big world image so capped. */
  scale: 2,
  tileScale: 1,

  load() {
    if (this.started) return;
    this.started = true;
    const dpr = window.devicePixelRatio || 1;
    this.scale = Math.min(3, Math.max(2, Math.ceil(dpr)));
    this.tileScale = dpr > 1.25 ? 1.5 : 1;
    this.pending = ART_KEYS.length;
    for (const key of ART_KEYS) {
      const img = new Image();
      this.images[key] = img;
      img.onload = () => { this.bake(key, img); this.settle(); };
      img.onerror = () => { this.failed.push(key); this.settle(); };
      img.src = ART_DIR + key + '.svg?v=' + ART_VERSION;
    }
  },

  settle() {
    this.pending--;
    if (this.pending <= 0) this.ready = true;
  },

  /* Rasterise the SVG once into a canvas at (scale x its size). */
  bake(key, img) {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) { this.failed.push(key); return; }
    const s = key.indexOf('env/tile_') === 0 || key.indexOf('fx/crack') === 0 ? this.tileScale : this.scale;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * s));
    c.height = Math.max(1, Math.round(h * s));
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, c.width, c.height);
    this.sprites[key] = { c, w, h };
  },

  get(key) { return this.sprites[key] || null; },

  /* True when every key (string or array) is baked. */
  has(keys) {
    if (typeof keys === 'string') return !!this.sprites[keys];
    for (let i = 0; i < keys.length; i++) if (!this.sprites[keys[i]]) return false;
    return true;
  },

  /* All terrain tile textures baked? (drawTerrain switches to the textured world then). */
  tilesReady() {
    if (this._tiles) return true;
    if (!this.ready) return false;
    this._tiles = this.has(ART_TILE_KEYS);
    return this._tiles;
  },

  /* Grey sprite multiplied by a colour (spark, ember, debris, smoke). Cached per key + colour. */
  tint(key, color) {
    const id = key + '|' + color;
    let t = this.tints[id];
    if (t) return t;
    const s = this.sprites[key];
    if (!s) return null;
    const c = document.createElement('canvas');
    c.width = s.c.width;
    c.height = s.c.height;
    const g = c.getContext('2d');
    g.drawImage(s.c, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(s.c, 0, 0);
    t = { c, w: s.w, h: s.h };
    this.tints[id] = t;
    return t;
  }
};

/* Terrain tile textures needed before the textured world is used. */
const ART_TILE_KEYS = [
  'env/tile_dirt_0', 'env/tile_dirt_1', 'env/tile_dirt_2', 'env/tile_grass_top', 'env/tile_grass_side',
  'env/tile_stone_0', 'env/tile_stone_1', 'env/tile_stone_2', 'env/tile_crate',
  'env/tile_metal_0', 'env/tile_metal_1', 'env/tile_lava_0', 'env/tile_lava_1',
  'env/tile_water', 'env/tile_target', 'fx/crack_1', 'fx/crack_2'
];
