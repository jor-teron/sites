/*
 * AR Theme Game — configuration (classic script, loaded first).
 * Camera, renderer, theme tunables and on-screen text.
 * ar-game_logic.js, js/camera.js, js/ar.js and js/themes/*.js read AR_GAME_CONFIG.
 * Colors are hex numbers (0xRRGGBB) as used by Three.js.
 */
const AR_GAME_CONFIG = {
  defaultTheme: "pet",         // theme loaded on start
  startScore: 0,               // initial score
  catchMsgMs: 700,             // how long the catch message stays on screen

  // Camera (getUserMedia) request
  camera: {
    facingMode: "environment", // rear camera when available
    width: 1280,               // ideal capture width
    height: 720,               // ideal capture height
  },

  // Three.js overlay
  render: {
    maxPixelRatio: 2,          // renderer pixel ratio cap
    fov: 60,                   // camera field of view
    near: 0.1,                 // near plane
    far: 100,                  // far plane
    cameraZ: 6,                // camera distance from the play plane
    lightSky: 0xffffff,        // hemisphere light sky color
    lightGround: 0x444444,     // hemisphere light ground color
    lightIntensity: 1.1,       // hemisphere light intensity
  },

  // Theme tunables
  themes: {
    pet: {
      label: "Pet",            // HUD label
      bodyColor: 0xe67e22,     // body sphere
      earColor: 0xd35400,      // ears
      bodyRadius: 0.55,        // body size
      vx: 1.4,                 // horizontal speed
      vy: 1.1,                 // vertical speed
      boundX: 2.4,             // bounce limit x
      boundY: 1.6,             // bounce limit y
      spin: 2,                 // spin speed (rad/s)
      catchText: "Caught the pet!", // message on catch
    },
    zombie: {
      label: "Zombie",
      color: 0x27ae60,         // box color
      size: [0.7, 1.1, 0.5],   // box size
      sway: 1.8,               // side-to-side range
      swaySpeed: 0.8,          // side-to-side speed
      y: -0.4,                 // height
      spin: 0.6,               // spin speed
      catchText: "Zombie down!",
    },
    ghost: {
      label: "Ghost",
      color: 0xecf0f1,         // sphere color
      radius: 0.5,             // sphere size
      opacity: 0.55,           // initial opacity
      rangeX: 2.0,             // drift range x
      rangeY: 1.0,             // drift range y
      speedX: 0.7,             // drift speed x
      speedY: 0.5,             // drift speed y
      fadeMin: 0.25,           // min opacity while pulsing
      fadeRange: 0.5,          // opacity pulse amount
      fadeSpeed: 2,            // pulse speed
      catchText: "Ghost found!",
    },
  },

  // On-screen text
  text: {
    cameraBlocked: "Camera blocked. Allow camera and reload.", // shown if camera fails
  },
};
