// Neon Fist — all tunables live here.
window.NF = window.NF || {};
NF.config = {
  // Character units: the head is 100 units tall, a fighter ~7.5 heads.
  heightRatio: 0.70,        // fighter height as a fraction of the canvas height
  groundRatio: 0.90,        // feet line as a fraction of the canvas height
  versusGap: 0.21,          // each fighter's distance from centre in versus view (fraction of width)
  maxDPR: 2,
  fpsOptions: [60, 30],
  // Idle animation
  breathRate: 0.85,         // breaths per second (fighting-stance breathing is quick)
  bounceRate: 1.7,          // stance bounce per second
  swayDeg: 1.6,
  guardShiftDeg: 4,
  blinkEvery: [2.2, 4.5],   // random seconds between blinks
  blinkTime: 0.13,
  // Pose preview envelope (seconds)
  poseIn: 0.16, poseHold: 0.6, poseOut: 0.42, specialHold: 1.0,
  // Spring physics (cloth, hair)
  physicsStep: 1 / 120,
  gravity: 1700,
  damping: 0.965,
  wind: 90,
  // Lighting
  keyLight: 1.28, shadow: 0.52, farLimb: 0.62,
  outline: 'rgba(6,4,14,0.55)',
  uiAlpha: 0.65
};
