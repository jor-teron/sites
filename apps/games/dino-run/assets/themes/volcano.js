/** Volcano — dark rock with glowing lava cracks, a smouldering volcano, rising embers; lava rocks, flame spouts, fire bats. */
DR.registerTheme(DR.makeTheme({
  id: 'volcano',
  name: 'Volcano',
  pal: {
    skyTop: '#180505', skyBottom: '#61170a', cloud: 'rgba(100,70,70,0.5)', groundLine: '#4a2420', ground: '#1d1412',
    groundTick: 'rgba(255,120,40,0.18)', dino: '#d9c8c0', eye: '#1a0a0a', cactus: '#6b9b5a', bird: '#2b1233', birdWing: '#3b1a45',
    shieldRGB: '251,146,60', barBg: 'rgba(255,255,255,0.12)', barReady: '#fb923c', barCharging: '#4a2420',
    far: '#2c0f0c', mid: '#3c1810', near: '#241010', rock: '#3a2424',
  },
  sunStyle: 'ember', sunX: 0.8, sunY: 0.26, sceneryStyle: 'volcano', cloudStyle: 'smoke', groundStyle: 'lava', fxStyle: 'embers',
  obstacles: { ground: ['lava_rock', 'flame_spout'], air: ['bat'] },
  ui: { bg: '#140505', text: '#ffe8d6', muted: '#d0a490', accent: '#fb923c', card: '#2a0e0a', cardBorder: '#7c2d12' },
}));
