/**
 * Neon Raid (contra-alpha) — configuration.
 * Player physics, combat, enemies, level layout, colors, keys and text.
 * contra-alpha_logic.js reads everything from CONTRA_ALPHA_CONFIG.
 */
var CONTRA_ALPHA_CONFIG = {
  /* Canvas logical size (must match the <canvas> width/height) */
  width: 960,
  height: 540,

  /* Match */
  defaultDuration: 250,   /* mission length in seconds if the menu value is invalid */
  maxLives: 3,            /* starting lives */
  maxHp: 2,               /* hit points per life */
  maxDt: 0.033,           /* clamp frame delta (s) */

  /* Player */
  player: {
    runSpeed: 220,        /* px/s */
    jumpVel: -520,        /* jump impulse (px/s) */
    gravity: 1400,        /* px/s^2 */
    start: { x: 80, y: 400 }, /* spawn position */
    w: 22,                /* width */
    h: 36,                /* height */
    invulnTime: 1.1,      /* seconds of invulnerability after a hit */
    respawnBack: 80,      /* px moved back on losing a life */
    respawnMinX: 40,      /* never respawn left of this */
    respawnY: 360,        /* y after losing a life or falling */
    fallMargin: 80,       /* falling this far below the canvas hurts */
    cameraLead: 200,      /* camera keeps the player this far from the left edge */
    landTolerance: 8,     /* px tolerance for landing on a platform */
  },

  /* Player bullets */
  bullet: {
    speed: 520,           /* px/s */
    cooldown: 0.16,       /* seconds between shots */
    w: 10, h: 4,          /* size */
    offsetY: 12,          /* spawn y offset from player top */
    backOffset: 8,        /* spawn x offset when facing left */
    despawnMargin: 40,    /* removed this far outside the view */
  },

  /* Enemies */
  enemy: {
    shootCdBase: 1,       /* initial shoot cooldown ... */
    shootCdRandom: 1,     /* ... plus random up to this */
    droneMinX: 200,       /* drones turn around left of this */
    droneEdge: 80,        /* drones turn around this far from level end */
    droneBobSpeed: 3,     /* vertical bob frequency */
    droneBobAmp: 20,      /* vertical bob amount (px/s) */
    turretRange: 520,     /* turrets fire when player is within this x distance */
    turretCooldown: 1.4,  /* seconds between turret shots */
    bulletSpeed: 280,     /* enemy bullet speed */
    bulletW: 8, bulletH: 4, /* enemy bullet size */
    bulletOffsetY: 8,     /* enemy bullet y offset */
    scoreTurret: 250,     /* score for a turret */
    scoreDrone: 100,      /* score for a drone */
  },
  timeBonusPerSecond: 10, /* score bonus per second left on clear */

  /* Level (alpha corridor) */
  level: {
    width: 4200,
    platforms: [
      { x: 0, y: 480, w: 4200, h: 60 },
      { x: 280, y: 380, w: 160, h: 16 },
      { x: 560, y: 320, w: 140, h: 16 },
      { x: 820, y: 380, w: 180, h: 16 },
      { x: 1180, y: 300, w: 200, h: 16 },
      { x: 1500, y: 360, w: 120, h: 16 },
      { x: 1720, y: 280, w: 220, h: 16 },
      { x: 2100, y: 360, w: 160, h: 16 },
      { x: 2400, y: 300, w: 240, h: 16 },
      { x: 2780, y: 380, w: 140, h: 16 },
      { x: 3100, y: 320, w: 200, h: 16 },
      { x: 3480, y: 260, w: 180, h: 16 },
      { x: 3800, y: 360, w: 220, h: 16 }
    ],
    enemies: [
      { kind: "drone", x: 520, y: 250, w: 28, h: 22, hp: 1, vx: 40 },
      { kind: "drone", x: 900, y: 200, w: 28, h: 22, hp: 1, vx: -50 },
      { kind: "turret", x: 1280, y: 276, w: 32, h: 24, hp: 2, vx: 0 },
      { kind: "drone", x: 1600, y: 180, w: 28, h: 22, hp: 1, vx: 55 },
      { kind: "turret", x: 2140, y: 336, w: 32, h: 24, hp: 2, vx: 0 },
      { kind: "drone", x: 2500, y: 160, w: 28, h: 22, hp: 1, vx: -45 },
      { kind: "drone", x: 2850, y: 220, w: 28, h: 22, hp: 1, vx: 40 },
      { kind: "turret", x: 3180, y: 296, w: 32, h: 24, hp: 2, vx: 0 },
      { kind: "drone", x: 3550, y: 140, w: 28, h: 22, hp: 1, vx: -60 },
      { kind: "turret", x: 3920, y: 336, w: 32, h: 24, hp: 3, vx: 0 }
    ],
    /* End gate — reach this to clear before time runs out */
    gate: { x: 4080, y: 360, w: 36, h: 120 }
  },

  /* Colors */
  colors: {
    bg: "#070914",                    /* background */
    grid: "rgba(60,240,255,0.06)",    /* backdrop grid lines */
    gridSpacing: 48,                  /* backdrop grid spacing (px) */
    platform: "#1a2438",              /* platform body */
    platformEdge: "#3cf0ff",          /* platform top edge */
    gate: "#ff3d9a",                  /* end gate */
    gateGlow: "rgba(255,61,154,0.25)",/* gate glow */
    turret: "#ff6b3c",                /* turret enemy */
    drone: "#7cf0ff",                 /* drone enemy */
    bullet: "#fff6a8",                /* player bullets */
    enemyBullet: "#ff4d6d",           /* enemy bullets */
    player: "#3cf0ff",                /* player body */
    playerGun: "#ff3d9a"              /* player gun */
  },

  /* Key bindings — matched against KeyboardEvent.code OR .key.
     Hub / phone controller: D-pad = arrows, A = Space (jump), B = KeyX (fire), X = KeyZ (fire),
     Start = Enter, Select = Escape */
  keys: {
    left: ["ArrowLeft", "KeyA"],
    right: ["ArrowRight", "KeyD"],
    jump: ["ArrowUp", "KeyW", "Space"],
    fire: ["KeyZ", "KeyX", "ControlLeft", "ControlRight"],
    start: ["Enter", "Space"],              /* menu: start · end screen: retry (Start / A) */
    pause: ["Enter", "KeyP"],               /* pause / resume while playing (Start / P) */
    menu: ["Escape"],                       /* back to the menu (Select) */
    preventDefault: ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Enter"] /* keys that must not scroll / click */
  },


  /* On-screen text */
  text: {
    failed: "MISSION FAILED",
    livesLost: "All lives lost.",
    timeExpired: "Time expired.",
    clear: "SECTOR CLEAR",
    paused: "PAUSED — ENTER to resume"
  }
};
