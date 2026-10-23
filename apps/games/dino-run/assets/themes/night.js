/** Night — navy sky, crescent moon, twinkling stars, dunes, and glowing dino eyes. */
DR.registerTheme(DR.makeTheme({
  id: 'night',
  name: 'Night',
  pal: {
    skyTop: '#050b1f', skyBottom: '#10224d', cloud: 'rgba(170,190,255,0.12)', groundLine: '#3d4d85', ground: '#0a1128',
    groundTick: 'rgba(160,180,255,0.16)', dino: '#c3cbe6', eye: '#fde047', cactus: '#3f8f78', bird: '#aab4d4',
    birdWing: '#8793b8', shieldRGB: '165,180,255', barBg: 'rgba(255,255,255,0.12)', barReady: '#a5b4fc',
    barCharging: '#2b3560', far: '#0d1a3d', mid: '#0b1534',
  },
  starStyle: 'twinkle', sunStyle: 'crescent', sunX: 0.78, sunY: 0.3, sceneryStyle: 'dunes', cloudStyle: 'soft',
  eyeGlow: '#fde047',
  obstacles: { ground: ['cactus', 'saguaro'], air: ['bird'] },
  ui: { bg: '#050b1f', text: '#e6ebff', muted: '#97a3d1', accent: '#a5b4fc', card: '#0f1a3a', cardBorder: '#26356b' },
}));
