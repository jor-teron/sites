/*
 * AR Theme Game — configuration (ES module).
 * Camera, renderer, theme tunables, pet roster and on-screen text.
 */

/** @typedef {{ id: string, label: string, glb: string|null, preferredHeight: number }} PetDef */

export const AR_GAME_CONFIG = {
  defaultTheme: "pet",
  startScore: 0,
  catchMsgMs: 700,

  // localStorage key for last-chosen pet
  petStorageKey: "ar-game.petId",
  defaultPetId: "ours",

  camera: {
    facingMode: "environment",
    width: 1280,
    height: 720,
  },

  render: {
    maxPixelRatio: 2,
    fov: 60,
    near: 0.1,
    far: 100,
    cameraZ: 6,
    lightSky: 0xffffff,
    lightGround: 0x444444,
    lightIntensity: 1.1,
  },

  // Overlay-mode wander bounds (world units at z≈0, camera at cameraZ)
  overlay: {
    boundX: 2.0,
    boundY: 1.4,
    petSpeed: 1.2,
  },

  // WebXR AR
  xr: {
    petHeightM: 0.25,       // ~25 cm tall in real world
    wanderRadiusM: 1.0,     // stay within 1 m of placement
    wanderSpeedM: 0.35,     // m/s
    reticleOuter: 0.08,
    reticleInner: 0.04,
  },

  /**
   * Pet roster. glb is a path relative to ar-game.html, or null for
   * procedural-only. "ours" prefers assets/models/pet/ours/pet.glb when
   * present, else the procedural cartoon pet.
   * @type {Record<string, PetDef>}
   */
  pets: {
    dog: {
      id: "dog",
      label: "Dog",
      glb: "assets/models/pet/dog/dog.glb",
      preferredHeight: 1.1,
    },
    cat: {
      id: "cat",
      label: "Cat",
      glb: "assets/models/pet/cat/cat.glb",
      preferredHeight: 1.0,
    },
    chicken: {
      id: "chicken",
      label: "Chicken",
      glb: "assets/models/pet/chicken/chicken.glb",
      preferredHeight: 0.9,
    },
    bunny: {
      id: "bunny",
      label: "Bunny",
      glb: "assets/models/pet/bunny/bunny.glb",
      preferredHeight: 1.0,
    },
    ours: {
      id: "ours",
      label: "Ours",
      glb: "assets/models/pet/ours/pet.glb", // optional; falls back to procedural
      preferredHeight: 1.1,
    },
  },

  themes: {
    pet: {
      label: "Pet",               // catch text is built per pet in js/themes/pet.js
    },
    zombie: {
      label: "Zombie",
      catchText: "Zombie down!",   // WebXR fallback (single zombie) catch text
      bestKey: "ar-game.zombieBest",
      lives: 3,
      eyeHeight: 1.6,           // camera height above the virtual floor (m)
      spawnMin: 11,             // spawn distance range (m)
      spawnMax: 15,
      firstWaveSpreadDeg: 60,   // wave 1 spawns within ±this of where you look
      reachDist: 1.1,           // closer than this = it got you (-1 life)
      speed: 0.85,              // base walk speed (m/s)
      speedPerWave: 0.1,        // +10% speed per wave...
      maxSpeedMul: 2.0,         // ...capped at 2x
      baseCount: 3,             // zombies in wave 1
      countPerWave: 2,          // +2 per wave
      maxPerWave: 20,
      firstSpawnDelay: 1.2,     // s after the wave banner
      spawnGap: 1.8,            // s between spawns (shrinks 0.15 s per wave)
      minSpawnGap: 0.6,
      wavePauseSec: 1.5,        // pause after a cleared wave
      hpMin: 2,                 // taps to kill: random 2..3
      hpMax: 3,
      stunSec: 0.35,            // flinch pause per hit
      knockback: 0.35,          // m pushed back per hit
      dragDegPerScreen: 90,     // drag look sensitivity (no gyro)
      hint: "Zombies are coming! Look around and tap them",
      hintMotionTap: "Tap to enable motion controls",
    },
    ghost: {
      label: "Ghost",
      color: 0xecf0f1,
      radius: 0.5,
      opacity: 0.55,
      rangeX: 2.0,
      rangeY: 1.0,
      speedX: 0.7,
      speedY: 0.5,
      fadeMin: 0.25,
      fadeRange: 0.5,
      fadeSpeed: 2,
      catchText: "Ghost found!",

      // Ghost chase (overlay mode, 360° look via gyro or drag)
      chase: {
        distance: 3.5,          // ghost distance from the viewer (world units)
        hitRadius: 0.8,         // invisible tap target radius (easier catching)
        spawnMinDeg: 35,        // spawn this far from where you look...
        spawnMaxDeg: 110,       // ...up to this far (so you usually have to turn)
        pitchMinDeg: -25,       // ghost stays within this vertical band
        pitchMaxDeg: 35,
        wanderDegPerSec: 8,     // idle drift speed
        evadeAngleDeg: 18,      // aim within this angle → ghost slides away
        evadeDegPerSec: 55,     // evade speed at full energy
        evadeMaxDegPerSec: 70,  // hard cap (keeps it catchable)
        dashChance: 0.25,       // chance an evade becomes a dash behind you
        dashDegPerSec: 90,      // dash speed (capped)
        drainPerSec: 0.35,      // energy lost per second of evading
        recoverPerSec: 0.08,    // energy regained per second when not evading
        tiredBelow: 0.25,       // energy below this → tired
        tiredSec: 4,            // tired this long (barely moves), then recovers to 0.6
        dragDegPerScreen: 90,   // drag across the full screen height = this many degrees
      },
    },
  },

  text: {
    cameraBlocked: "Camera blocked. Allow camera and reload.",
    arUnsupported: "AR not supported on this device/browser.",
    arPlace: "Tap a surface to place the pet",
    arCatch: "Tap the pet to catch it",
    ghostHint: "Turn around to find the ghost",
    ghostHintDrag: "Drag to look around and find the ghost",
    ghostMotionTap: "Tap to enable motion controls",
    ghostMotionDenied: "Motion access denied: drag to look around",
  },
};
